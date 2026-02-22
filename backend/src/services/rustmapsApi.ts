import { webPool } from '../config/database';
import { RowDataPacket } from 'mysql2';

const RUSTMAPS_API_KEY = process.env.RUSTMAPS_API_KEY;
const RUSTMAPS_V2_BASE = 'https://rustmaps.com/api/v2/maps';

export interface RustMapResult {
  seed: number;
  size: number;
  mapId: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  mapPageUrl: string;
  ready: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateRandomSeed(): number {
  return Math.floor(Math.random() * 2147483647) + 1;
}

async function getMapFromApi(seed: number, size: number): Promise<RustMapResult | null> {
  try {
    const res = await fetch(`${RUSTMAPS_V2_BASE}/${seed}/${size}`, {
      headers: { 'X-API-Key': RUSTMAPS_API_KEY || '' },
    });

    if (!res.ok) return null;

    const json = await res.json() as Record<string, unknown>;
    const map = (json.data as Record<string, unknown>) || json;
    const mapId = (map.id as string) || null;

    console.log(`[RustMaps] GET ${seed}/${size} -> id=${mapId}, imageUrl=${map.imageUrl}, thumbnailUrl=${map.thumbnailUrl}`);

    return {
      seed,
      size,
      mapId,
      imageUrl: (map.imageUrl as string) || (map.imageIconUrl as string) || null,
      thumbnailUrl: (map.thumbnailUrl as string) || null,
      mapPageUrl: (map.url as string) || (mapId ? `https://rustmaps.com/map/${mapId}` : ''),
      ready: true,
    };
  } catch {
    return null;
  }
}

async function triggerMapGeneration(seed: number, size: number): Promise<string | null> {
  try {
    const res = await fetch(`${RUSTMAPS_V2_BASE}/${seed}/${size}`, {
      method: 'POST',
      headers: { 'X-API-Key': RUSTMAPS_API_KEY || '' },
    });

    if (!res.ok) {
      const v4Res = await fetch('https://api.rustmaps.com/v4/maps', {
        method: 'POST',
        headers: {
          'X-API-Key': RUSTMAPS_API_KEY || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ seed, size, staging: false }),
      });

      if (!v4Res.ok) return null;
      const v4Json = await v4Res.json() as Record<string, unknown>;
      const v4Map = (v4Json.data as Record<string, unknown>) || v4Json;
      return (v4Map.mapId as string) || (v4Map.id as string) || null;
    }

    const json = await res.json() as Record<string, unknown>;
    const map = (json.data as Record<string, unknown>) || json;
    return (map.mapId as string) || (map.id as string) || null;
  } catch {
    return null;
  }
}

async function getOrGenerateMap(seed: number, size: number): Promise<RustMapResult> {
  const existing = await getMapFromApi(seed, size);
  if (existing) return existing;

  const mapId = await triggerMapGeneration(seed, size);

  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(3000);
    const result = await getMapFromApi(seed, size);
    if (result) return result;
  }

  return {
    seed,
    size,
    mapId: mapId || null,
    imageUrl: null,
    thumbnailUrl: null,
    mapPageUrl: mapId ? `https://rustmaps.com/map/${mapId}` : '',
    ready: false,
  };
}

async function getUsedSeeds(): Promise<number[]> {
  try {
    const [rows] = await webPool.query<(RowDataPacket & { map_seed: number })[]>(
      `SELECT DISTINCT o.map_seed
       FROM map_vote_options o
       INNER JOIN map_vote_sessions s ON s.id = o.session_id
       WHERE o.map_seed IS NOT NULL
         AND s.status IN ('active', 'closed')
         AND s.created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 6 MONTH)`
    );
    return rows.map((r) => r.map_seed);
  } catch {
    return [];
  }
}

export async function generateRandomMaps(
  size: number,
  count: number = 5
): Promise<RustMapResult[]> {
  if (!RUSTMAPS_API_KEY) {
    throw new Error('RUSTMAPS_API_KEY не настроен');
  }

  const usedSeeds = await getUsedSeeds();
  const excludeSet = new Set(usedSeeds);
  const seeds: number[] = [];

  while (seeds.length < count) {
    const seed = generateRandomSeed();
    if (!excludeSet.has(seed) && !seeds.includes(seed)) {
      seeds.push(seed);
    }
  }

  console.log(`[RustMaps] Генерация ${count} карт (size=${size}), seeds: ${seeds.join(', ')}`);

  const results = await Promise.all(seeds.map((seed) => getOrGenerateMap(seed, size)));

  const readyCount = results.filter((r) => r.ready).length;
  console.log(`[RustMaps] Готово: ${readyCount}/${count}`);

  return results;
}
