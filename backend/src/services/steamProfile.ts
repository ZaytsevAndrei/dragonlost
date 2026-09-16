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

  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) {
    cacheSet(steamid, null);
    return null;
  }

  try {
    const url =
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/` +
      `?key=${encodeURIComponent(apiKey)}&steamids=${encodeURIComponent(steamid)}`;
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      console.error(`[SteamProfile] GetPlayerSummaries вернул ${response.status}`);
      cacheSet(steamid, null);
      return null;
    }

    const payload = (await response.json()) as {
      response?: { players?: Array<Record<string, unknown>> };
    };
    const raw = payload.response?.players?.[0];
    if (!raw) {
      cacheSet(steamid, null);
      return null;
    }

    const profile: SteamProfile = {
      steamid: String(raw.steamid ?? steamid),
      personaname: String(raw.personaname ?? 'Игрок'),
      avatarfull: String(raw.avatarfull ?? ''),
      profileurl: typeof raw.profileurl === 'string' ? raw.profileurl : undefined,
    };
    cacheSet(steamid, profile);
    return profile;
  } catch (error) {
    console.error('[SteamProfile] Ошибка запроса к Steam API:', error instanceof Error ? error.message : error);
    cacheSet(steamid, null);
    return null;
  }
}
