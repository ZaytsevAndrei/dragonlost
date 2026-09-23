import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2';
import { rustPool } from '../config/database';
import { rateLimiter } from '../middleware/rateLimiter';
import { getSteamProfile, isValidSteamId64 } from '../services/steamProfile';
import {
  getWipeSinceUnix,
  getBaselinesForSteamIds,
  hasWipeBaselines,
  subtractWipeBaseline,
} from '../services/statsWipeService';
import { upcomingWipeInstants, MSK_TZ } from '../utils/wipeSchedule';

/**
 * SSR-lite для SPA: отдаёт index.html с подставленными title/description/OG
 * под конкретный маршрут. Нужен, чтобы краулеры (Telegram/Discord/VK/поисковики)
 * видели корректное превью ссылки без выполнения JS.
 * Nginx проксирует /player/*, /leaders, /wipe на backend (см. nginx-production.conf).
 */

const router = Router();

// Роут живёт вне /api/, поэтому лимитер вешаем сами
router.use(rateLimiter);

interface PageMeta {
  title: string;
  description: string;
  url: string;
}

const SITE_URL = (process.env.SITE_URL || 'https://dragonlost.ru').replace(/\/$/, '');

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let templateCache: { html: string | null; readAt: number } = { html: null, readAt: 0 };
const TEMPLATE_TTL_MS = 5 * 60 * 1000;

function indexTemplateCandidates(): string[] {
  const fromEnv = process.env.FRONTEND_DIST;
  return [
    ...(fromEnv ? [path.resolve(fromEnv, 'index.html')] : []),
    // backend/dist/index.js → ../../frontend/dist
    path.resolve(__dirname, '../../frontend/dist/index.html'),
    // backend/src (ts-node-dev) → ../frontend/dist
    path.resolve(__dirname, '../frontend/dist/index.html'),
    // файловая структура деплоя: <project>/backend/dist
    '/var/www/dragonlost/frontend/dist/index.html',
  ];
}

function readIndexTemplate(): string | null {
  if (templateCache.html && Date.now() - templateCache.readAt < TEMPLATE_TTL_MS) {
    return templateCache.html;
  }
  for (const candidate of indexTemplateCandidates()) {
    try {
      const html = fs.readFileSync(candidate, 'utf8');
      templateCache = { html, readAt: Date.now() };
      return html;
    } catch {
      // пробуем следующий путь
    }
  }
  return null;
}

