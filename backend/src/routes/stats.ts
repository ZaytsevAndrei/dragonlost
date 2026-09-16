import { Router } from 'express';
import { rustPool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import { isAdmin } from '../middleware/auth';
import { sensitiveRateLimiter } from '../middleware/rateLimiter';
import {
  subtractWipeBaseline,
  getBaselinesForSteamIds,
  getWipeMeta,
  getWipeSinceUnix,
  hasWipeBaselines,
  snapshotWipeBaselines,
  fetchLatestClosedMapVoteSessionId,
} from '../services/statsWipeService';
import { getSteamProfile } from '../services/steamProfile';

const router = Router();

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

/** Экранирует спецсимволы LIKE (%, _) в пользовательском вводе */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

function maskSteamId(steamid: string): string {
  if (!steamid || steamid.length < 8) return '***';
  return steamid.slice(0, 4) + '****' + steamid.slice(-4);
}

function parsePlayerRow(
  row: RowDataPacket,
  showFullSteamId: boolean,
  includeLastSeen: boolean,
  baseline?: Record<string, unknown>
) {
  let statisticsDB: Record<string, any> = {};
  try {
    statisticsDB = JSON.parse(row.StatisticsDB || '{}');
  } catch {
    // невалидный JSON — используем пустой объект
  }
  if (baseline !== undefined) {
    statisticsDB = subtractWipeBaseline(statisticsDB, baseline);
  }
  const kills = statisticsDB.Kills || 0;
  const deaths = statisticsDB.Deaths || 0;
  const gathered = statisticsDB.Gathered || {};
  const barrelsBroken =
    statisticsDB.BarrelsDestroyed ||
    statisticsDB.BrokenBarrels ||
    statisticsDB.BarrelsBroken ||
    statisticsDB.Barrels ||
    0;

  return {
    id: row.id,
    steamid: showFullSteamId ? row.steamid : maskSteamId(row.steamid),
    name: row.name,
    stats: {
      kills,
      deaths,
      kd: deaths > 0 ? parseFloat((kills / deaths).toFixed(2)) : kills,
      headshots: statisticsDB.Headshots || 0,
      shots: statisticsDB.Shots || 0,
      experiments: statisticsDB.Experiments || 0,
      recoveries: statisticsDB.Recoveries || 0,
      woundedTimes: statisticsDB.WoundedTimes || 0,
      craftedItems: statisticsDB.CraftedItems || 0,
      repairedItems: statisticsDB.RepairedItems || 0,
      barrelsBroken,
      secondsPlayed: statisticsDB.SecondsPlayed || 0,
      joins: statisticsDB.Joins || 0,
    },
    resources: {
      wood: gathered.wood || 0,
      stones: gathered.stones || 0,
      metalOre: gathered['metal.ore'] || 0,
      sulfurOre: gathered['sulfur.ore'] || 0,
    },
    ...(includeLastSeen ? { lastSeen: parseFloat(row['Last Seen'] || 0) } : {}),
    timePlayed: row['Time Played'] || '0',
    firstConnection: parseFloat(row['First Connection'] || 0),
  };
}

// Get all players statistics (with server-side pagination)
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit as string) || DEFAULT_PAGE_SIZE));
    const search = (req.query.search as string) || '';
    const offset = (page - 1) * limit;

    const isAuth = req.isAuthenticated();
    const sessionUser = req.user as { role?: string } | undefined;
    const isAdmin = Boolean(isAuth && sessionUser?.role === 'admin');

    const wipeSinceUnix = await getWipeSinceUnix();

    let countQuery = 'SELECT COUNT(*) as total FROM PlayerDatabase';
    let dataQuery = 'SELECT * FROM PlayerDatabase';
    const params: (string | number)[] = [];
    const whereParts: string[] = [];

    if (search) {
      whereParts.push('name LIKE ? ESCAPE \'\\\\\'');
      params.push(`%${escapeLike(search)}%`);
    }

    if (wipeSinceUnix != null) {
      whereParts.push('`Last Seen` >= ?');
      params.push(wipeSinceUnix);
    }

    if (whereParts.length > 0) {
      const whereClause = ` WHERE ${whereParts.join(' AND ')}`;
      countQuery += whereClause;
      dataQuery += whereClause;
    }

    dataQuery += ' ORDER BY `Last Seen` DESC LIMIT ? OFFSET ?';

    const [countRows] = await rustPool.query<RowDataPacket[]>(countQuery, params);
    const total = countRows[0].total as number;

    const [rows] = await rustPool.query<RowDataPacket[]>(dataQuery, [...params, limit, offset]);

    const useWipeStats = await hasWipeBaselines();
    const baselines = useWipeStats
      ? await getBaselinesForSteamIds(rows.map((r) => String(r.steamid || '')))
      : new Map<string, Record<string, unknown>>();

    const wipeMeta = useWipeStats ? await getWipeMeta() : { wipedAt: null, mapVoteSessionId: null };

    const players = rows.map((row) => {
      const steamid = String(row.steamid || '');
      const baseline = useWipeStats ? baselines.get(steamid) ?? {} : undefined;
      return parsePlayerRow(row, isAuth, isAdmin, baseline);
    });

    res.json({
      players,
      wipeStats: useWipeStats,
      wipedAt: wipeMeta.wipedAt ? wipeMeta.wipedAt.toISOString() : null,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching stats:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * Публичный лидерборд: топ игроков по метрике текущего вайпа.
 * Датасет парсится один раз и кэшируется на 60 секунд,
 * сортировка по метрике выполняется на сервере.
 */
type ParsedPlayer = ReturnType<typeof parsePlayerRow>;

type LeaderboardMetric =
  | 'time'
  | 'kills'
  | 'kd'
  | 'headshots'
  | 'wood'
  | 'stones'
  | 'metal'
  | 'sulfur';

const LEADERBOARD_METRICS: Record<LeaderboardMetric, (p: ParsedPlayer) => number> = {
  time: (p) => p.stats.secondsPlayed,
  kills: (p) => p.stats.kills,
  kd: (p) => p.stats.kd,
  headshots: (p) => p.stats.headshots,
  wood: (p) => p.resources.wood,
  stones: (p) => p.resources.stones,
  metal: (p) => p.resources.metalOre,
  sulfur: (p) => p.resources.sulfurOre,
};

const LEADERBOARD_CACHE_TTL_MS = 60 * 1000;
let leaderboardCache: {
  players: ParsedPlayer[];
  fetchedAt: number;
  wipeStats: boolean;
  wipedAt: string | null;
} | null = null;

async function fetchLeaderboardDataset(): Promise<NonNullable<typeof leaderboardCache>> {
  if (leaderboardCache && Date.now() - leaderboardCache.fetchedAt < LEADERBOARD_CACHE_TTL_MS) {
    return leaderboardCache;
  }

  const wipeSinceUnix = await getWipeSinceUnix();

  const [rows] = await rustPool.query<RowDataPacket[]>(
    wipeSinceUnix != null
      ? 'SELECT * FROM PlayerDatabase WHERE `Last Seen` >= ?'
      : 'SELECT * FROM PlayerDatabase',
    wipeSinceUnix != null ? [wipeSinceUnix] : []
  );

  const useWipeStats = await hasWipeBaselines();
  const baselines = useWipeStats
    ? await getBaselinesForSteamIds(rows.map((r) => String(r.steamid || '')))
    : new Map<string, Record<string, unknown>>();
  const wipeMeta = useWipeStats ? await getWipeMeta() : { wipedAt: null, mapVoteSessionId: null };

  const players = rows.map((row) => {
    const steamid = String(row.steamid || '');
    const baseline = useWipeStats ? baselines.get(steamid) ?? {} : undefined;
    // Полный steamid нужен для публичных профилей игроков (/player/:steamid)
    return parsePlayerRow(row, true, false, baseline);
  });

  leaderboardCache = {
    players,
    fetchedAt: Date.now(),
    wipeStats: useWipeStats,
    wipedAt: wipeMeta.wipedAt ? wipeMeta.wipedAt.toISOString() : null,
  };
  return leaderboardCache;
}

router.get('/leaderboard', async (req, res) => {
  try {
    const metric = (req.query.metric as string) || 'time';
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));

    const accessor = LEADERBOARD_METRICS[metric as LeaderboardMetric];
    if (!accessor) {
      return res.status(400).json({ error: 'Unknown leaderboard metric' });
    }

    const dataset = await fetchLeaderboardDataset();
    const leaders = [...dataset.players]
      .sort((a, b) => accessor(b) - accessor(a))
      .slice(0, limit)
      .map((player, index) => ({ rank: index + 1, ...player }));

    res.json({
      metric,
      leaders,
      wipeStats: dataset.wipeStats,
      wipedAt: dataset.wipedAt,
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

/** Steam ID64 — 17 цифр */
const STEAMID64_REGEX = /^\d{17}$/;

// Публичная статистика игрока по Steam ID (для страницы /player/:steamid и OG-превью)
router.get('/:steamid', sensitiveRateLimiter, async (req, res) => {
  try {
    const { steamid } = req.params;

    if (!STEAMID64_REGEX.test(steamid)) {
      return res.status(400).json({ error: 'Invalid Steam ID format' });
    }

    const wipeSinceUnix = await getWipeSinceUnix();

    const [rows] = await rustPool.query<RowDataPacket[]>(
      wipeSinceUnix != null
        ? 'SELECT * FROM PlayerDatabase WHERE steamid = ? AND `Last Seen` >= ?'
        : 'SELECT * FROM PlayerDatabase WHERE steamid = ?',
      wipeSinceUnix != null ? [steamid, wipeSinceUnix] : [steamid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const useWipeStats = await hasWipeBaselines();
    const baselines = useWipeStats
      ? await getBaselinesForSteamIds([steamid])
      : new Map<string, Record<string, unknown>>();
    const wipeMeta = useWipeStats ? await getWipeMeta() : { wipedAt: null, mapVoteSessionId: null };

    const player = parsePlayerRow(rows[0], true, true, useWipeStats ? baselines.get(steamid) ?? {} : undefined);

    let steam: { personaname: string; avatarfull: string; profileurl?: string } | null = null;
    try {
      steam = await getSteamProfile(steamid);
    } catch {
      steam = null;
    }

    res.json({
      player,
      steam,
      wipeStats: useWipeStats,
      wipedAt: wipeMeta.wipedAt ? wipeMeta.wipedAt.toISOString() : null,
    });
  } catch (error) {
    console.error('Error fetching player stats:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch player statistics' });
  }
});

/**
 * POST /api/stats/admin/snapshot-wipe — зафиксировать базу статистики на момент вайпа (только admin).
 * Вызывать сразу после вайпа, если автоматический снимок не сработал.
 */
router.post('/admin/snapshot-wipe', sensitiveRateLimiter, isAdmin, async (_req, res) => {
  try {
    const sessionId = await fetchLatestClosedMapVoteSessionId();
    const result = await snapshotWipeBaselines(sessionId);
    res.json({
      ok: true,
      wipedAt: result.wipedAt.toISOString(),
      playersCount: result.playersCount,
      mapVoteSessionId: sessionId,
    });
  } catch (error) {
    console.error('Error snapshotting wipe stats:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Не удалось сохранить снимок статистики вайпа' });
  }
});

export default router;
