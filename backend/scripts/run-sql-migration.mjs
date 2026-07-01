/**
 * Выполняет .sql-миграцию построчно (каждый оператор отдельно).
 * Обходит ограничение DBeaver/JDBC: один запрос = один оператор.
 *
 * Использование из backend/:
 *   node scripts/run-sql-migration.mjs database/migrations/014-telegram-bot.sql
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const relPath = process.argv[2];
if (!relPath) {
  console.error('Укажите путь к .sql: node scripts/run-sql-migration.mjs database/migrations/014-telegram-bot.sql');
  process.exit(1);
}

const sqlPath = path.resolve(backendRoot, relPath);
if (!fs.existsSync(sqlPath)) {
  console.error(`Файл не найден: ${sqlPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(sqlPath, 'utf8');

/** Убирает однострочные комментарии -- ... */
function stripComments(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

/** Разбивает на операторы по «;» в конце строки/файла */
function splitStatements(sql) {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const statements = splitStatements(stripComments(raw));
console.log(`Миграция: ${relPath} (${statements.length} операторов)`);

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dragonlost_web',
});

try {
  for (let i = 0; i < statements.length; i++) {
    const preview = statements[i].replace(/\s+/g, ' ').slice(0, 72);
    console.log(`[${i + 1}/${statements.length}] ${preview}...`);
    await conn.query(statements[i]);
  }
  console.log('Готово.');
} catch (err) {
  console.error('Ошибка:', err.message);
  process.exit(1);
} finally {
  await conn.end();
}
