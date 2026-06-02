import { RowDataPacket } from 'mysql2';
import { rustPool, webPool } from '../config/database';
import { formatMysqlDatetimeMsk, parseMysqlDatetimeMsk } from '../utils/mskDateTime';

const NUMERIC_STAT_KEYS = [
  'Joins',
  'Leaves',
  'Kills',
  'Deaths',
  'Suicides',
  'Shots',
  'Headshots',
  'Experiments',
  'Recoveries',
  'VoiceBytes',
  'WoundedTimes',
  'CraftedItems',
  'RepairedItems',
  'LiftUsages',
  'WheelSpins',
  'HammerHits',
  'ExplosivesThrown',
  'WeaponReloads',
  'RocketsLaunched',
  'SecondsPlayed',
  'BarrelsDestroyed',
  'BrokenBarrels',
  'BarrelsBroken',
  'Barrels',
] as const;

type StatsRecord = Record<string, unknown>;

function toUint(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function subtractNumericDict(
  current: Record<string, unknown> | undefined,
  baseline: Record<string, unknown> | undefined
): Record<string, number> {
  const result: Record<string, number> = {};
  const keys = new Set([...Object.keys(current || {}), ...Object.keys(baseline || {})]);
  for (const key of keys) {
    const diff = toUint(current?.[key]) - toUint(baseline?.[key]);
    if (diff > 0) result[key] = diff;
  }
  return result;
}

/** Вычитает базовые значения вайпа из текущих StatisticsDB (не ниже нуля). */
export function subtractWipeBaseline(current: StatsRecord, baseline: StatsRecord): StatsRecord {
  const result: StatsRecord = { ...current };

  for (const key of NUMERIC_STAT_KEYS) {
    if (key in current || key in baseline) {
      const diff = toUint(current[key]) - toUint(baseline[key]);
      result[key] = diff > 0 ? diff : 0;
    }
  }

  if (current.Gathered || baseline.Gathered) {
    result.Gathered = subtractNumericDict(
      current.Gathered as Record<string, unknown> | undefined,
      baseline.Gathered as Record<string, unknown> | undefined
    );
  }

  if (current.CollectiblePickups || baseline.CollectiblePickups) {
    result.CollectiblePickups = subtractNumericDict(
      current.CollectiblePickups as Record<string, unknown> | undefined,
      baseline.CollectiblePickups as Record<string, unknown> | undefined
    );
  }

  if (current.PlantPickups || baseline.PlantPickups) {
    result.PlantPickups = subtractNumericDict(
      current.PlantPickups as Record<string, unknown> | undefined,
      baseline.PlantPickups as Record<string, unknown> | undefined
    );
  }

  return result;
}

export async function getWipeMeta(): Promise<{ wipedAt: Date | null; mapVoteSessionId: number | null }> {
  try {
    const [rows] = await webPool.query<RowDataPacket[]>(
      `SELECT DATE_FORMAT(wiped_at, '%Y-%m-%d %H:%i:%s') AS wiped_at,
              map_vote_session_id
       FROM stats_wipe_meta WHERE id = 1 LIMIT 1`
    );
    if (rows.length === 0) {
      return { wipedAt: null, mapVoteSessionId: null };
    }
    const wipedAt = parseMysqlDatetimeMsk(rows[0].wiped_at);
    const sessionId = rows[0].map_vote_session_id;
    return {
      wipedAt: wipedAt && !Number.isNaN(wipedAt.getTime()) ? wipedAt : null,
      mapVoteSessionId: sessionId != null ? Number(sessionId) : null,
    };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'ER_NO_SUCH_TABLE') {
      return { wipedAt: null, mapVoteSessionId: null };
    }
    throw err;
  }
}

/** Unix-секунды начала текущего вайпа (для фильтра «заходил на сервер»), или null. */
export async function getWipeSinceUnix(): Promise<number | null> {
  const useWipe = await hasWipeBaselines();
  if (!useWipe) return null;
  const { wipedAt } = await getWipeMeta();
  if (!wipedAt || Number.isNaN(wipedAt.getTime())) return null;
  return Math.floor(wipedAt.getTime() / 1000);
}

