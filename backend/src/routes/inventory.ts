import { Router } from 'express';
import { webPool, rustPool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { isAuthenticated } from '../middleware/auth';

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
    const userId = req.user!.id;
    
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
      WHERE pi.user_id = ?
      ORDER BY pi.purchased_at DESC`,
      [userId]
    );
    
    res.json({ inventory: rows });
  } catch (error) {
    console.error('Error fetching inventory:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// Проверить, находится ли игрок на сервере
router.get('/check-online', isAuthenticated, async (req, res) => {
  try {
    const steamid = req.user!.steamid;
    
    // Проверяем последнюю активность в базе Rust
    const [rows] = await rustPool.query<RowDataPacket[]>(
      'SELECT `Last Seen`, `Time Played` FROM PlayerDatabase WHERE steamid = ?',
      [steamid]
    );
    
    if (rows.length === 0) {
      return res.json({ 
        online: false, 
        message: 'Player not found in database' 
      });
    }
    
    const lastSeen = parseFloat(rows[0]['Last Seen']);
    const currentTime = Date.now() / 1000;
    const timeDiff = currentTime - lastSeen;
    
    // Считаем игрока онлайн, если он был активен менее 5 минут назад
    const isOnline = timeDiff < 300;
    
    res.json({ 
      online: isOnline,
      last_seen: lastSeen,
      time_diff: timeDiff,
      message: isOnline ? 'Player is online' : 'Player is offline'
    });
  } catch (error) {
    console.error('Error checking online status:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to check online status' });
  }
});

// Использовать предмет (пометить как доставленный)
// В реальной реализации здесь должна быть интеграция с RCON для выдачи предмета в игре
router.post('/use/:id', isAuthenticated, async (req, res) => {
  const connection = await webPool.getConnection();
  
  try {
    const userId = req.user!.id;
    const inventoryId = req.params.id;
    const steamid = req.user!.steamid;
    
    await connection.beginTransaction();
    
    // Получаем предмет из инвентаря
    const [items] = await connection.query<RowDataPacket[]>(
      `SELECT pi.*, si.name, si.rust_item_code, si.quantity as item_quantity
       FROM player_inventory pi
       JOIN shop_items si ON pi.shop_item_id = si.id
       WHERE pi.id = ? AND pi.user_id = ? AND pi.status = 'pending'`,
      [inventoryId, userId]
    );
    
    if (items.length === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        error: 'Item not found or already used' 
      });
    }
    
    const item = items[0];
    
    // Проверяем, онлайн ли игрок
    const [playerStatus] = await rustPool.query<RowDataPacket[]>(
      'SELECT `Last Seen` FROM PlayerDatabase WHERE steamid = ?',
      [steamid]
    );
    
    if (playerStatus.length === 0) {
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Player not found in game database' 
      });
    }
    
    const lastSeen = parseFloat(playerStatus[0]['Last Seen']);
    const currentTime = Date.now() / 1000;
    const timeDiff = currentTime - lastSeen;
    
    if (timeDiff >= 300) {
      await connection.rollback();
      return res.status(400).json({ 
        error: 'You must be online on the server to receive items',
        last_seen: lastSeen,
        time_diff: timeDiff
      });
    }
    
    // TODO: Здесь должна быть интеграция с RCON для выдачи предмета в игре
    // Пример: await executeRCONCommand(`inventory.giveto ${steamid} ${item.rust_item_code} ${item.quantity}`);
    
    // Помечаем предмет как доставленный
    await connection.query(
      'UPDATE player_inventory SET status = ?, delivered_at = NOW() WHERE id = ?',
      ['delivered', inventoryId]
    );
    
    await connection.commit();
    
    res.json({ 
      success: true,
      message: `${item.name} has been delivered to your in-game character`,
      item: {
        name: item.name,
        quantity: item.quantity,
        rust_code: item.rust_item_code
      }
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
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const [rows] = await webPool.query<RowDataPacket[]>(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [userId, limit]
    );
    
    res.json({ transactions: rows });
  } catch (error) {
    console.error('Error fetching transactions:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

export default router;
