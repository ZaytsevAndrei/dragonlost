import crypto from 'crypto';
import { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import { webPool } from '../config/database';
import { ensureWebUser } from './userProvisioning';

const BONUS_COOLDOWN_HOURS = 12;
const LINK_CODE_TTL_MINUTES = 10;
const LINK_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface LootEntry {
  rustItemCode: string;
  min: number;
  max: number;
}

const LOOT_TABLE: LootEntry[] = [
  { rustItemCode: 'stones', min: 1000, max: 2900 },
  { rustItemCode: 'wood', min: 1000, max: 2900 },
  { rustItemCode: 'metal.fragments', min: 200, max: 1500 },
  { rustItemCode: 'scrap', min: 10, max: 50 },
  { rustItemCode: 'cloth', min: 30, max: 200 },
  { rustItemCode: 'lowgradefuel', min: 30, max: 150 },
  { rustItemCode: 'charcoal', min: 200, max: 600 },
  { rustItemCode: 'bow.compound', min: 1, max: 1 },
  { rustItemCode: 'cupboard.tool', min: 1, max: 1 },
];

interface ShopItemRow extends RowDataPacket {
  id: number;
  name: string;
  rust_item_code: string;
}

interface LinkRow extends RowDataPacket {
  steamid: string;
  telegram_username: string | null;
}

interface BonusClaimRow extends RowDataPacket {
  last_claimed_at: Date;
  total_claims: number;
  seconds_until_available: number;
}

interface UserRow extends RowDataPacket {
  username: string;
}

function secureRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  const bytes = crypto.randomBytes(4);
  const value = bytes.readUInt32BE(0);
  return value % maxExclusive;
}

function randomIntInclusive(min: number, max: number): number {
  if (min >= max) return min;
  return min + secureRandomInt(max - min + 1);
}

function generateLinkCode(): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += LINK_CODE_CHARS[secureRandomInt(LINK_CODE_CHARS.length)];
  }
  return code;
}

function rollBonusReward(): { rustItemCode: string; quantity: number } {
  const entry = LOOT_TABLE[secureRandomInt(LOOT_TABLE.length)];
  const quantity = randomIntInclusive(entry.min, entry.max);
  return { rustItemCode: entry.rustItemCode, quantity };
}

export function getTelegramBotUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME?.trim() || 'DragonLostBot';
}

export async function getTelegramLinkStatus(steamid: string) {
  const [rows] = await webPool.query<LinkRow[]>(
    'SELECT steamid, telegram_username FROM telegram_links WHERE steamid = ? LIMIT 1',
    [steamid],
  );

  return {
    linked: rows.length > 0,
    telegram_username: rows[0]?.telegram_username ?? null,
    bot_username: getTelegramBotUsername(),
  };
}

