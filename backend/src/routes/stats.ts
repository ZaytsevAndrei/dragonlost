import { Router } from 'express';
import { rustPool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import { isAuthenticated } from '../middleware/auth';
import { sensitiveRateLimiter } from '../middleware/rateLimiter';

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

function parsePlayerRow(row: RowDataPacket, showFullSteamId: boolean) {
  let statisticsDB: Record<string, any> = {};
  try {
    statisticsDB = JSON.parse(row.StatisticsDB || '{}');
  } catch {
    // невалидный JSON — используем пустой объект
  }
  const kills = statisticsDB.Kills || 0;
  const deaths = statisticsDB.Deaths || 0;
  const gathered = statisticsDB.Gathered || {};

  return {
    id: row.id,
    steamid: showFullSteamId ? row.steamid : maskSteamId(row.steamid),
    name: row.name,
    stats: {
      kills,
      deaths,
      kd: deaths > 0 ? parseFloat((kills / deaths).toFixed(2)) : kills,
      suicides: statisticsDB.Suicides || 0,
      headshots: statisticsDB.Headshots || 0,
      shots: statisticsDB.Shots || 0,
      experiments: statisticsDB.Experiments || 0,
      recoveries: statisticsDB.Recoveries || 0,
      woundedTimes: statisticsDB.WoundedTimes || 0,
      craftedItems: statisticsDB.CraftedItems || 0,
      repairedItems: statisticsDB.RepairedItems || 0,
      secondsPlayed: statisticsDB.SecondsPlayed || 0,
      joins: statisticsDB.Joins || 0,
    },
    resources: {
      wood: gathered.wood || 0,
      stones: gathered.stones || 0,
      metalOre: gathered['metal.ore'] || 0,
      sulfurOre: gathered['sulfur.ore'] || 0,
    },
    lastSeen: parseFloat(row['Last Seen'] || 0),
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

    let countQuery = 'SELECT COUNT(*) as total FROM PlayerDatabase';
    let dataQuery = 'SELECT * FROM PlayerDatabase';
    const params: (string | number)[] = [];

    if (search) {
      const whereClause = ' WHERE name LIKE ? ESCAPE \'\\\\\'';
      countQuery += whereClause;
      dataQuery += whereClause;
      params.push(`%${escapeLike(search)}%`);
    }

    dataQuery += ' ORDER BY `Last Seen` DESC LIMIT ? OFFSET ?';

    const [countRows] = await rustPool.query<RowDataPacket[]>(countQuery, params);
    const total = countRows[0].total as number;

    const [rows] = await rustPool.query<RowDataPacket[]>(dataQuery, [...params, limit, offset]);

    const players = rows.map((row) => parsePlayerRow(row, isAuth));

    res.json({
      players,
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

// Get player statistics by Steam ID (requires authentication)
router.get('/:steamid', sensitiveRateLimiter, isAuthenticated, async (req, res) => {
  try {
    const { steamid } = req.params;

    const [rows] = await rustPool.query<RowDataPacket[]>(
      'SELECT * FROM PlayerDatabase WHERE steamid = ?',
      [steamid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const player = parsePlayerRow(rows[0], true);

    res.json({ player });
  } catch (error) {
    console.error('Error fetching player stats:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch player statistics' });
  }
});

export default router;
