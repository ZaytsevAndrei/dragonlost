import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

export interface VoucherRow extends RowDataPacket {
  id: number;
  code: string;
  amount: number;
  used_by: number | null;
  used_at: Date | null;
  valid_from: Date | null;
  valid_until: Date | null;
  max_activations_total: number | null;
  activations_count: number;
  max_activations_per_user: number;
  weekly_repeat: number;
  is_active: number;
}

export type RedeemVoucherResult =
  | { ok: true; amount: number }
  | { ok: false; status: number; error: string };

function normalizeCode(raw: string): string {
  return raw.trim();
}

/**
 * Активация промокода внутри уже открытой транзакции (строка voucher заблокирована FOR UPDATE).
 */
export async function redeemVoucherInTransaction(
  connection: PoolConnection,
  params: { userId: number; steamid: string; code: string }
): Promise<RedeemVoucherResult> {
  const code = normalizeCode(params.code);
  if (!code) {
    return { ok: false, status: 400, error: 'Укажите код промокода' };
  }

  const [rows] = await connection.query<VoucherRow[]>(
    `SELECT id, code, amount, used_by, used_at, valid_from, valid_until,
            max_activations_total, activations_count, max_activations_per_user,
            weekly_repeat, is_active
     FROM voucher_codes
     WHERE LOWER(code) = LOWER(?) AND is_active = 1
     FOR UPDATE`,
    [code]
  );

  if (rows.length === 0) {
    return { ok: false, status: 404, error: 'Промокод не найден или отключён' };
  }

  const v = rows[0];
  const now = new Date();

  if (v.valid_from) {
    const from = new Date(v.valid_from);
    if (now < from) {
      return { ok: false, status: 400, error: 'Промокод ещё не действует' };
    }
  }
  if (v.valid_until) {
    const until = new Date(v.valid_until);
    if (now > until) {
      return { ok: false, status: 400, error: 'Срок действия промокода истёк' };
    }
  }

  const maxTotal = v.max_activations_total != null ? Number(v.max_activations_total) : null;
  const actCount = Number(v.activations_count) || 0;
  if (maxTotal !== null && actCount >= maxTotal) {
    return { ok: false, status: 400, error: 'Лимит активаций промокода исчерпан' };
  }

  const [totR] = await connection.query<RowDataPacket[]>(
    'SELECT COUNT(*) AS c FROM voucher_redemptions WHERE voucher_id = ?',
    [v.id]
  );
  const totalRedemptions = Number((totR[0] as { c: number }).c) || 0;
  if (totalRedemptions === 0 && v.used_by != null) {
    return { ok: false, status: 400, error: 'Промокод уже использован' };
  }

  const perUser = Math.max(1, Number(v.max_activations_per_user) || 1);
  const weekly = Number(v.weekly_repeat) === 1;

  if (weekly) {
    const [wrows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM voucher_redemptions
       WHERE voucher_id = ? AND user_id = ?
         AND YEARWEEK(created_at, 3) = YEARWEEK(NOW(), 3)`,
      [v.id, params.userId]
    );
    const wcount = Number((wrows[0] as { c: number }).c) || 0;
    if (wcount >= perUser) {
      return {
        ok: false,
        status: 400,
        error: 'Вы уже использовали этот промокод максимальное число раз на этой неделе',
      };
    }
  } else {
    const [urows] = await connection.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS c FROM voucher_redemptions WHERE voucher_id = ? AND user_id = ?',
      [v.id, params.userId]
    );
    const ucount = Number((urows[0] as { c: number }).c) || 0;
    if (ucount >= perUser) {
      return { ok: false, status: 400, error: 'Вы уже активировали этот промокод' };
    }
  }

  const amount = Number(v.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, status: 500, error: 'Некорректная сумма промокода' };
  }

  await connection.query(
    'INSERT INTO voucher_redemptions (voucher_id, user_id, steamid, amount) VALUES (?, ?, ?, ?)',
    [v.id, params.userId, params.steamid, amount]
  );
  await connection.query('UPDATE voucher_codes SET activations_count = activations_count + 1 WHERE id = ?', [v.id]);

  await connection.query(
    `INSERT INTO player_balance (steamid, balance, total_earned, total_spent) VALUES (?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE balance = balance + ?, total_earned = total_earned + ?`,
    [params.steamid, amount, amount, amount, amount]
  );
  await connection.query('INSERT INTO transactions (steamid, type, amount, description) VALUES (?, ?, ?, ?)', [
    params.steamid,
    'earn',
    amount,
    'Активация промокода',
  ]);

  return { ok: true, amount };
}
