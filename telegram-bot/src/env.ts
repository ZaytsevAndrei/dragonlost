import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envCandidates = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../backend/.env'),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

export function getBotApiKey(): string {
  return process.env.BOT_API_KEY?.trim() || '';
}

export function getApiUrl(): string {
  return (process.env.API_URL || 'http://127.0.0.1:5000/api').replace(/\/$/, '');
}

export function getTelegramBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
}

export function getSiteUrl(): string {
  return (process.env.SITE_URL || 'https://dragonlost.ru').replace(/\/$/, '');
}
