import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const itemsPath = path.join(__dirname, 'tmp-rust-items.json');
const shopPngDir = path.join(root, 'uploads', 'shop');

function sqlString(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

const pngs = fs
  .readdirSync(shopPngDir)
  .filter((f) => f.endsWith('.png') && f !== 'placeholder.png');
const codes = pngs.map((f) => f.replace(/\.png$/i, ''));

const raw = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
const byShort = new Map();
for (const it of raw) {
  if (it.shortname && it.Description != null) {
    byShort.set(it.shortname, it.Description);
  }
}

/** PNG / rust_item_code → shortname в Rust-Items.json (если отличается) */
const SHORTNAME_ALIASES = {
  military_flamethrower: 'military flamethrower',
  'weapon.mod.16x.scope': 'weapon.mod.8x.scope',
};

const lines = [
  '-- Миграция: описания shop_items из данных предметов Rust (SzyMig/Rust-item-list-JSON)',
  '-- Запуск: mysql -u ... -p dragonlost_web < backend/database/migrations/010-shop-items-descriptions.sql',
  '',
  'USE dragonlost_web;',
  '',
];

const missing = [];
for (const code of codes.sort()) {
  const jsonKey = SHORTNAME_ALIASES[code] ?? code;
  const desc = byShort.get(jsonKey);
  if (!desc) {
    missing.push(code);
    continue;
  }
  lines.push(
    `UPDATE shop_items SET description = ${sqlString(desc)} WHERE rust_item_code = ${sqlString(code)};`
  );
}

if (missing.length) {
  lines.push('', '-- Нет описания в Rust-Items.json для shortname:');
  for (const m of missing) lines.push(`-- ${m}`);
}

fs.writeFileSync(
  path.join(root, 'database', 'migrations', '010-shop-items-descriptions.sql'),
  lines.join('\n') + '\n',
  'utf8'
);

console.log('Updated:', codes.length - missing.length, 'missing:', missing.length);
if (missing.length) console.log(missing.join(', '));
