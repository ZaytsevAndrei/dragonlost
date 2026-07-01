import fetch from 'node-fetch';
import { getApiUrl, getBotApiKey } from './env';

export class BotApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly secondsUntilAvailable?: number,
  ) {
    super(message);
    this.name = 'BotApiError';
  }
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const botApiKey = getBotApiKey();
  if (!botApiKey) {
    throw new BotApiError('BOT_API_KEY не настроен на сервере бота', 503);
  }

  const response = await fetch(`${getApiUrl()}/bot${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Bot-Api-Key': botApiKey,
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    seconds_until_available?: number;
  } & T;

  if (!response.ok) {
    throw new BotApiError(
      payload.error || `HTTP ${response.status}`,
      response.status,
      payload.seconds_until_available,
    );
  }

  return payload as T;
}

export interface BotStatus {
  linked: boolean;
  steam_username: string | null;
  bonus_available: boolean;
  seconds_until_available: number;
  total_claims: number;
}

export interface LinkResult {
  success: boolean;
  username: string;
  steamid: string;
}

export interface BonusResult {
  success: boolean;
  item_name: string;
  quantity: number;
  rust_item_code: string;
  inventory_id: number;
  next_claim_at: string;
}

export function getBotStatus(telegramId: number): Promise<BotStatus> {
  return request<BotStatus>(`/status/${telegramId}`);
}

export function linkAccount(input: {
  telegramId: number;
  code: string;
  telegramUsername?: string | null;
}): Promise<LinkResult> {
  return request<LinkResult>('/link', {
    method: 'POST',
    body: {
      telegram_id: input.telegramId,
      code: input.code,
      telegram_username: input.telegramUsername ?? null,
    },
  });
}

export function claimBonus(telegramId: number): Promise<BonusResult> {
  return request<BonusResult>('/bonus/claim', {
    method: 'POST',
    body: { telegram_id: telegramId },
  });
}
