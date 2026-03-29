import { randomUUID } from 'crypto';
import { Router } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { webPool } from '../config/database';
import { isAuthenticated } from '../middleware/auth';
import { paymentRateLimiter, sensitiveRateLimiter } from '../middleware/rateLimiter';
import { createPayment } from '../services/yookassa';
import { redeemVoucherInTransaction } from '../services/voucherRedeem';

const router = Router();
const MIN_DEPOSIT = 10;
const MAX_DEPOSIT = 50000;
const MAX_PURCHASE_QUANTITY = 100;

interface ShopItemRow extends RowDataPacket {
  id: number;
  name: string;
  description: string | null;
  category: string;
  price: number;
  rust_item_code: string;
  quantity: number;
  image_url: string | null;
  is_available: number;
  sort_order?: number | null;
}

interface BalanceRow extends RowDataPacket {
  balance: number;
  total_earned?: number;
  total_spent?: number;
}

router.get('/items', async (_req, res) => {
  try {
    const [rows] = await webPool.query<ShopItemRow[]>('SELECT * FROM shop_items');

    const items = [...rows].sort((a, b) => {
      const aOrder = Number(a.sort_order ?? Number.MAX_SAFE_INTEGER);
      const bOrder = Number(b.sort_order ?? Number.MAX_SAFE_INTEGER);
      if (aOrder !== bOrder) return aOrder - bOrder;

      const aId = Number(a.id ?? Number.MAX_SAFE_INTEGER);
      const bId = Number(b.id ?? Number.MAX_SAFE_INTEGER);
      return aId - bId;
    });

    return res.json({ items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching shop items:', message);
    return res.status(500).json({ error: 'Не удалось загрузить предметы' });
  }
});

router.get('/balance', isAuthenticated, async (req, res) => {
  try {
    const steamid = req.user!.steamid;
    const [rows] = await webPool.query<BalanceRow[]>(
      'SELECT balance, total_earned, total_spent FROM player_balance WHERE steamid = ?',
      [steamid]
    );

    if (rows.length === 0) {
      await webPool.query(
        'INSERT INTO player_balance (steamid, balance, total_earned, total_spent) VALUES (?, 0, 0, 0)',
        [steamid]
      );
      return res.json({ balance: 0, total_earned: 0, total_spent: 0 });
    }

    const balance = rows[0];
    return res.json({
      balance: Number(balance.balance) || 0,
      total_earned: Number(balance.total_earned) || 0,
      total_spent: Number(balance.total_spent) || 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching balance:', message);
    return res.status(500).json({ error: 'Не удалось загрузить баланс' });
  }
});

router.post('/deposit/create', paymentRateLimiter, isAuthenticated, async (req, res) => {
  try {
    const steamid = req.user!.steamid;
    const amount = Number.parseFloat(req.body.amount);

    if (Number.isNaN(amount) || amount < MIN_DEPOSIT || amount > MAX_DEPOSIT) {
      return res.status(400).json({ error: `Сумма должна быть от ${MIN_DEPOSIT} до ${MAX_DEPOSIT}` });
    }

    const baseUrl = (process.env.BASE_URL || process.env.CORS_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
    const returnUrl = `${baseUrl}/shop?payment=success`;

    const connection = await webPool.getConnection();
    try {
      const [insertResult] = await connection.query<ResultSetHeader>(
        `INSERT INTO payment_orders (steamid, amount, currency, status) VALUES (?, ?, 'RUB', 'pending')`,
        [steamid, amount]
      );
      const orderId = insertResult.insertId;

      const payment = await createPayment({
        amount,
        returnUrl,
        description: `Пополнение баланса DragonLost #${orderId}`,
        idempotenceKey: randomUUID(),
        metadata: { order_id: String(orderId) },
      });

      const safePayload = {
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
      };

      await connection.query('UPDATE payment_orders SET external_id = ?, payload = ? WHERE id = ?', [
        payment.id,
        JSON.stringify(safePayload),
        orderId,
      ]);

      const redirectUrl = payment.confirmation?.confirmation_url || null;
      if (!redirectUrl) {
        return res.status(500).json({ error: 'Платёжная система не вернула ссылку на оплату' });
      }

      return res.json({ redirect_url: redirectUrl, order_id: orderId });
    } finally {
      connection.release();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating deposit:', message);
    return res.status(500).json({ error: 'Ошибка при создании платежа. Попробуйте позже.' });
  }
});

router.post('/deposit/redeem', sensitiveRateLimiter, isAuthenticated, async (req, res) => {
  const connection = await webPool.getConnection();
  try {
    const steamid = req.user!.steamid;
    const code = String(req.body.code || '').trim();

    await connection.beginTransaction();

    const result = await redeemVoucherInTransaction(connection, {
      userId: req.user!.id,
      steamid,
      code,
    });

    if (!result.ok) {
      await connection.rollback();
      return res.status(result.status).json({ error: result.error });
    }

    await connection.commit();

    const amount = result.amount;
    const [balanceRows] = await connection.query<BalanceRow[]>('SELECT balance FROM player_balance WHERE steamid = ?', [steamid]);
    const newBalance = balanceRows.length > 0 ? Number(balanceRows[0].balance) : amount;

    return res.json({ success: true, amount, new_balance: newBalance });
  } catch (error: unknown) {
    await connection.rollback();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error redeeming voucher:', message);
    return res.status(500).json({ error: 'Ошибка при активации промокода' });
  } finally {
    connection.release();
  }
});

router.post('/purchase', sensitiveRateLimiter, isAuthenticated, async (req, res) => {
  const connection = await webPool.getConnection();
  try {
    const steamid = req.user!.steamid;
    const itemId = Number.parseInt(String(req.body.item_id), 10);
    const quantity = Number.parseInt(String(req.body.quantity), 10) || 1;

    if (!Number.isFinite(itemId) || itemId < 1) {
      return res.status(400).json({ error: 'Invalid item_id' });
    }
    if (quantity < 1 || quantity > MAX_PURCHASE_QUANTITY) {
      return res.status(400).json({ error: `Quantity must be between 1 and ${MAX_PURCHASE_QUANTITY}` });
    }

    await connection.beginTransaction();

    const [items] = await connection.query<ShopItemRow[]>(
      'SELECT * FROM shop_items WHERE id = ? AND is_available = TRUE',
      [itemId]
    );
    if (items.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Item not found or unavailable' });
    }

    const item = items[0];
    const totalPrice = Number(item.price) * quantity;

    let [balanceRows] = await connection.query<BalanceRow[]>(
      'SELECT balance FROM player_balance WHERE steamid = ? FOR UPDATE',
      [steamid]
    );
    if (balanceRows.length === 0) {
      await connection.query(
        'INSERT INTO player_balance (steamid, balance, total_earned, total_spent) VALUES (?, 0, 0, 0)',
        [steamid]
      );
      balanceRows = [{ balance: 0 } as BalanceRow];
    }

    const currentBalance = Number(balanceRows[0].balance);
    if (currentBalance < totalPrice) {
      await connection.rollback();
      return res.status(400).json({
        error: 'Insufficient balance',
        required: totalPrice,
        current: currentBalance,
      });
    }

    await connection.query(
      'UPDATE player_balance SET balance = balance - ?, total_spent = total_spent + ? WHERE steamid = ?',
      [totalPrice, totalPrice, steamid]
    );

    const [inventoryResult] = await connection.query<ResultSetHeader>(
      'INSERT INTO player_inventory (steamid, shop_item_id, quantity, status) VALUES (?, ?, ?, ?)',
      [steamid, itemId, quantity * Number(item.quantity), 'pending']
    );

    await connection.query(
      'INSERT INTO transactions (steamid, type, amount, description, reference_id) VALUES (?, ?, ?, ?, ?)',
      [steamid, 'purchase', -totalPrice, `Purchased ${item.name} x${quantity}`, inventoryResult.insertId]
    );

    await connection.commit();
    return res.json({
      success: true,
      message: 'Purchase successful',
      new_balance: currentBalance - totalPrice,
      inventory_id: inventoryResult.insertId,
    });
  } catch (error: unknown) {
    await connection.rollback();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error purchasing item:', message);
    return res.status(500).json({ error: 'Failed to purchase item' });
  } finally {
    connection.release();
  }
});

router.get('/categories', async (_req, res) => {
  try {
    const [rows] = await webPool.query<RowDataPacket[]>(
      'SELECT DISTINCT category FROM shop_items WHERE is_available = TRUE ORDER BY category'
    );
    return res.json({ categories: rows.map((row) => String(row.category)) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching categories:', message);
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

export default router;
