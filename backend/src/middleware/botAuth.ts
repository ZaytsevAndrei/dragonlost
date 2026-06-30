import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const BOT_API_KEY_HEADER = 'x-bot-api-key';

export function botAuth(req: Request, res: Response, next: NextFunction): void {
  const configuredKey = process.env.BOT_API_KEY?.trim();
  if (!configuredKey) {
    console.error('[BotAPI] BOT_API_KEY не задан');
    res.status(503).json({ error: 'Bot API недоступен' });
    return;
  }

  const headerKey = req.headers[BOT_API_KEY_HEADER] as string | undefined;
  if (!headerKey || headerKey.length !== configuredKey.length) {
    res.status(401).json({ error: 'Неверный API-ключ' });
    return;
  }

  const isValid = crypto.timingSafeEqual(
    Buffer.from(headerKey, 'utf8'),
    Buffer.from(configuredKey, 'utf8'),
  );
  if (!isValid) {
    res.status(401).json({ error: 'Неверный API-ключ' });
    return;
  }

  next();
}
