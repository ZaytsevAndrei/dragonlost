const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const fetch = require('node-fetch');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const SHOP_UPLOADS_DIR = path.resolve(__dirname, '../uploads/shop');

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

function extensionByContentType(contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('image/webp')) return '.webp';
  if (ct.includes('image/jpeg')) return '.jpg';
  if (ct.includes('image/svg+xml')) return '.svg';
  if (ct.includes('image/gif')) return '.gif';
  return '.png';
}

function buildLocalImageIndex() {
  const byStem = new Map();
  const byName = new Map();

  if (!fs.existsSync(SHOP_UPLOADS_DIR)) {
    fs.mkdirSync(SHOP_UPLOADS_DIR, { recursive: true });
    return { byStem, byName };
  }

  const entries = fs.readdirSync(SHOP_UPLOADS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fileName = entry.name;
    const dbPath = `/uploads/shop/${fileName}`;
    const normalizedName = sanitizeBaseName(fileName);
    const normalizedStem = sanitizeBaseName(stripFileExtension(fileName));
    byName.set(normalizedName, dbPath);
    if (normalizedStem && !byStem.has(normalizedStem)) {
      byStem.set(normalizedStem, dbPath);
    }
  }

  return { byStem, byName };
}

async function downloadImage(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: 'https://rustlabs.com/',
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

function buildAliasCandidates(itemCode) {
  const code = sanitizeBaseName(itemCode);
  const candidates = [];

  const stripped = code
    .replace(/\.hv$/i, '')
    .replace(/\.fire$/i, '')
    .replace(/\.slug$/i, '')
    .replace(/\.incendiary$/i, '')
    .replace(/\.explosive$/i, '');
  if (stripped && stripped !== code) candidates.push(stripped);

  if (code.startsWith('ammo.pistol')) candidates.push('pistol.semiauto');
  if (code.includes('scope')) candidates.push('weapon.mod.lasersight');
  if (code.startsWith('sicilian_icons_')) candidates.push('keycard_blue');

  return Array.from(new Set(candidates));
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'dragonlost_web',
    waitForConnections: true,
    connectionLimit: 5,
  });

  const [missingRows] = await pool.query(
    `
      SELECT rust_item_code, COUNT(*) AS rows_count
      FROM shop_items
      WHERE image_url IS NULL OR TRIM(image_url) = ''
      GROUP BY rust_item_code
      ORDER BY rust_item_code
    `
  );

  const codes = missingRows.map((row) => String(row.rust_item_code));
  const localIndex = buildLocalImageIndex();
  const missingCodes = codes.filter((code) => !localIndex.byStem.has(sanitizeBaseName(code)));
  console.log(`Кодов без image_url: ${codes.length}`);
  console.log(`Кодов без локального файла: ${missingCodes.length}`);

  const downloaded = [];
  const aliased = [];
  const failed = [];

  for (const code of missingCodes) {
    const normalizedCode = sanitizeBaseName(code);
    const rustLabsUrl = `https://rustlabs.com/img/items180/${normalizedCode}.png`;

    try {
      const { buffer, contentType } = await downloadImage(rustLabsUrl);
      const ext = extensionByContentType(contentType);
      const fileName = `${normalizedCode}${ext}`;
      fs.writeFileSync(path.join(SHOP_UPLOADS_DIR, fileName), buffer);
      const dbPath = `/uploads/shop/${fileName}`;
      localIndex.byStem.set(normalizedCode, dbPath);
      downloaded.push({ code, dbPath, source: rustLabsUrl });
      continue;
    } catch {
      // fallback to alias below
    }

    const aliasCandidates = buildAliasCandidates(code);
    let aliasPath = null;
    for (const alias of aliasCandidates) {
      const found = localIndex.byStem.get(alias);
      if (found) {
        aliasPath = found;
        break;
      }
    }

    if (aliasPath) {
      aliased.push({ code, dbPath: aliasPath });
    } else {
      failed.push(code);
    }
  }

  for (const item of downloaded) {
    await pool.query(
      "UPDATE shop_items SET image_url = ? WHERE rust_item_code = ? AND (image_url IS NULL OR TRIM(image_url) = '')",
      [item.dbPath, item.code]
    );
  }

  for (const item of aliased) {
    await pool.query(
      "UPDATE shop_items SET image_url = ? WHERE rust_item_code = ? AND (image_url IS NULL OR TRIM(image_url) = '')",
      [item.dbPath, item.code]
    );
  }

  const [remainingRows] = await pool.query(
    `
      SELECT rust_item_code, COUNT(*) AS rows_count
      FROM shop_items
      WHERE image_url IS NULL OR TRIM(image_url) = ''
      GROUP BY rust_item_code
      ORDER BY rust_item_code
    `
  );

  const remainingCodes = remainingRows.map((row) => String(row.rust_item_code));

  console.log('--- Итог ---');
  console.log(`Скачано новых иконок: ${downloaded.length}`);
  console.log(`Привязано через аналоги: ${aliased.length}`);
  console.log(`Осталось без image_url: ${remainingCodes.length} кодов`);
  if (failed.length > 0) {
    console.log('Коды, которые не удалось закрыть:');
    for (const code of failed) {
      console.log(`- ${code}`);
    }
  }

  await pool.end();
}

main().catch((error) => {
  console.error('Скрипт завершился с ошибкой:', error);
  process.exit(1);
});
