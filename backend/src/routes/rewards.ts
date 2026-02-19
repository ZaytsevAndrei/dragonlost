import { Router } from 'express';
import { webPool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { isAuthenticated } from '../middleware/auth';
import { sensitiveRateLimiter } from '../middleware/rateLimiter';

const router = Router();

/**
 * Шкала наград по дням серии (streak).
 * Дни 1-7: фиксированные суммы.
 * С 8-го дня: случайный выбор из REWARD_RANDOM_POOL (взвешенная вероятность).
 */
const REWARD_FIRST_WEEK = [5, 10, 15, 20, 30, 40, 50];

/** Пул случайных наград с 8-го дня. Сумма chance = 100. */
const REWARD_RANDOM_POOL = [
  { amount: 20, chance: 40 },
  { amount: 30, chance: 30 },
  { amount: 40, chance: 20 },
  { amount: 50, chance: 10 },
];

/**
 * Для дней 1-7 возвращает фиксированную награду.
 * С 8-го дня — случайную по весам из REWARD_RANDOM_POOL.
 * Рандом генерируется на сервере (crypto.getRandomValues), клиент не влияет.
 */
function getRewardAmount(streak: number): number {
  if (streak <= 0) return REWARD_FIRST_WEEK[0];
  if (streak <= REWARD_FIRST_WEEK.length) return REWARD_FIRST_WEEK[streak - 1];
  return rollRandomReward();
}

function rollRandomReward(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  const roll = arr[0] % 100;
  let cumulative = 0;
  for (const entry of REWARD_RANDOM_POOL) {
    cumulative += entry.chance;
    if (roll < cumulative) return entry.amount;
  }
  return REWARD_RANDOM_POOL[REWARD_RANDOM_POOL.length - 1].amount;
}

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

/**
 * Отсчёт дня — по московскому времени (UTC+3, без DST).
 * Вся арифметика дат ведётся через UTC_TIMESTAMP(), чтобы не зависеть
 * от настройки time_zone на сервере MySQL.
 *
 * SQL-выражения:
 *   moscow_today   = DATE(UTC_TIMESTAMP() + INTERVAL 3 HOUR)
 *   claim_msk_date = DATE(last_claimed_at + INTERVAL 3 HOUR)
 *   days_diff      = DATEDIFF(moscow_today, claim_msk_date)
 *   seconds_until_reset = секунд до следующей полуночи МСК
 */
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

/**
 * GET /api/rewards/daily — статус ежедневной награды.
 * Отсчёт дня начинается в 00:00 по московскому времени.
 */
router.get('/daily', isAuthenticated, async (req, res) => {
  try {
    const steamid = req.user!.steamid;

    const [rows] = await webPool.query<DailyRewardRow[]>(
      DAILY_REWARD_SELECT,
      [steamid]
    );

    if (rows.length === 0) {
      return res.json({
        available: true,
        current_streak: 0,
        longest_streak: 0,
        total_claims: 0,
        next_reward: REWARD_FIRST_WEEK[0],
        is_random: false,
        seconds_until_available: 0,
        reward_first_week: REWARD_FIRST_WEEK,
        reward_random_pool: REWARD_RANDOM_POOL,
      });
    }

    const row = rows[0];
    const daysDiff = row.days_diff;

    const available = daysDiff === null || daysDiff >= 1;

    const wouldResetStreak = daysDiff === null || daysDiff >= 2;
    const effectiveStreak = wouldResetStreak ? 0 : row.current_streak;

    const nextDay = effectiveStreak + 1;
    const isRandom = nextDay > REWARD_FIRST_WEEK.length;
    const nextReward = isRandom ? null : REWARD_FIRST_WEEK[nextDay - 1];

    const secondsUntilAvailable = available
      ? 0
      : Math.max(0, Math.ceil(row.seconds_until_reset));

    res.json({
      available,
      current_streak: effectiveStreak,
      longest_streak: row.longest_streak,
      total_claims: row.total_claims,
      next_reward: nextReward,
      is_random: isRandom,
      seconds_until_available: secondsUntilAvailable,
      reward_first_week: REWARD_FIRST_WEEK,
      reward_random_pool: REWARD_RANDOM_POOL,
    });
  } catch (error) {
    console.error('Error fetching daily reward status:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Не удалось получить статус награды' });
  }
});

/**
 * POST /api/rewards/daily/claim — забрать ежедневную награду.
 *
 * Безопасность:
 * - isAuthenticated: проверка сессии
 * - sensitiveRateLimiter: 30 req / 15 min (защита от скриптов)
 * - CSRF: глобальный middleware (X-CSRF-Token)
 * - FOR UPDATE: блокировка строки в транзакции (anti-double-claim)
 * - Серверное время: UTC_TIMESTAMP() на стороне MySQL
 * - Нет пользовательского ввода: нечего инъектировать
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

    const rewardAmount = getRewardAmount(currentStreak);

    await connection.query(
      `INSERT INTO player_balance (steamid, balance, total_earned, total_spent)
       VALUES (?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE balance = balance + ?, total_earned = total_earned + ?`,
      [steamid, rewardAmount, rewardAmount, rewardAmount, rewardAmount]
    );

    await connection.query(
      `INSERT INTO transactions (steamid, type, amount, description)
       VALUES (?, 'earn', ?, ?)`,
      [steamid, rewardAmount, `Ежедневная награда (день ${currentStreak})`]
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
