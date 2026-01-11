import mysql from 'mysql2/promise';

// Main website database connection
export const createWebConnection = async () => {
  return await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'dragonlost_web',
  });
};

// Rust game database connection (read-only)
export const createRustConnection = async () => {
  return await mysql.createConnection({
    host: process.env.RUST_DB_HOST || 'localhost',
    port: parseInt(process.env.RUST_DB_PORT || '3306'),
    user: process.env.RUST_DB_USER || 'root',
    password: process.env.RUST_DB_PASSWORD || '',
    database: process.env.RUST_DB_NAME || 'rust',
  });
};

// Create connection pool for better performance
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
