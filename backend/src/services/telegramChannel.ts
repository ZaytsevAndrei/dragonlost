import fetch from 'node-fetch';
import { MSK_TZ } from '../utils/wipeSchedule';

/**
 * Автопостинг в Telegram-канал DragonLost через Bot API.
 * Включается переменными окружения TELEGRAM_BOT_TOKEN + TELEGRAM_CHANNEL_ID
 * (ID канала, например @dragonlost_rust или -1001234567890).
 * Без них все функции — тихий no-op, работа сервера не зависит от Telegram.
 */

export function isTelegramChannelConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHANNEL_ID?.trim());
}

/** Отправляет HTML-сообщение через Bot API. Ошибки логируются, но не бросаются. */
export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || !chatId) return false;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
    });

    if (!response.ok) {
      console.error(
        `[Telegram] sendMessage (${chatId}) вернул ${response.status}: ${(await response.text()).slice(0, 300)}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Telegram] Ошибка отправки сообщения:', error instanceof Error ? error.message : error);
    return false;
  }
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

export interface WipeAnnounceParams {
  wipeAt: Date;
  seed?: number | null;
  mapSize?: number | null;
  playersOnline?: number | null;
  maxPlayers?: number | null;
  siteUrl?: string;
}

/** Пост в канал: вайп выполнен — дата, размер карты, сид, онлайн. */
export function formatWipeCompletedMessage(params: WipeAnnounceParams): string {
  const lines = [
    '🐉 <b>Вайп выполнен!</b>',
    '',
    `📅 Дата: <b>${formatMsk(params.wipeAt)}</b>`,
  ];
  if (params.mapSize) lines.push(`🗺️ Размер карты: <b>${params.mapSize}</b>`);
  if (params.seed) lines.push(`🔢 Сид: <code>${params.seed}</code>`);
  if (params.playersOnline != null) {
    const online = params.maxPlayers ? `${params.playersOnline}/${params.maxPlayers}` : `${params.playersOnline}`;
    lines.push(`👥 Онлайн перед вайпом: <b>${online}</b>`);
  }
  lines.push(
    '',
    '🔥 Свежий вайп — лучшее время подселиться!',
    `🌐 ${params.siteUrl || 'https://dragonlost.ru'}`
  );
  return lines.join('\n');
}

/** Пост в канал: анонс ближайшего вайпа (за сутки). */
export function formatWipeUpcomingMessage(wipeAt: Date, siteUrl?: string): string {
  return [
    '⏳ <b>Через 24 часа — вайп!</b>',
    '',
    `📅 ${formatMsk(wipeAt)}`,
    '',
    '🗳️ Успей проголосовать за карту и подготовься к свежему старту.',
    `🌐 ${siteUrl || 'https://dragonlost.ru'}/wipe`,
  ].join('\n');
}

export async function announceWipeCompletedToChannel(params: WipeAnnounceParams): Promise<void> {
  const channelId = process.env.TELEGRAM_CHANNEL_ID?.trim();
  if (!channelId) return;
  await sendTelegramMessage(channelId, formatWipeCompletedMessage(params));
}

export async function announceWipeUpcomingToChannel(wipeAt: Date): Promise<void> {
  const channelId = process.env.TELEGRAM_CHANNEL_ID?.trim();
  if (!channelId) return;
  await sendTelegramMessage(channelId, formatWipeUpcomingMessage(wipeAt));
}
