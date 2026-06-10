import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { RowDataPacket } from 'mysql2';

const STEAMID64_REGEX = /^\d{17}$/;

export interface EnsureWebUserInput {
  steamid: string;
  username: string;
}

export interface EnsureWebUserResult {
  created: boolean;
}

function normalizeUsername(raw: string): string {
  const name = String(raw || '').trim();
  return name.slice(0, 255) || 'Игрок';
}

/**
 * Создаёт запись users по steamid, если игрок ещё не входил на сайт.
 * Не перезаписывает существующий профиль.
 */
export async function ensureWebUser(
  connection: PoolConnection,
  input: EnsureWebUserInput
): Promise<EnsureWebUserResult> {
  const steamid = String(input.steamid || '').trim();
  if (!STEAMID64_REGEX.test(steamid)) {
    throw new Error(`Некорректный Steam ID: ${steamid}`);
  }

  const username = normalizeUsername(input.username);

  const [existing] = await connection.query<RowDataPacket[]>(
    'SELECT steamid FROM users WHERE steamid = ? LIMIT 1',
    [steamid]
  );
  if (existing.length > 0) {
    return { created: false };
  }

  await connection.query<ResultSetHeader>(
    `INSERT INTO users (steamid, username, avatar, role, last_login)
     VALUES (?, ?, '', 'user', NULL)`,
    [steamid, username]
  );

  return { created: true };
}