export async function hasWipeBaselines(): Promise<boolean> {
  try {
    const [rows] = await webPool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM stats_wipe_baselines LIMIT 1'
    );
    return Number(rows[0]?.cnt) > 0;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'ER_NO_SUCH_TABLE') return false;
    throw err;
  }
}

export async function getBaselinesForSteamIds(
  steamids: string[]
): Promise<Map<string, StatsRecord>> {
  const map = new Map<string, StatsRecord>();
  if (steamids.length === 0) return map;

  const unique = [...new Set(steamids.filter(Boolean))];
  const placeholders = unique.map(() => '?').join(', ');

  try {
    const [rows] = await webPool.query<RowDataPacket[]>(
      `SELECT steamid, statistics_json FROM stats_wipe_baselines WHERE steamid IN (${placeholders})`,
      unique
    );

    for (const row of rows) {
      const steamid = String(row.steamid);
      let parsed: StatsRecord = {};
      const raw = row.statistics_json;
      if (typeof raw === 'string') {
        try {
          parsed = JSON.parse(raw) as StatsRecord;
        } catch {
          parsed = {};
        }
      } else if (raw && typeof raw === 'object') {
        parsed = raw as StatsRecord;
      }
      map.set(steamid, parsed);
    }
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'ER_NO_SUCH_TABLE') return map;
    throw err;
  }

  return map;
}

/** Сохраняет текущие StatisticsDB всех игроков как базу для статистики «с вайпа». */
export async function snapshotWipeBaselines(
  mapVoteSessionId?: number | null,
  /** Момент вайпа для подписи на сайте (по умолчанию — сейчас, в МСК). */
  wipedAtOverride?: Date
): Promise<{
  wipedAt: Date;
  playersCount: number;
}> {
  const wipedAt = wipedAtOverride ?? new Date();
  const wipedAtMysql = formatMysqlDatetimeMsk(wipedAt);

  const [playerRows] = await rustPool.query<RowDataPacket[]>(
    'SELECT steamid, StatisticsDB FROM PlayerDatabase WHERE steamid IS NOT NULL AND steamid != \'\''
  );

  const connection = await webPool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM stats_wipe_baselines');

    const batchSize = 200;
    for (let i = 0; i < playerRows.length; i += batchSize) {
      const batch = playerRows.slice(i, i + batchSize);
      if (batch.length === 0) continue;

      const values: string[] = [];
      const params: string[] = [];
      for (const row of batch) {
        const steamid = String(row.steamid || '').trim();
        if (!steamid) continue;
        let statsRaw = row.StatisticsDB != null ? String(row.StatisticsDB).trim() : '';
        if (!statsRaw) statsRaw = '{}';
        try {
          JSON.parse(statsRaw);
        } catch {
          statsRaw = '{}';
        }
        values.push('(?, CAST(? AS JSON))');
        params.push(steamid, statsRaw);
      }

      if (values.length > 0) {
        await connection.query(
          `INSERT INTO stats_wipe_baselines (steamid, statistics_json) VALUES ${values.join(', ')}`,
          params
        );
      }
    }

    await connection.query(
      `INSERT INTO stats_wipe_meta (id, wiped_at, map_vote_session_id)
       VALUES (1, ?, ?)
       ON DUPLICATE KEY UPDATE wiped_at = VALUES(wiped_at), map_vote_session_id = VALUES(map_vote_session_id)`,
      [wipedAtMysql, mapVoteSessionId ?? null]
    );

    await connection.commit();
    const wipedAtParsed = parseMysqlDatetimeMsk(wipedAtMysql) ?? wipedAt;
    return { wipedAt: wipedAtParsed, playersCount: playerRows.length };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/** ID последнего закрытого голосования (для привязки снимка к вайпу). */
export async function fetchLatestClosedMapVoteSessionId(): Promise<number | null> {
  const [rows] = await webPool.query<RowDataPacket[]>(
    `SELECT id FROM map_vote_sessions
     WHERE status = 'closed' AND winner_option_id IS NOT NULL
     ORDER BY ends_at DESC
     LIMIT 1`
  );
  if (rows.length === 0) return null;
  return Number(rows[0].id);
}
