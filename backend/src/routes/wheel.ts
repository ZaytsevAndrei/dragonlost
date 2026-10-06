import { Router } from 'express';
import { RowDataPacket } from 'mysql2';
import { webPool } from '../config/database';
import { isAuthenticated } from '../middleware/auth';
import { sensitiveRateLimiter } from '../middleware/rateLimiter';
import { getFreshSteamNickname, getSteamProfiles } from '../services/steamProfile';
import {
  FORTUNE_WHEEL_COOLDOWN_HOURS,
  FORTUNE_WHEEL_NICKNAME_TAG,
  FORTUNE_WHEEL_RECENT_WINS_LIMIT,
  rollPrizeQuantity,
  rollWeightedPrize,
  type FortuneWheelRarity,
} from '../constants/fortuneWheel';

const router = Router();

interface WheelPrizeRow extends RowDataPacket {
  id: number;
  name: string;
  wheel_label: string;
  description: string | null;
  category: string;
  rarity: FortuneWheelRarity;
  rust_item_code: string;
  quantity: number;
  quantity_max: number | null;
  image_url: string | null;
  weight: number;
  is_active: number;
  sort_order: number;
}

interface WheelPlayerRow extends RowDataPacket {
  tag_verified_at: Date | null;
  last_spin_at: Date | null;
  total_spins: number;
  seconds_until_available: number | null;
}

interface WheelSpinRow extends RowDataPacket {
  steamid: string;
  prize_name: string;
  prize_image_url: string | null;
  prize_rarity: FortuneWheelRarity;
  created_at: Date;
}

/** Порядок секторов колеса: sort_order, затем id. Индекс в этом списке = номер сектора. */
const PRIZE_SELECT = `
  SELECT id, name, wheel_label, description, category, rarity, rust_item_code, quantity, quantity_max, image_url, weight, is_active, sort_order
  FROM wheel_prizes
  WHERE is_active = 1
  ORDER BY sort_order ASC, id ASC`;

const PLAYER_SELECT = `
  SELECT tag_verified_at, last_spin_at, total_spins,
         TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), last_spin_at + INTERVAL ${FORTUNE_WHEEL_COOLDOWN_HOURS} HOUR) AS seconds_until_available
  FROM wheel_players
  WHERE steamid = ?`;

async function fetchPrizes(): Promise<WheelPrizeRow[]> {
  const [rows] = await webPool.query<WheelPrizeRow[]>(PRIZE_SELECT);
  return rows;
}

function prizeChancePercent(weight: number, totalWeight: number): number {
  if (totalWeight <= 0) return 0;
  return Math.round((Number(weight) / totalWeight) * 1000) / 10;
}

/** Живая проверка метки в нике Steam. Возвращает ник или null, если Steam недоступен. */
async function verifyNicknameTag(steamid: string): Promise<{ ok: boolean; nickname: string | null }> {
  const nickname = await getFreshSteamNickname(steamid);
  if (nickname === null) return { ok: false, nickname: null };
  const hasTag = nickname.toLowerCase().includes(FORTUNE_WHEEL_NICKNAME_TAG);
  return { ok: hasTag, nickname };
}

/**
 * GET /api/wheel/prizes — активные призы с шансами (публично, для страницы колеса).
 */
router.get('/prizes', async (_req, res) => {
  try {
    const prizes = await fetchPrizes();
    const totalWeight = prizes.reduce((sum, prize) => sum + Number(prize.weight), 0);

    res.json({
      cooldown_hours: FORTUNE_WHEEL_COOLDOWN_HOURS,
      nickname_tag: FORTUNE_WHEEL_NICKNAME_TAG,
      prizes: prizes.map((prize, index) => ({
        id: prize.id,
        name: prize.name,
        wheel_label: prize.wheel_label,
        description: prize.description,
        category: prize.category,
        rarity: prize.rarity,
        quantity: Number(prize.quantity),
        quantity_max: prize.quantity_max === null ? null : Number(prize.quantity_max),
        image_url: prize.image_url,
        chance_percent: prizeChancePercent(prize.weight, totalWeight),
        sector_index: index,
      })),
    });
  } catch (error) {
    console.error('Error fetching wheel prizes:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Не удалось загрузить призы' });
  }
});

/**
 * GET /api/wheel/recent-wins — лента последних выигрышей (публично).
 */
