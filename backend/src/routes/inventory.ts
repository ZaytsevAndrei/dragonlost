import { Router } from 'express';
import { webPool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { isAuthenticated } from '../middleware/auth';
import { rconService } from '../services/rconService';

const router = Router();

interface InventoryItem {
  id: number;
  shop_item_id: number;
  quantity: number;
  status: string;
  purchased_at: string;
  delivered_at: string | null;
  item_name: string;
  item_description: string;
  item_category: string;
  rust_item_code: string;
  image_url: string;
}

// Получить инвентарь игрока
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const steamid = req.user!.steamid;
    
    const [rows] = await webPool.query<RowDataPacket[]>(
      `SELECT 
        pi.id,
        pi.shop_item_id,
        pi.quantity,
        pi.status,
        pi.purchased_at,
        pi.delivered_at,
        si.name as item_name,
        si.description as item_description,
        si.category as item_category,
        si.rust_item_code,
        si.image_url
      FROM player_inventory pi
      JOIN shop_items si ON pi.shop_item_id = si.id
      WHERE pi.steamid = ?
      ORDER BY pi.purchased_at DESC`,
      [steamid]
    );
    
    res.json({ inventory: rows });
  } catch (error) {
    console.error('Error fetching inventory:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// Проверить, находится ли игрок на сервере (через RCON playerlist)
router.get('/check-online', isAuthenticated, async (req, res) => {
  try {
    const steamid = req.user!.steamid;

    // Если RCON не настроен — сообщаем об этом
    if (!rconService.isConfigured()) {
      return res.json({
        online: false,
        message: 'RCON не настроен, невозможно проверить статус',
      });
    }

    try {
      const isOnline = await rconService.isPlayerOnline(steamid);
      res.json({
        online: isOnline,
        message: isOnline ? 'Вы онлайн на сервере' : 'Вы оффлайн',
      });
    } catch (rconError) {
      console.error('RCON online check failed:', rconError instanceof Error ? rconError.message : rconError);
      res.json({
        online: false,
        message: 'Не удалось связаться с игровым сервером',
      });
    }
  } catch (error) {
    console.error('Error checking online status:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Не удалось проверить статус' });
  }
});

// Выдать предмет игроку через RCON и пометить как доставленный
router.post('/use/:id', isAuthenticated, async (req, res) => {
  const connection = await webPool.getConnection();
  
  try {
    const steamid = req.user!.steamid;
    const inventoryId = parseInt(req.params.id);

    if (!Number.isFinite(inventoryId) || inventoryId < 1) {
      return res.status(400).json({ error: 'Invalid inventory item ID' });
    }
    
    await connection.beginTransaction();
    
    // Получаем предмет из инвентаря (FOR UPDATE блокирует строку,
    // предотвращая двойную выдачу при параллельных запросах)
    const [items] = await connection.query<RowDataPacket[]>(
      `SELECT pi.*, si.name, si.rust_item_code, si.quantity as item_quantity
       FROM player_inventory pi
       JOIN shop_items si ON pi.shop_item_id = si.id
       WHERE pi.id = ? AND pi.steamid = ? AND pi.status = 'pending'
       FOR UPDATE`,
      [inventoryId, steamid]
    );
    
    if (items.length === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        error: 'Item not found or already used' 
      });
    }
    
    const item = items[0];

    // Проверяем, настроен ли RCON
    if (!rconService.isConfigured()) {
      await connection.rollback();
      return res.status(503).json({
        error: 'Выдача предметов временно недоступна (RCON не настроен)',
      });
    }

    // Проверяем, онлайн ли игрок (через RCON playerlist — в реальном времени)
    try {
      const isOnline = await rconService.isPlayerOnline(steamid);
      if (!isOnline) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Вы должны быть онлайн на сервере, чтобы получить предмет',
        });
      }
    } catch (onlineCheckError) {
      await connection.rollback();
      console.error('RCON online check failed:', onlineCheckError instanceof Error ? onlineCheckError.message : onlineCheckError);
      return res.status(502).json({
        error: 'Не удалось проверить онлайн-статус. Попробуйте позже.',
      });
    }

    // Выдаём предмет через RCON (inventory.giveto <steamid> <shortname> <amount>)
    try {
      await rconService.giveItem(steamid, item.rust_item_code, item.quantity);
    } catch (rconError) {
      await connection.rollback();
      console.error('RCON delivery failed:', rconError instanceof Error ? rconError.message : rconError);
      return res.status(502).json({
        error: 'Не удалось выдать предмет на сервере. Попробуйте позже.',
      });
    }

    // Помечаем предмет как доставленный (проверяем status = 'pending' повторно
    // для защиты от race condition)
    const [updateResult] = await connection.query<ResultSetHeader>(
      "UPDATE player_inventory SET status = 'delivered', delivered_at = NOW() WHERE id = ? AND status = 'pending'",
      [inventoryId]
    );

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Предмет уже был получен' });
    }

    await connection.commit();

    res.json({
      success: true,
      message: `${item.name} выдан вашему персонажу в игре`,
      item: {
        name: item.name,
        quantity: item.quantity,
        rust_code: item.rust_item_code,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error using item:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to use item' });
  } finally {
    connection.release();
  }
});

// Получить историю транзакций
router.get('/transactions', isAuthenticated, async (req, res) => {
  try {
    const steamid = req.user!.steamid;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    
    const [rows] = await webPool.query<RowDataPacket[]>(
      'SELECT id, type, amount, description, created_at FROM transactions WHERE steamid = ? ORDER BY created_at DESC LIMIT ?',
      [steamid, limit]
    );
    
    res.json({ transactions: rows });
  } catch (error) {
    console.error('Error fetching transactions:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

export default router;
