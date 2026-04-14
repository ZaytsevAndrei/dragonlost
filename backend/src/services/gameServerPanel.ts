import { webPool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import { rconService } from './rconService';

interface WinnerRow extends RowDataPacket {
  map_seed: number | null;
  map_size: number | null;
}

/** Последний победитель закрытого голосования (seed/size для вайпа). */
export async function fetchLatestVoteWinnerSeedSize(): Promise<{ seed: number; size: number } | null> {
  const [rows] = await webPool.query<WinnerRow[]>(
    `SELECT o.map_seed, o.map_size
     FROM map_vote_sessions s
     INNER JOIN map_vote_options o ON o.id = s.winner_option_id
     WHERE s.status = 'closed' AND s.winner_option_id IS NOT NULL
     ORDER BY s.ends_at DESC
     LIMIT 1`
  );
  if (rows.length === 0) return null;
  const { map_seed: seed, map_size: size } = rows[0];
  if (seed == null || size == null || !Number.isFinite(Number(seed)) || !Number.isFinite(Number(size))) {
    return null;
  }
  return { seed: Number(seed), size: Number(size) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isGameServerWipeCronDisabled(): boolean {
  return String(process.env.GAME_SERVER_WIPE_CRON || '').toLowerCase() === 'false';
}

function isRconWipeEnabled(): boolean {
  return String(process.env.GAME_SERVER_WIPE_VIA_RCON || '').toLowerCase() === 'true';
}

/** Вебхук, Pterodactyl или RCON-вайп (SurvivalHost и др., где нет API панели под seed/size). */
export function isGameServerWipeConfigured(): boolean {
  if (isGameServerWipeCronDisabled()) return false;
  if (process.env.GAME_PANEL_WEBHOOK_URL) return true;
  const base = process.env.PTERODACTYL_URL;
  const key = process.env.PTERODACTYL_CLIENT_API_KEY;
  const server = process.env.PTERODACTYL_SERVER_IDENTIFIER;
  if (base && key && server) return true;
  return isRconWipeEnabled() && rconService.isConfigured();
}

function pterodactylClientHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.PTERODACTYL_CLIENT_API_KEY}`,
    Accept: 'Application/vnd.pterodactyl.v1+json',
    'Content-Type': 'application/json',
  };
}

async function pterodactylClientFetch(path: string, init: RequestInit): Promise<Response> {
  const base = (process.env.PTERODACTYL_URL || '').replace(/\/$/, '');
  const id = process.env.PTERODACTYL_SERVER_IDENTIFIER;
  const url = `${base}/api/client/servers/${encodeURIComponent(id!)}${path}`;
  return fetch(url, { ...init, headers: { ...pterodactylClientHeaders(), ...(init.headers as Record<string, string>) } });
}

/**
 * Pterodactyl Client API: обновляет переменные яйца (имена как в панели, напр. server.seed / server.size),
 * затем restart. Нужны права API-ключа: startup.update, control.restart.
 */
async function pterodactylSetSeedSizeAndRestart(seed: number, size: number): Promise<void> {
  const seedKey = process.env.PTERODACTYL_ENV_SEED || 'server.seed';
  const sizeKey = process.env.PTERODACTYL_ENV_SIZE || 'server.size';

  const putVar = async (key: string, value: string) => {
    const res = await pterodactylClientFetch('/startup/variable', {
      method: 'PUT',
      body: JSON.stringify({ key, value }),
    });
    if (!res.ok && res.status !== 204) {
      const t = await res.text();
      throw new Error(`Pterodactyl PUT startup/variable (${key}): ${res.status} ${t.slice(0, 400)}`);
    }
  };

  await putVar(seedKey, String(seed));
  await putVar(sizeKey, String(size));
  await sleep(1500);

  const power = await pterodactylClientFetch('/power', {
    method: 'POST',
    body: JSON.stringify({ signal: 'restart' }),
  });
  if (!power.ok && power.status !== 204 && power.status !== 202) {
    const t = await power.text();
    throw new Error(`Pterodactyl POST power: ${power.status} ${t.slice(0, 400)}`);
  }
}

/** Произвольный POST для своего скрипта на хостинге. */
async function postWebhook(seed: number, size: number): Promise<void> {
  const url = process.env.GAME_PANEL_WEBHOOK_URL;
  if (!url) return;

  const secret = process.env.GAME_PANEL_WEBHOOK_SECRET;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers['X-Webhook-Secret'] = secret;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      event: 'vote_wipe_restart',
      seed,
      size,
      'server.seed': seed,
      'server.size': size,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GAME_PANEL_WEBHOOK_URL: ${res.status} ${t.slice(0, 400)}`);
  }
}

/**
 * Через RCON: выставляет seed и размер карты (имена конваров настраиваются),
 * затем `quit` — процесс падает, типичная панель (в т.ч. SurvivalHost) поднимает сервер заново.
 * Важно: если панель при каждом старте подставляет seed/size только из своих полей, их нужно
 * совпадать с голосованием вручную или использовать вебхук к своему скрипту.
 */
async function rconSetSeedSizeAndQuit(seed: number, size: number): Promise<void> {
  const seedConvar = process.env.RCON_WIPE_SEED_CONVAR || 'server.seed';
  const sizeConvar = process.env.RCON_WIPE_SIZE_CONVAR || 'server.worldsize';

  await rconService.sendCommand(`${seedConvar} ${seed}`);
  await rconService.sendCommand(`${sizeConvar} ${size}`);
  await sleep(2000);

  if (String(process.env.RCON_WIPE_SEND_QUIT || 'true').toLowerCase() !== 'false') {
    rconService.markIntentionalShutdown();
    try {
      await rconService.sendCommand('quit');
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (!/таймаут|закрыто|потеряно|closed/i.test(m)) throw e;
    }
    rconService.disconnect();
  }
}

export type WipeRunResult =
  | { ok: true; mode: 'webhook' | 'pterodactyl' | 'rcon'; seed: number; size: number }
  | { ok: false; reason: 'not_configured' | 'no_winner' };

/**
 * Пятничный вайп: вебхук → иначе Pterodactyl → иначе RCON (+ quit).
 */
export async function runGameServerWipeFromLatestVote(): Promise<WipeRunResult> {
  if (!isGameServerWipeConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }

  const winner = await fetchLatestVoteWinnerSeedSize();
  if (!winner) {
    return { ok: false, reason: 'no_winner' };
  }

  if (process.env.GAME_PANEL_WEBHOOK_URL) {
    await postWebhook(winner.seed, winner.size);
    return { ok: true, mode: 'webhook', seed: winner.seed, size: winner.size };
  }

  const base = process.env.PTERODACTYL_URL;
  const key = process.env.PTERODACTYL_CLIENT_API_KEY;
  const server = process.env.PTERODACTYL_SERVER_IDENTIFIER;
  if (base && key && server) {
    await pterodactylSetSeedSizeAndRestart(winner.seed, winner.size);
    return { ok: true, mode: 'pterodactyl', seed: winner.seed, size: winner.size };
  }

  if (isRconWipeEnabled() && rconService.isConfigured()) {
    await rconSetSeedSizeAndQuit(winner.seed, winner.size);
    return { ok: true, mode: 'rcon', seed: winner.seed, size: winner.size };
  }

  return { ok: false, reason: 'not_configured' };
}
