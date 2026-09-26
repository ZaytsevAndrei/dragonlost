import fetch from 'node-fetch';

/**
 * Публичные профили Steam (имя + аватар) для страниц игроков и OG-превью.
 * GetPlayerSummaries кэшируется в памяти на час.
 */

export interface SteamProfile {
  steamid: string;
  personaname: string;
  avatarfull: string;
  profileurl?: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_LIMIT = 1000;

const cache = new Map<string, { data: SteamProfile | null; expiresAt: number }>();

function cacheGet(steamid: string): { data: SteamProfile | null; expiresAt: number } | undefined {
  const hit = cache.get(steamid);
  if (hit && hit.expiresAt > Date.now()) return hit;
  if (hit) cache.delete(steamid);
  return undefined;
}

function cacheSet(steamid: string, data: SteamProfile | null): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(steamid, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Steam ID64 — 17 цифр. */
export function isValidSteamId64(steamid: string): boolean {
  return /^\d{17}$/.test(steamid);
}

export async function getSteamProfile(steamid: string): Promise<SteamProfile | null> {
  if (!isValidSteamId64(steamid)) return null;

  const cached = cacheGet(steamid);
  if (cached) return cached.data;

  const profiles = await fetchSteamProfilesUncached([steamid]);
  return profiles.get(steamid) ?? null;
}

/** Профили нескольких игроков: сначала кэш, недостающие — одним запросом GetPlayerSummaries. */
export async function getSteamProfiles(steamids: string[]): Promise<Map<string, SteamProfile>> {
  const result = new Map<string, SteamProfile>();
  const missing: string[] = [];

  for (const steamid of new Set(steamids)) {
    if (!isValidSteamId64(steamid)) continue;
    const cached = cacheGet(steamid);
    if (cached?.data) result.set(steamid, cached.data);
    else missing.push(steamid);
  }

  if (missing.length > 0) {
    const fetched = await fetchSteamProfilesUncached(missing);
    for (const [steamid, profile] of fetched) result.set(steamid, profile);
  }

  return result;
}

/**
 * Актуальный ник игрока без кэша — для проверки метки колеса удачи:
 * игрок меняет ник и сразу жмёт «Проверить», часовой кэш здесь мешает.
 */
export async function getFreshSteamNickname(steamid: string): Promise<string | null> {
  if (!isValidSteamId64(steamid)) return null;
  const profiles = await fetchSteamProfilesUncached([steamid], { updateCache: false });
  return profiles.get(steamid)?.personaname ?? null;
}

async function fetchSteamProfilesUncached(
  steamids: string[],
  options: { updateCache?: boolean } = {}
): Promise<Map<string, SteamProfile>> {
  const result = new Map<string, SteamProfile>();
  const apiKey = process.env.STEAM_API_KEY;
  if (steamids.length === 0 || !apiKey) return result;

  try {
    const url =
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/` +
      `?key=${encodeURIComponent(apiKey)}&steamids=${encodeURIComponent(steamids.join(','))}`;
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      console.error(`[SteamProfile] GetPlayerSummaries вернул ${response.status}`);
      return result;
    }

    const payload = (await response.json()) as {
      response?: { players?: Array<Record<string, unknown>> };
    };
    for (const raw of payload.response?.players ?? []) {
      const steamid = String(raw.steamid ?? '');
      if (!steamid) continue;
      const profile: SteamProfile = {
        steamid,
        personaname: String(raw.personaname ?? 'Игрок'),
        avatarfull: String(raw.avatarfull ?? ''),
        profileurl: typeof raw.profileurl === 'string' ? raw.profileurl : undefined,
      };
      result.set(steamid, profile);
      if (options.updateCache !== false) cacheSet(steamid, profile);
    }
  } catch (error) {
    console.error('[SteamProfile] Ошибка запроса к Steam API:', error instanceof Error ? error.message : error);
  }

  return result;
}
