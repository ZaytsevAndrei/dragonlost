import { Router } from 'express';
import { webPool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { isAuthenticated } from '../middleware/auth';
import { createPayment } from '../services/yookassa';
import { randomUUID } from 'crypto';

const router = Router();

const MIN_DEPOSIT = 10;
const MAX_DEPOSIT = 50000;

interface ShopItem {
  id: number;
  name: string;
  description: string;
  category: string;
  price: number;
  rust_item_code: string;
  quantity: number;
  image_url: string;
  is_available: boolean;
}

interface PlayerBalance {
  balance: number;
  total_earned: number;
  total_spent: number;
}

interface BalanceRow extends RowDataPacket {
  balance: number;
}

// Получить все доступные предметы магазина
router.get('/items', async (req, res) => {
  try {
    const { category } = req.query;
    
    let query = 'SELECT * FROM shop_items WHERE is_available = TRUE';
    const params: string[] = [];
    
    if (category) {
      query += ' AND category = ?';
      params.push(category as string);
    }
    
    query += ' ORDER BY category, price';
    
    const [rows] = await webPool.query<RowDataPacket[]>(query, params);
    res.json({ items: rows });
  } catch (error) {
    console.error('Error fetching shop items:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch shop items' });
  }
});

// Получить баланс игрока
router.get('/balance', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const [rows] = await webPool.query<RowDataPacket[]>(
      'SELECT balance, total_earned, total_spent FROM player_balance WHERE user_id = ?',
      [userId]
    );
    
    if (rows.length === 0) {
      // Создаем запись баланса, если её нет
      await webPool.query(
        'INSERT INTO player_balance (user_id, balance, total_earned, total_spent) VALUES (?, 0, 0, 0)',
        [userId]
      );
      res.json({ balance: 0, total_earned: 0, total_spent: 0 });
    } else {
      const balance = rows[0];
      res.json({
        balance: Number(balance.balance) || 0,
        total_earned: Number(balance.total_earned) || 0,
        total_spent: Number(balance.total_spent) || 0,
      });
    }
  } catch (error) {
    console.error('Error fetching balance:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// Создать заказ пополнения (редирект в платёжную систему)
router.post('/deposit/create', isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const amount = parseFloat(req.body.amount);
    if (Number.isNaN(amount) || amount < MIN_DEPOSIT || amount > MAX_DEPOSIT) {
      return res.status(400).json({
        error: `Сумма должна быть от ${MIN_DEPOSIT} до ${MAX_DEPOSIT}`,
      });
    }

    const baseUrl = (process.env.BASE_URL || process.env.CORS_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
    const returnUrl = `${baseUrl}/shop?payment=success`;

    const connection = await webPool.getConnection();
    try {
      const [insertResult] = await connection.query<ResultSetHeader>(
        `INSERT INTO payment_orders (user_id, amount, currency, status) VALUES (?, ?, 'RUB', 'pending')`,
        [userId, amount]
      );
      const orderId = insertResult.insertId;

      const idempotenceKey = randomUUID();
      const payment = await createPayment({
        amount,
        returnUrl,
        description: `Пополнение баланса DragonLost #${orderId}`,
        idempotenceKey,
        metadata: { order_id: String(orderId) },
      });

      // Сохраняем только необходимые поля из ответа YooKassa
      const safePayload = {
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
      };
      await connection.query(
        'UPDATE payment_orders SET external_id = ?, payload = ? WHERE id = ?',
        [payment.id, JSON.stringify(safePayload), orderId]
      );
      connection.release();

      const redirectUrl = payment.confirmation?.confirmation_url || null;
      if (!redirectUrl) {
        return res.status(500).json({ error: 'Платёжная система не вернула ссылку на оплату' });
      }
      res.json({ redirect_url: redirectUrl, order_id: orderId });
    } catch (err) {
      connection.release();
      throw err;
    }
  } catch (error: unknown) {
    console.error('Error creating deposit:', error instanceof Error ? error.message : 'Unknown error');
    const message = error instanceof Error ? error.message : 'Failed to create deposit';
    res.status(500).json({ error: message });
  }
});

// Активировать промокод
router.post('/deposit/redeem', isAuthenticated, async (req, res) => {
  const connection = await webPool.getConnection();
  try {
    const userId = req.user!.id;
    const code = (req.body.code || '').toString().trim();
    if (!code) {
      return res.status(400).json({ error: 'Укажите код промокода' });
    }

    await connection.beginTransaction();

    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT id, amount FROM voucher_codes WHERE code = ? AND used_by IS NULL FOR UPDATE',
      [code]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Промокод не найден или уже использован' });
    }
    const voucher = rows[0];
    const amount = Number(voucher.amount);

    await connection.query(
      'UPDATE voucher_codes SET used_by = ?, used_at = NOW() WHERE id = ?',
      [userId, voucher.id]
    );

    await connection.query(
      `INSERT INTO player_balance (user_id, balance, total_earned, total_spent) VALUES (?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE balance = balance + ?, total_earned = total_earned + ?`,
      [userId, amount, amount, amount, amount]
    );
    await connection.query(
      'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
      [userId, 'earn', amount, 'Активация промокода']
    );
    await connection.commit();

    const [balanceRows] = await connection.query<BalanceRow[]>(
      'SELECT balance FROM player_balance WHERE user_id = ?',
      [userId]
    );
    const newBalance = balanceRows.length > 0 ? Number(balanceRows[0].balance) : amount;

    res.json({ success: true, amount, new_balance: newBalance });
  } catch (error) {
    await connection.rollback();
    console.error('Error redeeming voucher:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Ошибка при активации промокода' });
  } finally {
    connection.release();
  }
});

