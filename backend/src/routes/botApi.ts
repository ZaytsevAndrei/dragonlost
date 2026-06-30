import { Router } from 'express';
import { botAuth } from '../middleware/botAuth';
import { sensitiveRateLimiter } from '../middleware/rateLimiter';
import {
  claimTelegramBonus,
  getTelegramBotStatus,
  linkTelegramAccount,
  mapTelegramServiceError,
} from '../services/telegramBonus';

const router = Router();

router.use(botAuth);
router.use(sensitiveRateLimiter);

router.post('/link', async (req, res) => {
  try {
    const telegramId = Number(req.body?.telegram_id);
    const code = String(req.body?.code ?? '');
    const telegramUsername = req.body?.telegram_username ?? null;

    if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
      return res.status(400).json({ error: 'Некорректный telegram_id' });
    }

    const result = await linkTelegramAccount({
      telegramId,
      code,
      telegramUsername: telegramUsername ? String(telegramUsername) : null,
    });

    return res.json({
      success: true,
      steamid: result.steamid,
      username: result.username,
    });
  } catch (error) {
    const mapped = mapTelegramServiceError(error);
    return res.status(mapped.status).json({ error: mapped.message });
  }
});

router.post('/bonus/claim', async (req, res) => {
  try {
    const telegramId = Number(req.body?.telegram_id);
    if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
      return res.status(400).json({ error: 'Некорректный telegram_id' });
    }

    const result = await claimTelegramBonus(telegramId);
    return res.json({ success: true, ...result });
  } catch (error) {
    const mapped = mapTelegramServiceError(error);
    return res.status(mapped.status).json({
      error: mapped.message,
      seconds_until_available: mapped.seconds_until_available,
    });
  }
});

router.get('/status/:telegramId', async (req, res) => {
  try {
    const telegramId = Number(req.params.telegramId);
    if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
      return res.status(400).json({ error: 'Некорректный telegram_id' });
    }

    const status = await getTelegramBotStatus(telegramId);
    return res.json(status);
  } catch (error) {
    console.error('Error fetching bot status:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Не удалось получить статус' });
  }
});

export default router;
