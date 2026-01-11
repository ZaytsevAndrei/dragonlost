// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Optional: Log to verify env vars are loaded (remove in production)
if (process.env.NODE_ENV === 'development') {
  console.log('✅ Environment variables loaded');
  console.log('DB_HOST:', process.env.DB_HOST);
  console.log('DB_USER:', process.env.DB_USER);
  console.log('DB_NAME:', process.env.DB_NAME);
  console.log('RUST_DB_HOST:', process.env.RUST_DB_HOST);
}
