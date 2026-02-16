import mysql from 'mysql2/promise';

// Connection pool for the main website database
export const webPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dragonlost_web',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Connection pool for the Rust game database (read-only)
export const rustPool = mysql.createPool({
  host: process.env.RUST_DB_HOST || 'localhost',
  port: parseInt(process.env.RUST_DB_PORT || '3306'),
  user: process.env.RUST_DB_USER || 'root',
  password: process.env.RUST_DB_PASSWORD || '',
  database: process.env.RUST_DB_NAME || 'rust',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