router.get('/recent-wins', async (_req, res) => {
  try {
    const [rows] = await webPool.query<WheelSpinRow[]>(
      'SELECT steamid, prize_name, prize_image_url, prize_rarity, created_at FROM wheel_spins ORDER BY id DESC LIMIT ?',
      [FORTUNE_WHEEL_RECENT_WINS_LIMIT]
    );

    const profiles = await getSteamProfiles(rows.map((row) => row.steamid));

    res.json({
      wins: rows.map((row) => ({
        player_name: profiles.get(row.steamid)?.personaname ?? 'Игрок',
        player_avatar: profiles.get(row.steamid)?.avatarfull ?? '',
        prize_name: row.prize_name,
        prize_image_url: row.prize_image_url,
        prize_rarity: row.prize_rarity,
        created_at: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching recent wheel wins:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Не удалось загрузить последние выигрыши' });
  }
});

/**
 * GET /api/wheel/status — состояние игрока: метка, кулдаун, всего спинов.
 */
router.get('/status', isAuthenticated, async (req, res) => {
  try {
    const steamid = req.user!.steamid;
    const [rows] = await webPool.query<WheelPlayerRow[]>(PLAYER_SELECT, [steamid]);

    if (rows.length === 0) {
      return res.json({
        available: true,
        seconds_until_available: 0,
        tag_verified: false,
        total_spins: 0,
      });
    }

    const row = rows[0];
    const secondsUntilAvailable = Math.max(0, Math.ceil(Number(row.seconds_until_available) || 0));

    res.json({
      available: secondsUntilAvailable === 0,
      seconds_until_available: secondsUntilAvailable,
      tag_verified: row.tag_verified_at !== null,
      total_spins: row.total_spins,
    });
  } catch (error) {
    console.error('Error fetching wheel status:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Не удалось получить статус колеса' });
  }
});

/**
 * POST /api/wheel/check-tag — проверить метку в актуальном нике Steam.
 */
router.post('/check-tag', sensitiveRateLimiter, isAuthenticated, async (req, res) => {
  try {
    const steamid = req.user!.steamid;
    const { ok, nickname } = await verifyNicknameTag(steamid);

    if (nickname === null) {
      return res.status(502).json({ error: 'Steam не ответил. Попробуйте ещё раз через минуту.' });
    }

    await webPool.query(
      `INSERT INTO wheel_players (steamid, tag_verified_at) VALUES (?, IF(?, UTC_TIMESTAMP(), NULL))
       ON DUPLICATE KEY UPDATE tag_verified_at = IF(?, UTC_TIMESTAMP(), NULL)`,
      [steamid, ok ? 1 : 0, ok ? 1 : 0]
    );

    res.json({ tag_verified: ok, nickname });
  } catch (error) {
    console.error('Error checking wheel nickname tag:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Не удалось проверить ник. Попробуйте позже.' });
  }
});

/**
 * POST /api/wheel/spin — крутить колесо (раз в 24 часа, метка в нике обязательна).
 * Приз попадает в player_inventory со статусом pending — забирается в игре как покупка,
 * поэтому крутить можно и не находясь на сервере.
 */
router.post('/spin', sensitiveRateLimiter, isAuthenticated, async (req, res) => {
  const connection = await webPool.getConnection();
  try {
    const steamid = req.user!.steamid;

    const { ok, nickname } = await verifyNicknameTag(steamid);
    if (nickname === null) {
      return res.status(502).json({ error: 'Steam не ответил. Попробуйте ещё раз через минуту.' });
    }
    if (!ok) {
      await connection.query(
        'UPDATE wheel_players SET tag_verified_at = NULL WHERE steamid = ?',
        [steamid]
      );
      return res.status(403).json({
        error: `В нике Steam нет метки «${FORTUNE_WHEEL_NICKNAME_TAG}». Добавьте её и попробуйте снова.`,
        tag_verified: false,
        nickname,
      });
    }

    const prizes = await fetchPrizes();
    if (prizes.length === 0) {
      return res.status(503).json({ error: 'Призы временно недоступны' });
    }

    await connection.beginTransaction();

    // Гарантируем строку игрока до блокировки, чтобы параллельные спины не падали на дубле ключа.
    await connection.query(
      'INSERT IGNORE INTO wheel_players (steamid) VALUES (?)',
      [steamid]
    );

    const [playerRows] = await connection.query<WheelPlayerRow[]>(
      `${PLAYER_SELECT} FOR UPDATE`,
      [steamid]
    );
    const player = playerRows[0];

    const secondsUntilAvailable = Math.max(0, Math.ceil(Number(player?.seconds_until_available) || 0));
    if (player && secondsUntilAvailable > 0) {
      await connection.rollback();
      return res.status(429).json({
        error: 'Колесо уже крутилось недавно',
        seconds_until_available: secondsUntilAvailable,
      });
    }

    const prize = rollWeightedPrize(prizes);
    const quantity = rollPrizeQuantity(prize);
    const sectorIndex = prizes.findIndex((candidate) => candidate.id === prize.id);
    const totalSpins = Number(player?.total_spins ?? 0) + 1;

    await connection.query(
      `INSERT INTO wheel_spins (steamid, prize_id, prize_name, prize_image_url, prize_rarity)
       VALUES (?, ?, ?, ?, ?)`,
      [steamid, prize.id, quantity > 1 ? `${prize.name} ×${quantity}` : prize.name, prize.image_url, prize.rarity]
    );

    await connection.query(
      `INSERT INTO player_inventory (steamid, shop_item_id, wheel_prize_id, quantity, status)
       VALUES (?, NULL, ?, ?, 'pending')`,
      [steamid, prize.id, quantity]
    );

    await connection.query(
      `UPDATE wheel_players
       SET tag_verified_at = UTC_TIMESTAMP(),
           last_spin_at = UTC_TIMESTAMP(),
           total_spins = ?
       WHERE steamid = ?`,
      [totalSpins, steamid]
    );

    await connection.commit();

    res.json({
      success: true,
      prize: {
        id: prize.id,
        name: prize.name,
        description: prize.description,
        rarity: prize.rarity,
        image_url: prize.image_url,
        quantity,
      },
      wheel_sector_index: sectorIndex,
      total_spins: totalSpins,
      seconds_until_available: FORTUNE_WHEEL_COOLDOWN_HOURS * 3600,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error spinning fortune wheel:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Ошибка при вращении колеса' });
  } finally {
    connection.release();
  }
});

export default router;
