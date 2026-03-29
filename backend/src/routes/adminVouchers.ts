import { Router } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { webPool } from '../config/database';
import { isAdmin } from '../middleware/auth';
import { sensitiveRateLimiter } from '../middleware/rateLimiter';

const router = Router();
const CODE_MAX_LEN = 64;

interface VoucherAdminRow extends RowDataPacket {
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
  created_at: Date;
  updated_at: Date;
  redemption_count: number;
}

function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t || t.length > CODE_MAX_LEN) return null;
  return t;
}

router.get('/', isAdmin, async (_req, res) => {
  try {
    const [rows] = await webPool.query<VoucherAdminRow[]>(
      `SELECT v.*,
        (SELECT COUNT(*) FROM voucher_redemptions r WHERE r.voucher_id = v.id) AS redemption_count
       FROM voucher_codes v
       ORDER BY v.id DESC`
    );
    return res.json({ vouchers: rows });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('adminVouchers list:', msg);
    return res.status(500).json({ error: 'Не удалось загрузить промокоды' });
  }
});

router.post('/', sensitiveRateLimiter, isAdmin, async (req, res) => {
  const code = normalizeCode(req.body.code);
  if (!code) {
    return res.status(400).json({ error: 'Укажите код промокода (до 64 символов)' });
  }
  const amount = Number.parseFloat(String(req.body.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Сумма должна быть положительным числом' });
  }

  const validFrom = parseOptionalDate(req.body.valid_from);
  const validUntil = parseOptionalDate(req.body.valid_until);
  if (validFrom === undefined || validUntil === undefined) {
    return res.status(400).json({ error: 'Некорректный формат даты (valid_from / valid_until)' });
  }
  if (validFrom && validUntil && validFrom >= validUntil) {
    return res.status(400).json({ error: 'Дата начала должна быть раньше даты окончания' });
  }

  let maxTotal: number | null = null;
  if (req.body.max_activations_total !== undefined && req.body.max_activations_total !== null && req.body.max_activations_total !== '') {
    const n = Number.parseInt(String(req.body.max_activations_total), 10);
    if (!Number.isFinite(n) || n < 1) {
      return res.status(400).json({ error: 'max_activations_total должен быть целым числом ≥ 1 или пусто (без лимита)' });
    }
    maxTotal = n;
  }

  const perUser = Number.parseInt(String(req.body.max_activations_per_user ?? 1), 10);
  if (!Number.isFinite(perUser) || perUser < 1) {
    return res.status(400).json({ error: 'max_activations_per_user должен быть ≥ 1' });
  }

  const weeklyRepeat = Boolean(req.body.weekly_repeat);

  try {
    const [result] = await webPool.query<ResultSetHeader>(
      `INSERT INTO voucher_codes (
        code, amount, valid_from, valid_until, max_activations_total,
        activations_count, max_activations_per_user, weekly_repeat, is_active
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, 1)`,
      [code, amount, validFrom, validUntil, maxTotal, perUser, weeklyRepeat ? 1 : 0]
    );
    return res.status(201).json({ id: result.insertId, success: true });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Промокод с таким кодом уже существует' });
    }
    console.error('adminVouchers create:', e);
    return res.status(500).json({ error: 'Не удалось создать промокод' });
  }
});

router.patch('/:id', sensitiveRateLimiter, isAdmin, async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'Некорректный id' });
  }

  const updates: string[] = [];
  const vals: unknown[] = [];

  if (req.body.code !== undefined) {
    const c = normalizeCode(req.body.code);
    if (!c) {
      return res.status(400).json({ error: 'Некорректный код' });
    }
    updates.push('code = ?');
    vals.push(c);
  }
  if (req.body.amount !== undefined) {
    const amount = Number.parseFloat(String(req.body.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Некорректная сумма' });
    }
    updates.push('amount = ?');
    vals.push(amount);
  }
  if (req.body.valid_from !== undefined) {
    const d = parseOptionalDate(req.body.valid_from);
    if (d === undefined) {
      return res.status(400).json({ error: 'Некорректная valid_from' });
    }
    updates.push('valid_from = ?');
    vals.push(d);
  }
  if (req.body.valid_until !== undefined) {
    const d = parseOptionalDate(req.body.valid_until);
    if (d === undefined) {
      return res.status(400).json({ error: 'Некорректная valid_until' });
    }
    updates.push('valid_until = ?');
    vals.push(d);
  }
  if (req.body.max_activations_total !== undefined) {
    if (req.body.max_activations_total === null || req.body.max_activations_total === '') {
      updates.push('max_activations_total = NULL');
    } else {
      const n = Number.parseInt(String(req.body.max_activations_total), 10);
      if (!Number.isFinite(n) || n < 1) {
        return res.status(400).json({ error: 'Некорректный max_activations_total' });
      }
      updates.push('max_activations_total = ?');
      vals.push(n);
    }
  }
  if (req.body.max_activations_per_user !== undefined) {
    const n = Number.parseInt(String(req.body.max_activations_per_user), 10);
    if (!Number.isFinite(n) || n < 1) {
      return res.status(400).json({ error: 'Некорректный max_activations_per_user' });
    }
    updates.push('max_activations_per_user = ?');
    vals.push(n);
  }
  if (req.body.weekly_repeat !== undefined) {
    updates.push('weekly_repeat = ?');
    vals.push(Boolean(req.body.weekly_repeat) ? 1 : 0);
  }
  if (req.body.is_active !== undefined) {
    updates.push('is_active = ?');
    vals.push(Boolean(req.body.is_active) ? 1 : 0);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Нет полей для обновления' });
  }

  vals.push(id);
  try {
    const [result] = await webPool.query<ResultSetHeader>(
      `UPDATE voucher_codes SET ${updates.join(', ')} WHERE id = ?`,
      vals
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Промокод не найден' });
    }
    return res.json({ success: true });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Промокод с таким кодом уже существует' });
    }
    console.error('adminVouchers patch:', e);
    return res.status(500).json({ error: 'Не удалось обновить промокод' });
  }
});

router.delete('/:id', sensitiveRateLimiter, isAdmin, async (req, res) => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'Некорректный id' });
  }
  try {
    const [result] = await webPool.query<ResultSetHeader>('UPDATE voucher_codes SET is_active = 0 WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Промокод не найден' });
    }
    return res.json({ success: true });
  } catch (e: unknown) {
    console.error('adminVouchers delete:', e);
    return res.status(500).json({ error: 'Не удалось отключить промокод' });
  }
});

export default router;
