import { webPool } from '../config/database';
import { RowDataPacket } from 'mysql2';

const RUSTMAPS_API_KEY = process.env.RUSTMAPS_API_KEY;
const RUSTMAPS_V2_BASE = 'https://rustmaps.com/api/v2/maps';
const RUSTMAPS_V4_BASE = 'https://api.rustmaps.com/v4/maps';

/** Совпадает с телом POST /v4/maps и query staging у GET по seed/size. */
const RUST_STAGING = false;

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

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function isFailedMeta(json: Record<string, unknown>): boolean {
  const meta = json.meta as Record<string, unknown> | undefined;
  return meta?.status === 'Failed';
}

function getV4DataObject(json: Record<string, unknown>): Record<string, unknown> | null {
  if (isFailedMeta(json)) return null;
  const d = json.data;
  if (d && typeof d === 'object' && !Array.isArray(d)) return d as Record<string, unknown>;
  return null;
}

function getV4DataArray(json: Record<string, unknown>): Record<string, unknown>[] {
  if (isFailedMeta(json)) return [];
  const d = json.data;
  if (!Array.isArray(d)) return [];
  return d.filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object');
}

function extractMapPageUrl(apiData: Record<string, unknown>, seed: number, size: number): string {
  const url = apiData.url as string | undefined;
  if (url && /^https:\/\/(www\.)?rustmaps\.com\//i.test(url)) return url;

  const mapId = (apiData.mapId as string) || (apiData.id as string);
  if (mapId) return `https://rustmaps.com/map/${mapId}`;

  return `https://rustmaps.com/map/${size}_${seed}`;
}

function mapV4DtoToResult(map: Record<string, unknown>, ready: boolean): RustMapResult {
  const seed = Number(map.seed);
  const size = Number(map.size);
  return {
    seed: Number.isFinite(seed) ? seed : 0,
    size: Number.isFinite(size) ? size : 0,
    mapId: (map.id as string) || (map.mapId as string) || null,
    imageUrl:
      (map.imageUrl as string) || (map.imageIconUrl as string) || (map.rawImageUrl as string) || null,
    thumbnailUrl: (map.thumbnailUrl as string) || null,
    mapPageUrl: extractMapPageUrl(map, Number.isFinite(seed) ? seed : 0, Number.isFinite(size) ? size : 0),
    ready,
  };
}

async function fetchV4MapBySeedSize(seed: number, size: number): Promise<RustMapResult | null> {
  try {
    const url = new URL(`${RUSTMAPS_V4_BASE}/${size}/${seed}`);
    url.searchParams.set('staging', String(RUST_STAGING));

    const res = await fetch(url.toString(), {
      headers: { 'X-API-Key': RUSTMAPS_API_KEY || '' },
    });

    if (res.status !== 200) return null;

    const json = await res.json() as Record<string, unknown>;
    const map = getV4DataObject(json);
    if (!map) return null;

    return mapV4DtoToResult(map, true);
  } catch (err) {
    console.error(`[RustMaps] v4 GET ${size}/${seed}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function fetchV4MapById(mapId: string): Promise<RustMapResult | null> {
  try {
    const res = await fetch(`${RUSTMAPS_V4_BASE}/${encodeURIComponent(mapId)}`, {
      headers: { 'X-API-Key': RUSTMAPS_API_KEY || '' },
    });

    if (res.status !== 200) return null;

    const json = await res.json() as Record<string, unknown>;
    const map = getV4DataObject(json);
    if (!map) return null;

    return mapV4DtoToResult(map, true);
  } catch (err) {
    console.error(`[RustMaps] v4 GET id ${mapId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function verifyUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
}

async function getMapFromV2Api(seed: number, size: number): Promise<RustMapResult | null> {
  try {
    const res = await fetch(`${RUSTMAPS_V2_BASE}/${seed}/${size}`, {
      headers: { 'X-API-Key': RUSTMAPS_API_KEY || '' },
    });

    if (!res.ok) return null;

    const json = await res.json() as Record<string, unknown>;
    const map = (json.data as Record<string, unknown>) || json;

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
    console.error(`[RustMaps] v2 GET ${seed}/${size}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Сначала v4 (канонический url), затем v2. */
async function getMapFromApi(seed: number, size: number): Promise<RustMapResult | null> {
  const v4 = await fetchV4MapBySeedSize(seed, size);
  if (v4) return v4;
  return getMapFromV2Api(seed, size);
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
      return (map.id as string) || (map.mapId as string) || null;
    }

    const v4Res = await fetch(`${RUSTMAPS_V4_BASE}`, {
      method: 'POST',
      headers: {
        'X-API-Key': RUSTMAPS_API_KEY || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ seed, size, staging: RUST_STAGING }),
    });

    if (!v4Res.ok) return null;

    const v4Json = await v4Res.json() as Record<string, unknown>;
    const v4Map = getV4DataObject(v4Json) || ((v4Json.data as Record<string, unknown>) || v4Json);
    return (v4Map.id as string) || (v4Map.mapId as string) || null;
  } catch (err) {
    console.error(`[RustMaps] trigger ${seed}/${size}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function getOrGenerateMap(seed: number, size: number): Promise<RustMapResult> {
  const existing = await getMapFromApi(seed, size);
  if (existing) return existing;

  const triggeredId = await triggerMapGeneration(seed, size);

  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(3000);
    if (triggeredId) {
      const byId = await fetchV4MapById(triggeredId);
      if (byId && byId.seed === seed && byId.size === size) return byId;
    }
    const result = await getMapFromApi(seed, size);
    if (result) return result;
  }

  return {
    seed,
    size,
    mapId: triggeredId,
    imageUrl: null,
    thumbnailUrl: null,
    mapPageUrl: extractMapPageUrl({ id: triggeredId || undefined }, seed, size),
    ready: false,
  };
}

interface MapThumbnailRow {
  mapId?: string | null;
  seed?: number;
  size?: number;
  url?: string | null;
}

async function searchMapsPage(page: number, mapSize: number): Promise<MapThumbnailRow[]> {
  const url = new URL(`${RUSTMAPS_V4_BASE}/search`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('staging', String(RUST_STAGING));
  url.searchParams.set('includeAllProtocols', 'false');
  url.searchParams.set('customMaps', 'false');

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'X-API-Key': RUSTMAPS_API_KEY || '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      searchQuery: {
        size: { min: mapSize, max: mapSize },
      },
    }),
  });

  if (!res.ok) {
    console.log(`[RustMaps] search page=${page} size=${mapSize} -> ${res.status}`);
    return [];
  }

  const json = await res.json() as Record<string, unknown>;
  return getV4DataArray(json) as MapThumbnailRow[];
}

/** Подбирает карты из каталога поиска с корректными ссылками из API. */
async function pickMapsFromSearch(
  mapSize: number,
  count: number,
  excludeSeeds: Set<number>
): Promise<RustMapResult[]> {
  const results: RustMapResult[] = [];
  const picked = new Set<number>();
  let page = Math.floor(Math.random() * 6);
  const maxPages = 36;

  for (let step = 0; step < maxPages && results.length < count; step++) {
    const rows = await searchMapsPage(page, mapSize);
    if (!rows.length) {
      page = (page + 1) % 200;
      continue;
    }

    const candidates = rows.filter(
      (r) =>
        typeof r.seed === 'number' &&
        r.size === mapSize &&
        !excludeSeeds.has(r.seed) &&
        !picked.has(r.seed)
    );
    shuffleInPlace(candidates);

    for (const row of candidates) {
      if (results.length >= count) break;
      const seed = row.seed as number;

      const full = await fetchV4MapBySeedSize(seed, mapSize);
      if (full) {
        picked.add(seed);
        results.push(full);
        continue;
      }

      if (row.mapId) {
        const byId = await fetchV4MapById(row.mapId);
        if (byId && byId.size === mapSize) {
          picked.add(byId.seed);
          results.push(byId);
          continue;
        }
      }

      if (row.url && /^https:\/\/(www\.)?rustmaps\.com\//i.test(row.url)) {
        picked.add(seed);
        results.push({
          seed,
          size: mapSize,
          mapId: row.mapId || null,
          imageUrl: null,
          thumbnailUrl: null,
          mapPageUrl: row.url,
          ready: true,
        });
      }
    }

    page++;
  }

  return results;
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

  const fromSearch = await pickMapsFromSearch(size, count, excludeSet);
  for (const r of fromSearch) excludeSet.add(r.seed);

  const seeds: number[] = [];
  while (seeds.length < count - fromSearch.length) {
    const seed = generateRandomSeed();
    if (!excludeSet.has(seed) && !seeds.includes(seed)) {
      seeds.push(seed);
      excludeSet.add(seed);
    }
  }

  const generated =
    seeds.length > 0 ? await Promise.all(seeds.map((seed) => getOrGenerateMap(seed, size))) : [];

  const results = [...fromSearch, ...generated];

  for (const r of results) {
    if (!r.mapPageUrl) continue;
    const ok = await verifyUrl(r.mapPageUrl);
    if (!ok) {
      const fallback = `https://rustmaps.com/map/${r.size}_${r.seed}`;
      if (fallback !== r.mapPageUrl) {
        const fallbackOk = await verifyUrl(fallback);
        if (fallbackOk) r.mapPageUrl = fallback;
      }
    }
  }

  const readyCount = results.filter((r) => r.ready).length;
  console.log(`[RustMaps] Готово: ${readyCount}/${count} (каталог: ${fromSearch.length}, генерация: ${generated.length})`);

  return results;
}
