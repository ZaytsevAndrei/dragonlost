import { Router } from 'express';
import { webPool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { isAuthenticated } from '../middleware/auth';
import { sensitiveRateLimiter } from '../middleware/rateLimiter';
import {
  DAILY_REWARD_WHEEL_SECTORS,
  DAILY_REWARD_WHEEL_SUMMARY,
  rollDailyRewardWheel,
} from '../constants/dailyRewardWheel';

const router = Router();

interface DailyRewardRow extends RowDataPacket {
  last_claimed_at: Date | null;
  current_streak: number;
  longest_streak: number;
  total_claims: number;
  days_diff: number | null;
  seconds_until_reset: number;
}

interface BalanceRow extends RowDataPacket {
  balance: number;
}

const DAILY_REWARD_SELECT = `
  SELECT last_claimed_at, current_streak, longest_streak, total_claims,
         DATEDIFF(
           DATE(UTC_TIMESTAMP() + INTERVAL 3 HOUR),
           DATE(last_claimed_at + INTERVAL 3 HOUR)
         ) AS days_diff,
         TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(),
           DATE(UTC_TIMESTAMP() + INTERVAL 3 HOUR) + INTERVAL 1 DAY - INTERVAL 3 HOUR
         ) AS seconds_until_reset
  FROM daily_rewards WHERE steamid = ?`;

function wheelPayload() {
  return {
    wheel_sectors: [...DAILY_REWARD_WHEEL_SECTORS],
    wheel_summary: DAILY_REWARD_WHEEL_SUMMARY,
  };
}

/**
 * GET /api/rewards/daily — статус ежедневной награды (колесо 25 секторов).
 */
router.get('/daily', isAuthenticated, async (req, res) => {
  try {
    const steamid = req.user!.steamid;

    const [rows] = await webPool.query<DailyRewardRow[]>(DAILY_REWARD_SELECT, [steamid]);

    if (rows.length === 0) {
      return res.json({
        available: true,
        current_streak: 0,
        longest_streak: 0,
        total_claims: 0,
        seconds_until_available: 0,
        ...wheelPayload(),
      });
    }

    const row = rows[0];
    const daysDiff = row.days_diff;
    const available = daysDiff === null || daysDiff >= 1;
    const wouldResetStreak = daysDiff === null || daysDiff >= 2;
    const effectiveStreak = wouldResetStreak ? 0 : row.current_streak;

    const secondsUntilAvailable = available
      ? 0
      : Math.max(0, Math.ceil(row.seconds_until_reset));

    res.json({
      available,
      current_streak: effectiveStreak,
      longest_streak: row.longest_streak,
      total_claims: row.total_claims,
      seconds_until_available: secondsUntilAvailable,
      ...wheelPayload(),
    });
  } catch (error) {
    console.error('Error fetching daily reward status:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Не удалось получить статус награды' });
  }
});

/**
 * POST /api/rewards/daily/claim — крутить колесо и забрать награду.
 */
router.post('/daily/claim', sensitiveRateLimiter, isAuthenticated, async (req, res) => {
  const connection = await webPool.getConnection();
  try {
    const steamid = req.user!.steamid;

    await connection.beginTransaction();

    const [rows] = await connection.query<DailyRewardRow[]>(
      `${DAILY_REWARD_SELECT} FOR UPDATE`,
      [steamid]
    );

    let currentStreak: number;
    let longestStreak: number;
    let totalClaims: number;

    if (rows.length === 0) {
      currentStreak = 1;
      longestStreak = 1;
      totalClaims = 1;

      await connection.query<ResultSetHeader>(
        `INSERT INTO daily_rewards (steamid, last_claimed_at, current_streak, longest_streak, total_claims)
         VALUES (?, UTC_TIMESTAMP(), ?, ?, ?)`,
        [steamid, currentStreak, longestStreak, totalClaims]
      );
    } else {
      const row = rows[0];
      const daysDiff = row.days_diff;

      if (daysDiff !== null && daysDiff === 0) {
        await connection.rollback();
        return res.status(429).json({
          error: 'Награда уже получена сегодня',
          seconds_until_available: Math.max(0, Math.ceil(row.seconds_until_reset)),
        });
      }

      const streakContinues = daysDiff === 1;
      currentStreak = streakContinues ? row.current_streak + 1 : 1;
      longestStreak = Math.max(row.longest_streak, currentStreak);
      totalClaims = row.total_claims + 1;

      await connection.query(
        `UPDATE daily_rewards
         SET last_claimed_at = UTC_TIMESTAMP(),
             current_streak = ?,
             longest_streak = ?,
             total_claims = ?
         WHERE steamid = ?`,
        [currentStreak, longestStreak, totalClaims, steamid]
      );
    }

    const { sectorIndex, amount: rewardAmount } = rollDailyRewardWheel();

    await connection.query(
      `INSERT INTO player_balance (steamid, balance, total_earned, total_spent)
       VALUES (?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE balance = balance + ?, total_earned = total_earned + ?`,
      [steamid, rewardAmount, rewardAmount, rewardAmount, rewardAmount]
    );

    await connection.query(
      `INSERT INTO transactions (steamid, type, amount, description)
       VALUES (?, 'earn', ?, ?)`,
      [steamid, rewardAmount, `Ежедневная награда — колесо (день ${currentStreak}, сектор ${sectorIndex + 1})`]
    );

    await connection.commit();

    const [balanceRows] = await connection.query<BalanceRow[]>(
      'SELECT balance FROM player_balance WHERE steamid = ?',
      [steamid]
    );
    const newBalance = balanceRows.length > 0 ? Number(balanceRows[0].balance) : rewardAmount;

    res.json({
      success: true,
      reward: rewardAmount,
      wheel_sector_index: sectorIndex,
      current_streak: currentStreak,
      longest_streak: longestStreak,
      new_balance: newBalance,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error claiming daily reward:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Ошибка при получении награды' });
  } finally {
    connection.release();
  }
});

export default router;
