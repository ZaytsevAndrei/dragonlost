import dotenv from 'dotenv';
import path from 'path';
import { Bot } from 'grammy';
import { BotApiError, claimBonus, getBotStatus, linkAccount } from './apiClient';
import { formatDuration } from './format';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const siteUrl = (process.env.SITE_URL || 'https://dragonlost.ru').replace(/\/$/, '');

if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN не задан в .env');
  process.exit(1);
}

if (!process.env.BOT_API_KEY?.trim()) {
  console.error('❌ BOT_API_KEY не задан в .env');
  process.exit(1);
}

const bot = new Bot(token);

const WELCOME_TEXT = [
  '🐉 <b>DragonLost Bot</b>',
  '',
  'Бонусы для сервера Rust DragonLost — предметы попадают в инвентарь на сайте.',
  '',
  '<b>Команды:</b>',
  '/link КОД — привязать Steam (код на сайте)',
  '/bonus — бонус в инвентарь (раз в 12 часов)',
  '/status — статус и кулдаун',
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