function replaceOrInsert(html: string, pattern: RegExp, tag: string): string {
  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

function injectMeta(html: string, meta: PageMeta): string {
  const eTitle = escapeHtml(meta.title);
  const eDesc = escapeHtml(meta.description);
  const eUrl = escapeHtml(meta.url);

  let out = replaceOrInsert(html, /<title>[\s\S]*?<\/title>/, `<title>${eTitle}</title>`);
  out = replaceOrInsert(
    out,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${eDesc}" />`
  );
  out = replaceOrInsert(out, /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${eUrl}" />`);
  out = replaceOrInsert(
    out,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${eTitle}" />`
  );
  out = replaceOrInsert(
    out,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${eDesc}" />`
  );
  out = replaceOrInsert(
    out,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${eUrl}" />`
  );
  out = replaceOrInsert(
    out,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${eTitle}" />`
  );
  out = replaceOrInsert(
    out,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${eDesc}" />`
  );
  return out;
}

function sendPage(res: Response, meta: PageMeta): void {
  const template = readIndexTemplate();
  if (!template) {
    // Фронтенд не собран (например, локальный dev без dist) — отдаём редирект на главную
    res.redirect(SITE_URL + '/');
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.send(injectMeta(template, meta));
}

function formatHours(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return `${hours} ч`;
  return `${Math.floor(hours / 24)} дн ${hours % 24} ч`;
}

async function playerMeta(steamid: string): Promise<PageMeta> {
  const url = `${SITE_URL}/player/${steamid}`;

  try {
    const wipeSinceUnix = await getWipeSinceUnix();
    const [rows] = await rustPool.query<RowDataPacket[]>(
      wipeSinceUnix != null
        ? 'SELECT name, StatisticsDB FROM PlayerDatabase WHERE steamid = ? AND `Last Seen` >= ?'
        : 'SELECT name, StatisticsDB FROM PlayerDatabase WHERE steamid = ?',
      wipeSinceUnix != null ? [steamid, wipeSinceUnix] : [steamid]
    );

    if (rows.length === 0) {
      return {
        title: `Игрок не найден — DragonLost`,
        description: `Профиль игрока Rust-сервера DragonLost. Статистика текущего вайпа: убийства, K/D, наигранное время.`,
        url,
      };
    }

    let stats: Record<string, any> = {};
    try {
      stats = JSON.parse(rows[0].StatisticsDB || '{}');
    } catch {
      stats = {};
    }
    if ((await hasWipeBaselines()) === true) {
      const baselines = await getBaselinesForSteamIds([steamid]);
      const baseline = baselines.get(steamid);
      if (baseline) stats = subtractWipeBaseline(stats, baseline);
    }

    const [steam, dbName] = await Promise.all([
      getSteamProfile(steamid),
      Promise.resolve(String(rows[0].name || '')),
    ]);
    const name = steam?.personaname || dbName || 'Игрок';

    const kills = Number(stats.Kills) || 0;
    const deaths = Number(stats.Deaths) || 0;
    const kd = deaths > 0 ? (kills / deaths).toFixed(2) : String(kills);
    const hours = formatHours(Number(stats.SecondsPlayed) || 0);

    return {
      title: `${name} — статистика игрока | DragonLost`,
      description: `Наиграно за вайп: ${hours}; убийств: ${kills}; K/D: ${kd}. Профиль игрока Rust-сервера DragonLost («LostDragon | WIPE 10 days | DUO», x1).`,
      url,
    };
  } catch (error) {
    console.error('[Meta] Ошибка сборки meta игрока:', error instanceof Error ? error.message : error);
    return {
      title: `Профиль игрока | DragonLost`,
      description: `Статистика игрока Rust-сервера DragonLost за текущий вайп.`,
      url,
    };
  }
}

function leadersMeta(): PageMeta {
  return {
    title: `Топ игроков сервера — DragonLost`,
    description: `Публичный рейтинг игроков Rust-сервера DragonLost за текущий вайп: наигранное время, убийства, K/D, хедшоты и фарм ресурсов.`,
    url: `${SITE_URL}/leaders`,
  };
}

function wipeMeta(): PageMeta {
  const next = upcomingWipeInstants(new Date(), 1)[0];
  const when = next
    ? new Intl.DateTimeFormat('ru-RU', {
        timeZone: MSK_TZ,
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      }).format(next)
    : 'скоро';
  return {
    title: `Расписание вайпов — DragonLost | Rust сервер`,
    description: `Когда вайп на Rust-сервере DragonLost: первый четверг месяца в 20:30 МСК и каждые 10 дней в 17:30 МСК. Ближайший вайп: ${when} МСК. Обратный отсчёт, голосование за карту и уведомления в Telegram.`,
    url: `${SITE_URL}/wipe`,
  };
}

router.get('*', async (req: Request, res: Response) => {
  const base = req.baseUrl; // /player | /leaders | /wipe
  const rest = req.path.replace(/^\//, '');

  if (base === '/player') {
    return sendPage(res, await playerMeta(rest));
  }
  if (base === '/leaders') {
    return sendPage(res, leadersMeta());
  }
  if (base === '/wipe') {
    return sendPage(res, wipeMeta());
  }
  return sendPage(res, {
    title: 'DragonLost — Rust сервер x1 «LostDragon | WIPE 10 days | DUO» | Вайпы каждые 10 дней',
    description: 'Rust-сервер DragonLost: расписание вайпов, статистика игроков, магазин и награды.',
    url: SITE_URL + '/',
  });
});

export default router;
