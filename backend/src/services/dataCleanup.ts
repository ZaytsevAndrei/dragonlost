import cron from 'node-cron';
import { webPool } from '../config/database';

const DATA_RETENTION_YEARS = 3;

/**
 * Удаляет истёкшие сессии из таблицы sessions.
 * Поле `expires` хранит UNIX timestamp (секунды).
 */
async function cleanExpiredSessions(): Promise<number> {
  const [result] = await webPool.query(
    'DELETE FROM sessions WHERE expires < UNIX_TIMESTAMP(NOW())'
  );
  return (result as { affectedRows: number }).affectedRows;
}

/**
 * Удаляет транзакции старше DATA_RETENTION_YEARS лет.
 */
async function cleanOldTransactions(): Promise<number> {
  const [result] = await webPool.query(
    'DELETE FROM transactions WHERE created_at < DATE_SUB(NOW(), INTERVAL ? YEAR)',
    [DATA_RETENTION_YEARS]
  );
  return (result as { affectedRows: number }).affectedRows;
}

/**
 * Удаляет записи daily_rewards для пользователей, неактивных более DATA_RETENTION_YEARS лет.
 * Ретенция ПДн: не храним данные дольше необходимого (152-ФЗ).
 */
async function cleanStaleDailyRewards(): Promise<number> {
  const [result] = await webPool.query(
    `DELETE dr FROM daily_rewards dr
     INNER JOIN users u ON dr.steamid = u.steamid
     WHERE u.last_login < DATE_SUB(NOW(), INTERVAL ? YEAR)
       AND (dr.last_claimed_at IS NULL OR dr.last_claimed_at < DATE_SUB(NOW(), INTERVAL ? YEAR))`,
    [DATA_RETENTION_YEARS, DATA_RETENTION_YEARS]
  );
  return (result as { affectedRows: number }).affectedRows;
}

/**
 * Запускает полный цикл очистки устаревших данных.
 */
function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function runCleanup(): Promise<void> {
  console.log('🧹 [Cleanup] Начинается очистка устаревших данных...');
  try {
    const sessions = await cleanExpiredSessions();
    await yieldEventLoop();
    const transactions = await cleanOldTransactions();
    await yieldEventLoop();
    const dailyRewards = await cleanStaleDailyRewards();

    console.log(
      `🧹 [Cleanup] Завершено: сессий=${sessions}, транзакций=${transactions}, daily_rewards=${dailyRewards}`
    );
  } catch (error) {
    console.error(
      '🧹 [Cleanup] Ошибка при очистке:',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

/**
 * Инициализирует cron-задачу очистки.
 * 03:10 МСК — не совпадает с :00/:05 (автозакрытие map-vote), меньше WARN «missed execution» у node-cron.
 */
function runCleanupDeferred(): void {
  setImmediate(() => {
    void runCleanup();
  });
}

export function scheduleDataCleanup(): void {
  runCleanupDeferred();

  cron.schedule('10 3 * * *', () => {
    runCleanupDeferred();
  });

  console.log('✅ Cron-задача очистки данных запланирована (ежедневно в 03:10, локальное время сервера)');
}
