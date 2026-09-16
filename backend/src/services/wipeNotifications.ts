import cron from 'node-cron';
import { webPool } from '../config/database';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import {
  upcomingWipeInstants,
  isAnchorWipeInstant,
  MSK_TZ,
  WIPE_SCHEDULE_HINT_DEFAULT,
} from '../utils/wipeSchedule';
import {
  sendTelegramMessage,
  formatWipeCompletedMessage,
  announceWipeUpcomingToChannel,
  announceWipeCompletedToChannel,
} from './telegramChannel';
import { rustServersApi } from './rustServersApi';

/**
 * Подписки на уведомления о вайпах в Telegram-боте.
 * — таблица telegram_wipe_subscribers: кто подписан (миграция 019);
 * — таблица telegram_wipe_notify_log: защита от повторной отправки после рестарта;
 * — cron каждые 5 минут шлёт «за 24 часа» и «за 1 час» до вайпа.
 */

interface SubscriberRow extends RowDataPacket {
  telegram_id: number;
}

function formatMsk(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: MSK_TZ,
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export async function subscribeToWipeNotifications(
  telegramId: number,
  telegramUsername: string | null
): Promise<void> {
  await webPool.query<ResultSetHeader>(
    `INSERT INTO telegram_wipe_subscribers (telegram_id, telegram_username)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE telegram_username = VALUES(telegram_username)`,
    [telegramId, telegramUsername]
  );
}

export async function unsubscribeFromWipeNotifications(telegramId: number): Promise<boolean> {
  const [result] = await webPool.query<ResultSetHeader>(
    'DELETE FROM telegram_wipe_subscribers WHERE telegram_id = ?',
    [telegramId]
  );
  return result.affectedRows > 0;
}

export async function getWipeSubscription(telegramId: number): Promise<boolean> {
  const [rows] = await webPool.query<RowDataPacket[]>(
    'SELECT 1 AS subscribed FROM telegram_wipe_subscribers WHERE telegram_id = ? LIMIT 1',
    [telegramId]
  );
  return rows.length > 0;
}

async function listSubscriberIds(): Promise<number[]> {
  const [rows] = await webPool.query<SubscriberRow[]>(
    'SELECT telegram_id FROM telegram_wipe_subscribers'
  );
  return rows.map((r) => Number(r.telegram_id));
}

/** INSERT IGNORE: true, если ключ новый (значит, отправка ещё не выполнялась). */
async function tryClaimNotifyKey(key: string): Promise<boolean> {
  try {
    const [result] = await webPool.query<ResultSetHeader>(
      'INSERT IGNORE INTO telegram_wipe_notify_log (notify_key) VALUES (?)',
      [key]
    );
    return result.affectedRows > 0;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'ER_NO_SUCH_TABLE') return false;
    throw err;
  }
}

async function notifyAllSubscribers(text: string): Promise<void> {
  const ids = await listSubscriberIds();
  if (ids.length === 0) return;

  console.log(`[WipeNotify] Рассылка ${ids.length} подписчикам`);
  for (const id of ids) {
    // Последовательно, чтобы не упереться в лимиты Bot API
    await sendTelegramMessage(String(id), text);
  }
}

async function getServerOnline(): Promise<{ players: number; maxPlayers: number } | null> {
  try {
    const details = await rustServersApi.getServerDetails();
    if (!details) return null;
    return {
      players: parseInt(details.players, 10) || 0,
      maxPlayers: parseInt(details.maxplayers, 10) || 0,
    };
  } catch {
    return null;
  }
}

/** Расписание ближайших вайпов для команды /wipes в боте. */
export function getUpcomingWipesForBot(limit = 3): Array<{ at: string; isAnchor: boolean }> {
  return upcomingWipeInstants(new Date(), limit).map((wipeAt) => ({
    at: wipeAt.toISOString(),
    isAnchor: isAnchorWipeInstant(wipeAt),
  }));
}

export function getWipeScheduleHint(): string {
  return WIPE_SCHEDULE_HINT_DEFAULT;
}

/**
 * Единая точка «вайп выполнен»: пост в канал + рассылка подписчикам.
 * Вызывается из mapVoteScheduler после успешного вайпа.
 */
export async function announceWipeExecuted(params: {
  wipeAt: Date;
  seed: number | null;
  mapSize: number | null;
}): Promise<void> {
  const key = `done:${params.wipeAt.getTime()}`;
  let claimed = false;
  try {
    claimed = await tryClaimNotifyKey(key);
  } catch (error) {
    console.error('[WipeNotify] Ошибка фиксации ключа done:', error instanceof Error ? error.message : error);
  }
  if (!claimed) return;

  const online = await getServerOnline();
  const message = formatWipeCompletedMessage({
    wipeAt: params.wipeAt,
    seed: params.seed,
    mapSize: params.mapSize,
    playersOnline: online?.players ?? null,
    maxPlayers: online?.maxPlayers ?? null,
  });

  // канал
  await announceWipeCompletedToChannel({
    wipeAt: params.wipeAt,
    seed: params.seed,
    mapSize: params.mapSize,
    playersOnline: online?.players ?? null,
    maxPlayers: online?.maxPlayers ?? null,
  });

  // подписчики бота
  await notifyAllSubscribers(message);
}

async function maybeSendThresholdReminder(wipeAt: Date, thresholdMs: number, level: string): Promise<void> {
  const delta = wipeAt.getTime() - Date.now();
  const crossedAgo = thresholdMs - delta;
  // окно 0…6 минут после пересечения порога (cron тикает каждые 5 минут)
  if (crossedAgo < 0 || crossedAgo > 6 * 60 * 1000) return;

  const key = `${level}:${wipeAt.getTime()}`;
  if (!(await tryClaimNotifyKey(key))) return;

  if (level === '24h') {
    // Анонс в канал + напоминание подписчикам
    await announceWipeUpcomingToChannel(wipeAt);
    await notifyAllSubscribers(
      [
        '⏳ <b>Через 24 часа — вайп!</b>',
        '',
        `📅 ${formatMsk(wipeAt)}`,
        '',
        '🗳️ Успей проголосовать за карту — /wipes',
        `🌐 <a href="https://dragonlost.ru/wipe">Расписание вайпов</a>`,
      ].join('\n')
    );
  } else if (level === '1h') {
    await notifyAllSubscribers(
      [
        '🔥 <b>Через час — вайп!</b>',
        '',
        `📅 ${formatMsk(wipeAt)}`,
        '',
        'Последний шанс: проголосовать за карту, слить лут и занять место для нового старта. 🚀',
      ].join('\n')
    );
  }
}

/** Cron: напоминания за 24 часа и за 1 час до вайпа. */
export function scheduleWipeNotificationTasks(): void {
  cron.schedule('4,9,14,19,24,29,34,39,44,49,54,59 * * * *', () => {
    setImmediate(() => {
      void (async () => {
        try {
          const next = upcomingWipeInstants(new Date(), 1)[0];
          if (!next) return;
          await maybeSendThresholdReminder(next, 24 * 60 * 60 * 1000, '24h');
          await maybeSendThresholdReminder(next, 60 * 60 * 1000, '1h');
        } catch (error) {
          console.error('[WipeNotify] Ошибка cron-задачи:', error instanceof Error ? error.message : error);
        }
      })();
    });
  });

  console.log('✅ Cron wipe-уведомлений: напоминания за 24ч и 1ч до вайпа (подписчики бота + канал)');
}