export async function createTelegramLinkCode(steamid: string): Promise<{ code: string; expires_in_seconds: number }> {
  const status = await getTelegramLinkStatus(steamid);
  if (status.linked) {
    throw new Error('ALREADY_LINKED');
  }

  const connection = await webPool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query('DELETE FROM telegram_link_codes WHERE steamid = ?', [steamid]);

    let code = '';
    let inserted = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      code = generateLinkCode();
      try {
        await connection.query<ResultSetHeader>(
          `INSERT INTO telegram_link_codes (code, steamid, expires_at)
           VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE)`,
          [code, steamid, LINK_CODE_TTL_MINUTES],
        );
        inserted = true;
        break;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '';
        if (!message.includes('Duplicate')) {
          throw err;
        }
      }
    }

    if (!inserted) {
      throw new Error('CODE_GENERATION_FAILED');
    }

    await connection.commit();
    return { code, expires_in_seconds: LINK_CODE_TTL_MINUTES * 60 };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function linkTelegramAccount(input: {
  telegramId: number;
  code: string;
  telegramUsername?: string | null;
}): Promise<{ steamid: string; username: string }> {
  const normalizedCode = String(input.code || '').trim().toUpperCase();
  if (!normalizedCode) {
    throw new Error('INVALID_CODE');
  }

  const connection = await webPool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingTelegram] = await connection.query<LinkRow[]>(
      'SELECT steamid FROM telegram_links WHERE telegram_id = ? LIMIT 1 FOR UPDATE',
      [input.telegramId],
    );
    if (existingTelegram.length > 0) {
      throw new Error('TELEGRAM_ALREADY_LINKED');
    }

    const [codeRows] = await connection.query<(RowDataPacket & { steamid: string; expires_at: Date })[]>(
      `SELECT steamid, expires_at FROM telegram_link_codes
       WHERE code = ? AND expires_at > UTC_TIMESTAMP()
       LIMIT 1 FOR UPDATE`,
      [normalizedCode],
    );
    if (codeRows.length === 0) {
      throw new Error('CODE_INVALID_OR_EXPIRED');
    }

    const steamid = codeRows[0].steamid;

    const [existingSteam] = await connection.query<LinkRow[]>(
      'SELECT telegram_id FROM telegram_links WHERE steamid = ? LIMIT 1 FOR UPDATE',
      [steamid],
    );
    if (existingSteam.length > 0) {
      throw new Error('STEAM_ALREADY_LINKED');
    }

    const [userRows] = await connection.query<UserRow[]>(
      'SELECT username FROM users WHERE steamid = ? LIMIT 1',
      [steamid],
    );
    const username = userRows[0]?.username ?? 'Игрок';

    await connection.query<ResultSetHeader>(
      `INSERT INTO telegram_links (telegram_id, steamid, telegram_username)
       VALUES (?, ?, ?)`,
      [input.telegramId, steamid, input.telegramUsername ?? null],
    );

    await connection.query('DELETE FROM telegram_link_codes WHERE code = ?', [normalizedCode]);
    await connection.query('DELETE FROM telegram_link_codes WHERE steamid = ?', [steamid]);

    await connection.commit();
    return { steamid, username };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function findShopItem(connection: PoolConnection, rustItemCode: string): Promise<ShopItemRow> {
  const [rows] = await connection.query<ShopItemRow[]>(
    'SELECT id, name, rust_item_code FROM shop_items WHERE rust_item_code = ? LIMIT 1',
    [rustItemCode],
  );
  if (rows.length === 0) {
    throw new Error(`SHOP_ITEM_NOT_FOUND:${rustItemCode}`);
  }
  return rows[0];
}

export async function getTelegramBotStatus(telegramId: number) {
  const [linkRows] = await webPool.query<(LinkRow & { username: string })[]>(
    `SELECT tl.steamid, tl.telegram_username, u.username
     FROM telegram_links tl
     JOIN users u ON u.steamid = tl.steamid
     WHERE tl.telegram_id = ?
     LIMIT 1`,
    [telegramId],
  );

  if (linkRows.length === 0) {
    return {
      linked: false,
      steam_username: null,
      bonus_available: false,
      seconds_until_available: 0,
      total_claims: 0,
    };
  }

  const link = linkRows[0];
  const [claimRows] = await webPool.query<BonusClaimRow[]>(
    `SELECT last_claimed_at, total_claims,
            GREATEST(0, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), last_claimed_at + INTERVAL ? HOUR)) AS seconds_until_available
     FROM telegram_bonus_claims
     WHERE telegram_id = ?
     LIMIT 1`,
    [BONUS_COOLDOWN_HOURS, telegramId],
  );

  const secondsUntil = claimRows.length > 0 ? Number(claimRows[0].seconds_until_available) : 0;

  return {
    linked: true,
    steam_username: link.username,
    telegram_username: link.telegram_username,
    bonus_available: secondsUntil === 0,
    seconds_until_available: secondsUntil,
    total_claims: claimRows[0]?.total_claims ?? 0,
  };
}

