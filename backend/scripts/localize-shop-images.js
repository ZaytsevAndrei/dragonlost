const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const fetch = require('node-fetch');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const SHOP_UPLOADS_DIR = path.resolve(__dirname, '../uploads/shop');
const PLACEHOLDER_NAME = 'placeholder.svg';
const PLACEHOLDER_DB_PATH = `/uploads/shop/${PLACEHOLDER_NAME}`;

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#223244"/>
      <stop offset="100%" stop-color="#121a24"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="36" fill="url(#g)"/>
  <g fill="none" stroke="#8fb4d8" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity="0.95">
    <rect x="96" y="116" width="320" height="280" rx="18"/>
    <circle cx="176" cy="196" r="24"/>
    <path d="M416 326L316 236L212 340L168 296L96 368"/>
  </g>
  <text x="256" y="452" text-anchor="middle" fill="#d6e7f7" font-family="Arial, sans-serif" font-size="32">NO IMAGE</text>
</svg>
`;

function ensureUploads() {
  fs.mkdirSync(SHOP_UPLOADS_DIR, { recursive: true });
  const placeholderPath = path.join(SHOP_UPLOADS_DIR, PLACEHOLDER_NAME);
  if (!fs.existsSync(placeholderPath)) {
    fs.writeFileSync(placeholderPath, PLACEHOLDER_SVG, 'utf8');
  }
}

function sanitizeBaseName(input) {
  return String(input || 'item')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'item';
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
  let placeholders = 0;
  let failed = 0;

  for (const row of rows) {
    const id = row.id;
    const itemCode = sanitizeBaseName(row.rust_item_code || `item_${id}`);
    const originalUrl = row.image_url ? String(row.image_url).trim() : '';

    let dbPath = PLACEHOLDER_DB_PATH;

    if (downloadedByCode.has(itemCode)) {
      dbPath = downloadedByCode.get(itemCode);
    } else if (originalUrl.startsWith('/uploads/shop/')) {
      const localName = path.basename(originalUrl);
      const localFile = path.join(SHOP_UPLOADS_DIR, localName);
      if (fs.existsSync(localFile)) {
        dbPath = `/uploads/shop/${localName}`;
        downloadedByCode.set(itemCode, dbPath);
      } else {
        placeholders += 1;
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
        placeholders += 1;
        console.warn(`Не удалось скачать [id=${id}] ${originalUrl}: ${error.message}`);
      }
    } else {
      placeholders += 1;
    }

    await pool.query('UPDATE shop_items SET image_url = ? WHERE id = ?', [dbPath, id]);
    converted += 1;
  }

  await pool.end();

  console.log(`Готово. Обработано: ${converted}`);
  console.log(`Placeholder назначен: ${placeholders}`);
  console.log(`Ошибок скачивания: ${failed}`);
  console.log(`Папка изображений: ${SHOP_UPLOADS_DIR}`);
}

main().catch((error) => {
  console.error('Скрипт завершился с ошибкой:', error);
  process.exit(1);
});
