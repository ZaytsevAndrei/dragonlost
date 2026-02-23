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

function extractMapPageUrl(apiData: Record<string, unknown>, seed: number, size: number): string {
  const url = apiData.url as string | undefined;
  if (url && url.startsWith('https://rustmaps.com/')) return url;

  const mapId = (apiData.mapId as string) || (apiData.id as string);
  if (mapId) return `https://rustmaps.com/map/${mapId}`;

  return `https://rustmaps.com/map/${size}_${seed}`;
}

async function verifyUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
}

async function getMapFromApi(seed: number, size: number): Promise<RustMapResult | null> {
  try {
    const res = await fetch(`${RUSTMAPS_V2_BASE}/${seed}/${size}`, {
      headers: { 'X-API-Key': RUSTMAPS_API_KEY || '' },
    });

    if (!res.ok) return null;

    const json = await res.json() as Record<string, unknown>;
    const map = (json.data as Record<string, unknown>) || json;

    console.log(`[RustMaps] GET ${seed}/${size} -> full response keys: ${Object.keys(map).join(', ')}`);
    console.log(`[RustMaps]   id=${map.id}, url=${map.url}, imageUrl=${map.imageUrl}, thumbnailUrl=${map.thumbnailUrl}, imageIconUrl=${map.imageIconUrl}`);

    const mapId = (map.id as string) || null;
    const imageUrl = (map.imageUrl as string) || (map.imageIconUrl as string) || null;
    const thumbnailUrl = (map.thumbnailUrl as string) || null;
    const mapPageUrl = extractMapPageUrl(map, seed, size);

    return {
      seed,
      size,
      mapId,
      imageUrl,
      thumbnailUrl,
      mapPageUrl,
      ready: true,
    };
  } catch (err) {
    console.error(`[RustMaps] GET ${seed}/${size} error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function triggerMapGeneration(seed: number, size: number): Promise<string | null> {
  try {
    const res = await fetch(`${RUSTMAPS_V2_BASE}/${seed}/${size}`, {
      method: 'POST',
      headers: { 'X-API-Key': RUSTMAPS_API_KEY || '' },
    });

    if (res.ok || res.status === 409) {
      const json = await res.json() as Record<string, unknown>;
      const map = (json.data as Record<string, unknown>) || json;
      console.log(`[RustMaps] POST v2 ${seed}/${size} -> status=${res.status}, id=${map.id}`);
      return (map.id as string) || (map.mapId as string) || null;
    }

    console.log(`[RustMaps] POST v2 ${seed}/${size} -> status=${res.status}, trying v4...`);

    const v4Res = await fetch('https://api.rustmaps.com/v4/maps', {
      method: 'POST',
      headers: {
        'X-API-Key': RUSTMAPS_API_KEY || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ seed, size, staging: false }),
    });

    if (!v4Res.ok) {
      console.log(`[RustMaps] POST v4 ${seed}/${size} -> status=${v4Res.status}`);
      return null;
    }

    const v4Json = await v4Res.json() as Record<string, unknown>;
    const v4Map = (v4Json.data as Record<string, unknown>) || v4Json;
    console.log(`[RustMaps] POST v4 ${seed}/${size} -> id=${v4Map.id || v4Map.mapId}`);
    return (v4Map.id as string) || (v4Map.mapId as string) || null;
  } catch (err) {
    console.error(`[RustMaps] trigger ${seed}/${size} error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function getOrGenerateMap(seed: number, size: number): Promise<RustMapResult> {
  const existing = await getMapFromApi(seed, size);
  if (existing) return existing;

  await triggerMapGeneration(seed, size);

  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(3000);
    const result = await getMapFromApi(seed, size);
    if (result) return result;
  }

  return {
    seed,
    size,
    mapId: null,
    imageUrl: null,
    thumbnailUrl: null,
    mapPageUrl: `https://rustmaps.com/map/${size}_${seed}`,
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
  count: number = 3
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

  for (const r of results) {
    if (r.mapPageUrl) {
      const ok = await verifyUrl(r.mapPageUrl);
      console.log(`[RustMaps] Verify ${r.mapPageUrl} -> ${ok ? 'OK' : '404/fail'}`);
      if (!ok) {
        const fallback = `https://rustmaps.com/map/${r.size}_${r.seed}`;
        if (fallback !== r.mapPageUrl) {
          const fallbackOk = await verifyUrl(fallback);
          console.log(`[RustMaps] Verify fallback ${fallback} -> ${fallbackOk ? 'OK' : '404/fail'}`);
          if (fallbackOk) {
            r.mapPageUrl = fallback;
          }
        }
      }
    }
  }

  const readyCount = results.filter((r) => r.ready).length;
  console.log(`[RustMaps] Готово: ${readyCount}/${count}`);

  return results;
}
