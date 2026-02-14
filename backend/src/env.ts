// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

if (process.env.NODE_ENV === 'development') {
  console.log('Environment variables loaded');
}
