import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { sensitiveRateLimiter } from '../middleware/rateLimiter';
import {
  createTelegramLinkCode,
  getTelegramLinkStatus,
  mapTelegramServiceError,
} from '../services/telegramBonus';

const router = Router();

router.get('/status', isAuthenticated, async (req, res) => {
  try {
    const steamid = req.user!.steamid;
    const status = await getTelegramLinkStatus(steamid);
    return res.json(status);
  } catch (error) {
    console.error('Error fetching telegram status:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Не удалось получить статус Telegram' });
  }
});

router.post('/link-code', sensitiveRateLimiter, isAuthenticated, async (req, res) => {
  try {
    const steamid = req.user!.steamid;
    const result = await createTelegramLinkCode(steamid);
    const status = await getTelegramLinkStatus(steamid);
    return res.json({
      ...result,
      bot_username: status.bot_username,
    });
  } catch (error) {
    const mapped = mapTelegramServiceError(error);
    return res.status(mapped.status).json({ error: mapped.message });
  }
});

export default router;
