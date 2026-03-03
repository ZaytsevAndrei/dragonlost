const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const fetch = require('node-fetch');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const SOURCE_URL = 'https://sicilianrust.ru/shop';
const SOURCE_ORIGIN = 'https://sicilianrust.ru';
const UPLOADS_DIR = path.resolve(__dirname, '../uploads/shop');
const PLACEHOLDER_PATH = '/uploads/shop/placeholder.svg';

function decodeHtmlEntities(str) {
  return String(str)
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeWhitespace(input) {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

function sanitizeToken(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function shortHash(value) {
  return crypto.createHash('md5').update(String(value)).digest('hex').slice(0, 8);
}

function mapCategory(rawCategory) {
  const source = normalizeWhitespace(rawCategory);
  const map = {
    'Оружие': 'weapon',
    'Боеприпасы': 'ammo',
    'Модули': 'module',
    'Одежда': 'armor',
    'Инструменты': 'tool',
    'Ресурсы': 'resource',
    'Конструкции': 'construction',
    'Электричество': 'electricity',
    'Компоненты': 'component',
    'Прочее': 'misc',
    'Еда': 'food',
    'Медикаменты': 'medical',
    'Услуги': 'services',
  };
  return map[source] || 'resource';
}

function guessRustItemCode(name, imageUrl, category) {
  try {
    const url = new URL(imageUrl);
    const base = decodeURIComponent(path.basename(url.pathname, path.extname(url.pathname)));
    const candidate = sanitizeToken(base);
    if (candidate) return candidate;
  } catch {
    // Ignore parse errors and fallback below
  }

  const fromName = sanitizeToken(name);
  const categoryToken = sanitizeToken(category) || 'item';
  return fromName || `${categoryToken}_${shortHash(name)}`;
}

async function fetchProducts() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    timeout: 20000,
  });

  if (!response.ok) {
    throw new Error(`Не удалось открыть ${SOURCE_URL}: HTTP ${response.status}`);
  }

  const html = await response.text();
  const match = html.match(/data-page="([^"]+)"/);
  if (!match) {
    throw new Error('Не найден data-page на странице магазина');
  }

  const pageDataRaw = decodeHtmlEntities(match[1]);
  const pageData = JSON.parse(pageDataRaw);
  const rawItems = Array.isArray(pageData?.props?.items) ? pageData.props.items : [];

  if (rawItems.length === 0) {
    throw new Error('Список товаров на сайте пуст или не найден');
  }

  const normalized = rawItems
    .map((item) => {
      const name = normalizeWhitespace(item?.name || item?.title || item?.product_name);
      const price = Number(item?.price || item?.cost || item?.sum || 0);
      const categoryLabel = normalizeWhitespace(
        item?.category?.name || item?.category?.title || item?.category || item?.group || 'Прочее'
      );
      const imageRaw = String(item?.image || item?.image_url || item?.img || '').trim();
      const imageUrl = imageRaw
        ? (imageRaw.startsWith('http://') || imageRaw.startsWith('https://')
          ? imageRaw
          : new URL(imageRaw, SOURCE_ORIGIN).toString())
        : '';

      if (!name || !Number.isFinite(price) || price <= 0) {
        return null;
      }

      return {
        name,
        price,
        sourceCategory: categoryLabel || 'Прочее',
        category: mapCategory(categoryLabel),
        imageUrl,
      };
    })
    .filter(Boolean);

  const dedup = new Map();
  for (const item of normalized) {
    const key = `${item.name}|${item.price}|${item.sourceCategory}|${item.imageUrl}`;
    if (!dedup.has(key)) {
      dedup.set(key, item);
    }
  }

  return Array.from(dedup.values());
}

async function downloadImage(url, filePath) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: SOURCE_ORIGIN,
    },
    timeout: 20000,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const buffer = await response.buffer();
  fs.writeFileSync(filePath, buffer);
}

function buildFallbackUrl(folder, rustCodeBase) {
  const encoded = encodeURIComponent(rustCodeBase).replace(/%2E/gi, '.');
  return `${SOURCE_ORIGIN}/images/${folder}/${encoded}.png`;
}

async function main() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const items = await fetchProducts();
  const imageCache = new Map();

  const rowsForDb = [];
  let imageDownloaded = 0;
  let imageFailed = 0;

  for (const item of items) {
    const rustCodeBase = guessRustItemCode(item.name, item.imageUrl, item.category);
    let rustItemCode = rustCodeBase;
    let imageDbPath = PLACEHOLDER_PATH;

    const cacheKey = item.imageUrl || `fallback:${rustCodeBase}`;
    if (cacheKey) {
      if (imageCache.has(cacheKey)) {
        imageDbPath = imageCache.get(cacheKey);
      } else {
        const candidateUrls = [];
        if (item.imageUrl) {
          candidateUrls.push(item.imageUrl);
        }
        candidateUrls.push(buildFallbackUrl('items', rustCodeBase));
        candidateUrls.push(buildFallbackUrl('products', rustCodeBase));

        let downloaded = false;
        let lastError = null;

        for (const candidateUrl of candidateUrls) {
          try {
            const parsed = new URL(candidateUrl);
            const ext = path.extname(parsed.pathname) || '.png';
            const filename = `${rustCodeBase}_${shortHash(candidateUrl)}${ext}`;
            const localPath = path.join(UPLOADS_DIR, filename);
            await downloadImage(candidateUrl, localPath);
            imageDbPath = `/uploads/shop/${filename}`;
            imageCache.set(cacheKey, imageDbPath);
            imageDownloaded += 1;
            downloaded = true;
            break;
          } catch (error) {
            lastError = error;
          }
        }

        if (!downloaded) {
          imageFailed += 1;
          imageDbPath = PLACEHOLDER_PATH;
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`Не удалось загрузить картинку для "${item.name}": ${lastError ? lastError.message : 'unknown error'}`);
          }
        }
      }
    }

    if (!rustItemCode) {
      rustItemCode = `item_${shortHash(`${item.name}-${item.price}`)}`;
    }

    rowsForDb.push({
      name: item.name,
      description: null,
      category: item.category,
      price: item.price,
      rust_item_code: rustItemCode,
      quantity: 1,
      image_url: imageDbPath,
    });
  }

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'dragonlost_web',
    waitForConnections: true,
    connectionLimit: 5,
  });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM shop_items');

    const insertSql = `
      INSERT INTO shop_items
      (name, description, category, price, rust_item_code, quantity, image_url, is_available)
      VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
    `;

    for (const row of rowsForDb) {
      await connection.query(insertSql, [
        row.name,
        row.description,
        row.category,
        row.price,
        row.rust_item_code,
        row.quantity,
        row.image_url,
      ]);
    }

    await connection.commit();

    const [countRows] = await connection.query('SELECT COUNT(*) AS cnt FROM shop_items');
    console.log(`Импорт завершён. Товаров в БД: ${countRows[0].cnt}`);
    console.log(`Скачано изображений: ${imageDownloaded}`);
    console.log(`Ошибок загрузки изображений: ${imageFailed}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Ошибка импорта:', error.message);
  process.exit(1);
});
