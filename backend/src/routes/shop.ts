import { Router } from 'express';
import { webPool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { isAuthenticated } from '../middleware/auth';

const router = Router();

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
    console.error('Error fetching shop items:', error);
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
        'INSERT INTO player_balance (user_id, balance) VALUES (?, 0)',
        [userId]
      );
      res.json({ balance: 0, total_earned: 0, total_spent: 0 });
    } else {
      res.json(rows[0]);
    }
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({ error: 'Failed to fetch balance' });
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
    let [balanceRows] = await connection.query<RowDataPacket[]>(
      'SELECT balance FROM player_balance WHERE user_id = ?',
      [userId]
    );
    
    if (balanceRows.length === 0) {
      // Создаем запись баланса
      await connection.query(
        'INSERT INTO player_balance (user_id, balance) VALUES (?, 0)',
        [userId]
      );
      balanceRows = [{ balance: 0 }];
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
    console.error('Error purchasing item:', error);
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
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

export default router;
