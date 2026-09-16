import { Bot } from 'grammy';
import {
  BotApiError,
  claimBonus,
  getBotStatus,
  linkAccount,
  getWipeSchedule,
  getWipeSubscriptionStatus,
  subscribeToWipeNotifications,
  unsubscribeFromWipeNotifications,
} from './apiClient';
import { formatDuration } from './format';
import { getSiteUrl, getTelegramBotToken, getBotApiKey } from './env';

const token = getTelegramBotToken();
const siteUrl = getSiteUrl();

if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN не задан в .env');
  process.exit(1);
}

if (!getBotApiKey()) {
  console.error('❌ BOT_API_KEY не задан в .env');
  process.exit(1);
}

const bot = new Bot(token);

const WELCOME_TEXT = [
  '🐉 <b>DragonLost Bot</b>',
  '',
  'Бонусы и вайп-уведомления для сервера Rust DragonLost.',
  '',
  '<b>Команды:</b>',
  '/link КОД — привязать Steam (код на сайте)',
  '/bonus — бонус в инвентарь (раз в 12 часов)',
  '/status — статус и кулдаун',
  '/wipes — расписание ближайших вайпов',
  '/subscribe — уведомления о вайпах (за 24ч и за 1ч)',
  '/unsubscribe — отключить уведомления',
  '',
  `🌐 <a href="${siteUrl}">dragonlost.ru</a>`,
  `📦 <a href="${siteUrl}/inventory">Инвентарь</a>`,
  `🔗 <a href="${siteUrl}/telegram">Привязка аккаунта</a>`,
].join('\n');

function extractLinkCode(text: string): string | null {
  const match = text.trim().match(/^\/link(?:@\w+)?(?:\s+(.+))?$/i);
  if (!match?.[1]) return null;
  return match[1].trim().toUpperCase();
}

bot.command('start', async (ctx) => {
  await ctx.reply(WELCOME_TEXT, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
});

bot.command('help', async (ctx) => {
  await ctx.reply(WELCOME_TEXT, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
});

bot.command('status', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    const status = await getBotStatus(telegramId);

    if (!status.linked) {
      await ctx.reply(
        [
          '❌ Telegram не привязан к Steam.',
          '',
          `Получите код на <a href="${siteUrl}/telegram">странице привязки</a> и отправьте:`,
          '<code>/link КОД</code>',
        ].join('\n'),
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
      );
      return;
    }

    const lines = [
      '✅ <b>Аккаунт привязан</b>',
      `Steam: ${status.steam_username}`,
      `Получено бонусов: ${status.total_claims}`,
    ];

    if (status.bonus_available) {
      lines.push('', '🎁 Бонус доступен — используйте /bonus');
    } else {
      lines.push('', `⏳ Следующий бонус через ${formatDuration(status.seconds_until_available)}`);
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  } catch (error) {
    await ctx.reply(formatApiError(error));
  }
});

bot.command('link', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId || !ctx.message?.text) return;

  const code = extractLinkCode(ctx.message.text);
  if (!code) {
    await ctx.reply(
      [
        'Укажите код привязки:',
        '<code>/link ABCD12</code>',
        '',
        `Код можно получить на <a href="${siteUrl}/telegram">dragonlost.ru/telegram</a> после входа через Steam.`,
      ].join('\n'),
      { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
    );
    return;
  }

  try {
    const result = await linkAccount({
      telegramId,
      code,
      telegramUsername: ctx.from?.username ?? null,
    });

    await ctx.reply(
      [
        '✅ <b>Аккаунт привязан!</b>',
        `Steam: ${result.username}`,
        '',
        'Теперь используйте /bonus для получения награды раз в 12 часов.',
        `Предметы попадут в <a href="${siteUrl}/inventory">инвентарь на сайте</a>.`,
      ].join('\n'),
      { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
    );
  } catch (error) {
    await ctx.reply(formatApiError(error));
  }
});

bot.command('bonus', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    const result = await claimBonus(telegramId);

    await ctx.reply(
      [
        '🎁 <b>Бонус получен!</b>',
        '',
        `<b>${result.quantity}x ${result.item_name}</b>`,
        '',
        `Предмет добавлен в <a href="${siteUrl}/inventory">инвентарь</a>.`,
        'Чтобы получить его в игре — зайдите на сервер онлайн и активируйте предмет на сайте.',
        '',
        '⏳ Следующий бонус через 12 часов.',
      ].join('\n'),
      { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
    );
  } catch (error) {
    if (error instanceof BotApiError && error.status === 429) {
      const wait = formatDuration(error.secondsUntilAvailable ?? 0);
      await ctx.reply(`⏳ Бонус ещё недоступен.\n\nПодождите ещё ${wait}.\n\nИспользуйте /status для проверки.`);
      return;
    }
    await ctx.reply(formatApiError(error));
  }
});

function formatWipeIn(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const remainder = seconds % 86400;
  if (days > 0 && remainder >= 60) return `${days} дн ${formatDuration(remainder)}`;
  if (days > 0) return `${days} дн`;
  return formatDuration(seconds);
}

bot.command('wipes', async (ctx) => {
  try {
    const schedule = await getWipeSchedule();

    if (schedule.upcoming.length === 0) {
      await ctx.reply('Не удалось определить расписание вайпов. Попробуйте позже.');
      return;
    }

    const lines = ['⏳ <b>Ближайшие вайпы:</b>', ''];
    schedule.upcoming.forEach((wipe, index) => {
      const date = new Date(wipe.at);
      const dateLabel = date.toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
      const secondsLeft = Math.max(0, Math.floor((date.getTime() - Date.now()) / 1000));
      const kind = wipe.isAnchor ? 'первый четверг' : 'промежуточный';
      lines.push(`${index + 1}. ${dateLabel} МСК — ${kind} (через ${formatWipeIn(secondsLeft)})`);
    });

    lines.push(
      '',
      `📅 <a href="${siteUrl}/wipe">Полное расписание</a>`,
      '🔔 Уведомления о вайпах: /subscribe'
    );

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  } catch (error) {
    await ctx.reply(formatApiError(error));
  }
});

bot.command('subscribe', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    await subscribeToWipeNotifications(telegramId, ctx.from?.username ?? null);
    await ctx.reply(
      [
        '🔔 <b>Подписка оформлена!</b>',
        '',
        'Напомню за 24 часа и за 1 час до вайпа, а также сообщу, когда вайп выполнен (дата, размер карты, сид, онлайн).',
        '',
        'Отписаться: /unsubscribe',
        `📅 <a href="${siteUrl}/wipe">Расписание вайпов</a>`,
      ].join('\n'),
      { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
    );
  } catch (error) {
    await ctx.reply(formatApiError(error));
  }
});

bot.command('unsubscribe', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    await unsubscribeFromWipeNotifications(telegramId);
    await ctx.reply('🔕 Уведомления о вайпах отключены. Вернуть их можно командой /subscribe.');
  } catch (error) {
    await ctx.reply(formatApiError(error));
  }
});

function formatApiError(error: unknown): string {
  if (error instanceof BotApiError) {
    return `❌ ${error.message}`;
  }
  console.error('[Bot] Unexpected error:', error);
  return '❌ Произошла ошибка. Попробуйте позже.';
}

bot.catch((error) => {
  console.error('[Bot] Unhandled error:', error);
});

console.log('🤖 DragonLost Telegram Bot запускается...');
bot.start({
  onStart: (info) => {
    console.log(`✅ Бот @${info.username} запущен (long polling)`);
  },
});
