const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const fetch = require('node-fetch');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const SHOP_UPLOADS_DIR = path.resolve(__dirname, '../uploads/shop');

function ensureUploads() {
  fs.mkdirSync(SHOP_UPLOADS_DIR, { recursive: true });
}

function sanitizeBaseName(input) {
  return String(input || 'item')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'item';
}

function stripFileExtension(fileName) {
  return String(fileName || '').replace(/\.[a-z0-9]+$/i, '');
}

function buildLocalImageIndex() {
  const byName = new Map();
  const byStem = new Map();

  if (!fs.existsSync(SHOP_UPLOADS_DIR)) {
    return { byName, byStem };
  }

  const entries = fs.readdirSync(SHOP_UPLOADS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fileName = entry.name;
    const normalizedName = sanitizeBaseName(fileName);
    const dbPath = `/uploads/shop/${fileName}`;
    byName.set(normalizedName, dbPath);

    const stem = sanitizeBaseName(stripFileExtension(fileName));
    if (stem && !byStem.has(stem)) {
      byStem.set(stem, dbPath);
    }
  }

  return { byName, byStem };
}

function resolveLocalImageByCode(imageIndex, itemCode) {
  if (!itemCode) return null;
  return imageIndex.byName.get(itemCode) || imageIndex.byStem.get(itemCode) || null;
}

function extensionByContentType(contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('image/webp')) return '.webp';
  if (ct.includes('image/jpeg')) return '.jpg';
  if (ct.includes('image/svg+xml')) return '.svg';
  if (ct.includes('image/gif')) return '.gif';
  return '.png';
}

async function downloadImage(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Referer': 'https://rustlabs.com/',
    },
    timeout: 15000,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const buffer = await response.buffer();
  return { buffer, contentType };
}

async function main() {
  ensureUploads();
  const localImageIndex = buildLocalImageIndex();

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'dragonlost_web',
    waitForConnections: true,
    connectionLimit: 5,
  });

  const [rows] = await pool.query(
    'SELECT id, rust_item_code, image_url FROM shop_items ORDER BY id ASC'
  );

  if (!rows.length) {
    console.log('shop_items пуста, обновлять нечего.');
    await pool.end();
    return;
  }

  const downloadedByCode = new Map();
  let converted = 0;
  let unresolved = 0;
  let failed = 0;

  for (const row of rows) {
    const id = row.id;
    const itemCode = sanitizeBaseName(row.rust_item_code || `item_${id}`);
    const originalUrl = row.image_url ? String(row.image_url).trim() : '';

    let dbPath = null;
    const localByCode = resolveLocalImageByCode(localImageIndex, itemCode);

    if (localByCode) {
      dbPath = localByCode;
      downloadedByCode.set(itemCode, dbPath);
    } else if (downloadedByCode.has(itemCode)) {
      dbPath = downloadedByCode.get(itemCode);
    } else if (originalUrl.startsWith('/uploads/shop/')) {
      const localName = path.basename(originalUrl);
      const localFile = path.join(SHOP_UPLOADS_DIR, localName);
      if (fs.existsSync(localFile)) {
        dbPath = `/uploads/shop/${localName}`;
        downloadedByCode.set(itemCode, dbPath);
      } else {
        unresolved += 1;
      }
    } else if (originalUrl.startsWith('http://') || originalUrl.startsWith('https://')) {
      try {
        const { buffer, contentType } = await downloadImage(originalUrl);
        const ext = extensionByContentType(contentType);
        const fileName = `${itemCode}${ext}`;
        fs.writeFileSync(path.join(SHOP_UPLOADS_DIR, fileName), buffer);
        dbPath = `/uploads/shop/${fileName}`;
        downloadedByCode.set(itemCode, dbPath);
      } catch (error) {
        failed += 1;
        unresolved += 1;
        console.warn(`Не удалось скачать [id=${id}] ${originalUrl}: ${error.message}`);
      }
    } else {
      unresolved += 1;
    }

    await pool.query('UPDATE shop_items SET image_url = ? WHERE id = ?', [dbPath, id]);
    converted += 1;
  }

  await pool.end();

  console.log(`Готово. Обработано: ${converted}`);
  console.log(`Без локальной картинки: ${unresolved}`);
  console.log(`Ошибок скачивания: ${failed}`);
  console.log(`Папка изображений: ${SHOP_UPLOADS_DIR}`);
}

main().catch((error) => {
  console.error('Скрипт завершился с ошибкой:', error);
  process.exit(1);
});
