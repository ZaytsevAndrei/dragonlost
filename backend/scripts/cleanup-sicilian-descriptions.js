const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'dragonlost_web',
    waitForConnections: true,
    connectionLimit: 3,
  });

  try {
    const [result] = await pool.query(
      'UPDATE shop_items SET description = NULL WHERE description LIKE ?',
      ['Импорт с SicilianRust%']
    );
    console.log(`Очищено описаний: ${result.affectedRows}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Ошибка очистки:', error.message);
  process.exit(1);
});