export async function claimTelegramBonus(telegramId: number) {
  const connection = await webPool.getConnection();
  try {
    await connection.beginTransaction();

    const [linkRows] = await connection.query<(LinkRow & { username: string })[]>(
      `SELECT tl.steamid, tl.telegram_username, u.username
       FROM telegram_links tl
       JOIN users u ON u.steamid = tl.steamid
       WHERE tl.telegram_id = ?
       LIMIT 1 FOR UPDATE`,
      [telegramId],
    );

    if (linkRows.length === 0) {
      throw new Error('NOT_LINKED');
    }

    const { steamid, username } = linkRows[0];

    await ensureWebUser(connection, { steamid, username });

    const [claimRows] = await connection.query<BonusClaimRow[]>(
      `SELECT last_claimed_at, total_claims,
              TIMESTAMPDIFF(HOUR, last_claimed_at, UTC_TIMESTAMP()) AS hours_since_claim
       FROM telegram_bonus_claims
       WHERE telegram_id = ?
       LIMIT 1 FOR UPDATE`,
      [telegramId],
    );

    if (claimRows.length > 0 && Number(claimRows[0].hours_since_claim) < BONUS_COOLDOWN_HOURS) {
      const secondsLeft = Math.max(
        0,
        BONUS_COOLDOWN_HOURS * 3600 -
          Math.floor((Date.now() - new Date(claimRows[0].last_claimed_at).getTime()) / 1000),
      );
      throw new Error(`COOLDOWN:${secondsLeft}`);
    }

    const reward = rollBonusReward();
    const shopItem = await findShopItem(connection, reward.rustItemCode);

    const [inventoryResult] = await connection.query<ResultSetHeader>(
      `INSERT INTO player_inventory (steamid, shop_item_id, quantity, status)
       VALUES (?, ?, ?, 'pending')`,
      [steamid, shopItem.id, reward.quantity],
    );

    if (claimRows.length === 0) {
      await connection.query(
        `INSERT INTO telegram_bonus_claims (telegram_id, steamid, last_claimed_at, total_claims)
         VALUES (?, ?, UTC_TIMESTAMP(), 1)`,
        [telegramId, steamid],
      );
    } else {
      await connection.query(
        `UPDATE telegram_bonus_claims
         SET last_claimed_at = UTC_TIMESTAMP(), total_claims = total_claims + 1
         WHERE telegram_id = ?`,
        [telegramId],
      );
    }

    await connection.query(
      `INSERT INTO transactions (steamid, type, amount, description, reference_id)
       VALUES (?, 'earn', 0, ?, ?)`,
      [
        steamid,
        `Telegram bonus: ${shopItem.name} x${reward.quantity}`,
        inventoryResult.insertId,
      ],
    );

    await connection.commit();

    const nextClaimAt = new Date(Date.now() + BONUS_COOLDOWN_HOURS * 3600 * 1000);

    return {
      item_name: shopItem.name,
      quantity: reward.quantity,
      rust_item_code: reward.rustItemCode,
      inventory_id: inventoryResult.insertId,
      next_claim_at: nextClaimAt.toISOString(),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function mapTelegramServiceError(error: unknown): { status: number; message: string; seconds_until_available?: number } {
  const raw = error instanceof Error ? error.message : String(error);

  if (raw === 'ALREADY_LINKED') {
    return { status: 409, message: 'Telegram уже привязан к вашему аккаунту' };
  }
  if (raw === 'INVALID_CODE') {
    return { status: 400, message: 'Укажите код привязки' };
  }
  if (raw === 'CODE_GENERATION_FAILED') {
    return { status: 500, message: 'Не удалось сгенерировать код' };
  }
  if (raw === 'TELEGRAM_ALREADY_LINKED') {
    return { status: 409, message: 'Этот Telegram уже привязан к другому аккаунту' };
  }
  if (raw === 'CODE_INVALID_OR_EXPIRED') {
    return { status: 400, message: 'Код неверный или истёк. Получите новый на сайте' };
  }
  if (raw === 'STEAM_ALREADY_LINKED') {
    return { status: 409, message: 'Этот Steam-аккаунт уже привязан к другому Telegram' };
  }
  if (raw === 'NOT_LINKED') {
    return { status: 403, message: 'Сначала привяжите аккаунт: dragonlost.ru/telegram' };
  }
  if (raw.startsWith('COOLDOWN:')) {
    const seconds = Number(raw.split(':')[1] || 0);
    return {
      status: 429,
      message: 'Бонус ещё недоступен',
      seconds_until_available: seconds,
    };
  }
  if (raw.startsWith('SHOP_ITEM_NOT_FOUND:')) {
    return { status: 500, message: 'Предмет бонуса не настроен на сервере. Обратитесь к администратору' };
  }

  return { status: 500, message: 'Внутренняя ошибка сервера' };
}
