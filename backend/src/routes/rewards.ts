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

const CLAIM_COOLDOWN_HOURS = 24;
const STREAK_RESET_HOURS = 24;

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
  seconds_since_claim: number | null;
}

interface BalanceRow extends RowDataPacket {
  balance: number;
}

/**
 * GET /api/rewards/daily — статус ежедневной награды.
 * Возвращает: доступна ли, текущая серия, время до следующей, шкалу наград.
 * Все вычисления времени — на стороне MySQL (серверное время).
 */
router.get('/daily', isAuthenticated, async (req, res) => {
  try {
    const steamid = req.user!.steamid;

    const [rows] = await webPool.query<DailyRewardRow[]>(
      `SELECT last_claimed_at, current_streak, longest_streak, total_claims,
              TIMESTAMPDIFF(SECOND, last_claimed_at, NOW()) AS seconds_since_claim
       FROM daily_rewards WHERE steamid = ?`,
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
    const secondsSinceClaim = row.seconds_since_claim ?? null;
    const cooldownSeconds = CLAIM_COOLDOWN_HOURS * 3600;
    const available = secondsSinceClaim === null || secondsSinceClaim >= cooldownSeconds;
    const secondsUntilAvailable = available
      ? 0
      : cooldownSeconds - secondsSinceClaim!;

    const wouldResetStreak =
      secondsSinceClaim !== null && secondsSinceClaim >= STREAK_RESET_HOURS * 3600;
    const effectiveStreak = wouldResetStreak ? 0 : row.current_streak;
    const nextDay = effectiveStreak + 1;
    const isRandom = nextDay > REWARD_FIRST_WEEK.length;
    const nextReward = isRandom ? null : REWARD_FIRST_WEEK[nextDay - 1];

    res.json({
      available,
      current_streak: effectiveStreak,
      longest_streak: row.longest_streak,
      total_claims: row.total_claims,
      next_reward: nextReward,
      is_random: isRandom,
      seconds_until_available: Math.max(0, Math.ceil(secondsUntilAvailable)),
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
 * - Серверное время: NOW() на стороне MySQL
 * - Нет пользовательского ввода: нечего инъектировать
 */
router.post('/daily/claim', sensitiveRateLimiter, isAuthenticated, async (req, res) => {
  const connection = await webPool.getConnection();
  try {
    const steamid = req.user!.steamid;

    await connection.beginTransaction();

    // Получаем или создаём запись (FOR UPDATE блокирует строку до COMMIT)
    const [rows] = await connection.query<DailyRewardRow[]>(
      `SELECT last_claimed_at, current_streak, longest_streak, total_claims,
              TIMESTAMPDIFF(SECOND, last_claimed_at, NOW()) AS seconds_since_claim
       FROM daily_rewards WHERE steamid = ? FOR UPDATE`,
      [steamid]
    );

    let currentStreak: number;
    let longestStreak: number;
    let totalClaims: number;

    if (rows.length === 0) {
      // Первый вход — создаём запись
      currentStreak = 1;
      longestStreak = 1;
      totalClaims = 1;

      await connection.query<ResultSetHeader>(
        `INSERT INTO daily_rewards (steamid, last_claimed_at, current_streak, longest_streak, total_claims)
         VALUES (?, NOW(), ?, ?, ?)`,
        [steamid, currentStreak, longestStreak, totalClaims]
      );
    } else {
      const row = rows[0];
      const secondsSinceClaim = row.seconds_since_claim;
      const cooldownSeconds = CLAIM_COOLDOWN_HOURS * 3600;

      // Проверяем кулдаун (серверное время)
      if (secondsSinceClaim !== null && secondsSinceClaim < cooldownSeconds) {
        await connection.rollback();
        const remaining = cooldownSeconds - secondsSinceClaim;
        return res.status(429).json({
          error: 'Награда ещё недоступна',
          seconds_until_available: Math.ceil(remaining),
        });
      }

      // Серия: если прошло < 24ч — продолжаем, иначе сбрасываем
      const streakBroken =
        secondsSinceClaim !== null && secondsSinceClaim >= STREAK_RESET_HOURS * 3600;
      currentStreak = streakBroken ? 1 : row.current_streak + 1;
      longestStreak = Math.max(row.longest_streak, currentStreak);
      totalClaims = row.total_claims + 1;

      await connection.query(
        `UPDATE daily_rewards
         SET last_claimed_at = NOW(),
             current_streak = ?,
             longest_streak = ?,
             total_claims = ?
         WHERE steamid = ?`,
        [currentStreak, longestStreak, totalClaims, steamid]
      );
    }

    const rewardAmount = getRewardAmount(currentStreak);

    // Начисляем монеты в баланс
    await connection.query(
      `INSERT INTO player_balance (steamid, balance, total_earned, total_spent)
       VALUES (?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE balance = balance + ?, total_earned = total_earned + ?`,
      [steamid, rewardAmount, rewardAmount, rewardAmount, rewardAmount]
    );

    // Аудит-лог в таблицу транзакций
    await connection.query(
      `INSERT INTO transactions (steamid, type, amount, description)
       VALUES (?, 'earn', ?, ?)`,
      [steamid, rewardAmount, `Ежедневная награда (день ${currentStreak})`]
    );

    await connection.commit();

    // Получаем обновлённый баланс
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