// Купить предмет
router.post('/purchase', isAuthenticated, async (req, res) => {
  const connection = await webPool.getConnection();
  
  try {
    const userId = req.user!.id;
    const { item_id, quantity = 1 } = req.body;
    
    if (!item_id || quantity < 1) {
      return res.status(400).json({ error: 'Invalid item_id or quantity' });
    }
    
    await connection.beginTransaction();
    
    // Получаем информацию о предмете
    const [items] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM shop_items WHERE id = ? AND is_available = TRUE',
      [item_id]
    );
    
    if (items.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Item not found or unavailable' });
    }
    
    const item = items[0] as ShopItem;
    const totalPrice = item.price * quantity;
    
    // Получаем баланс игрока
    let [balanceRows] = await connection.query<BalanceRow[]>(
      'SELECT balance FROM player_balance WHERE user_id = ?',
      [userId]
    );
    
    if (balanceRows.length === 0) {
      // Создаем запись баланса
      await connection.query(
        'INSERT INTO player_balance (user_id, balance, total_earned, total_spent) VALUES (?, 0, 0, 0)',
        [userId]
      );
      balanceRows = [{ balance: 0 } as BalanceRow];
    }
    
    const currentBalance = balanceRows[0].balance;
    
    if (currentBalance < totalPrice) {
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Insufficient balance',
        required: totalPrice,
        current: currentBalance
      });
    }
    
    // Вычитаем стоимость из баланса
    await connection.query(
      'UPDATE player_balance SET balance = balance - ?, total_spent = total_spent + ? WHERE user_id = ?',
      [totalPrice, totalPrice, userId]
    );
    
    // Добавляем предмет в инвентарь
    const [result] = await connection.query<ResultSetHeader>(
      'INSERT INTO player_inventory (user_id, shop_item_id, quantity, status) VALUES (?, ?, ?, ?)',
      [userId, item_id, quantity * item.quantity, 'pending']
    );
    
    // Записываем транзакцию
    await connection.query(
      'INSERT INTO transactions (user_id, type, amount, description, reference_id) VALUES (?, ?, ?, ?, ?)',
      [userId, 'purchase', -totalPrice, `Purchased ${item.name} x${quantity}`, result.insertId]
    );
    
    await connection.commit();
    
    res.json({ 
      success: true, 
      message: 'Purchase successful',
      new_balance: currentBalance - totalPrice,
      inventory_id: result.insertId
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error purchasing item:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to purchase item' });
  } finally {
    connection.release();
  }
});

// Получить категории предметов
router.get('/categories', async (req, res) => {
  try {
    const [rows] = await webPool.query<RowDataPacket[]>(
      'SELECT DISTINCT category FROM shop_items WHERE is_available = TRUE ORDER BY category'
    );
    res.json({ categories: rows.map(r => r.category) });
  } catch (error) {
    console.error('Error fetching categories:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

export default router;
