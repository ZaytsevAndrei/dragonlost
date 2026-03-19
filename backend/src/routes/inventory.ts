import { Router } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { webPool } from '../config/database';
import { isAuthenticated } from '../middleware/auth';
import { rconService } from '../services/rconService';

const router = Router();

interface InventoryItemRow extends RowDataPacket {
  id: number;
  shop_item_id: number;
  quantity: number;
  status: string;
  purchased_at: string;
  delivered_at: string | null;
  name: string;
  rust_item_code: string;
}

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

    return res.json({ inventory: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching inventory:', message);
    return res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

router.get('/check-online', isAuthenticated, async (req, res) => {
  try {
    const steamid = req.user!.steamid;

    if (!rconService.isConfigured()) {
      return res.json({
        online: false,
        message: 'RCON не настроен, невозможно проверить статус',
      });
    }

    try {
      const isOnline = await rconService.isPlayerOnline(steamid);
      return res.json({
        online: isOnline,
        message: isOnline ? 'Вы онлайн на сервере' : 'Вы оффлайн',
      });
    } catch (rconError: unknown) {
      const message = rconError instanceof Error ? rconError.message : String(rconError);
      console.error('RCON online check failed:', message);
      return res.json({
        online: false,
        message: 'Не удалось связаться с игровым сервером',
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error checking online status:', message);
    return res.status(500).json({ error: 'Не удалось проверить статус' });
  }
});

router.post('/use/:id', isAuthenticated, async (req, res) => {
  const connection = await webPool.getConnection();

  try {
    const steamid = req.user!.steamid;
    const inventoryId = parseInt(req.params.id, 10);

    if (!Number.isFinite(inventoryId) || inventoryId < 1) {
      return res.status(400).json({ error: 'Invalid inventory item ID' });
    }

    await connection.beginTransaction();

    const [items] = await connection.query<InventoryItemRow[]>(
      `SELECT pi.*, si.name, si.rust_item_code, si.quantity as item_quantity
       FROM player_inventory pi
       JOIN shop_items si ON pi.shop_item_id = si.id
       WHERE pi.id = ? AND pi.steamid = ? AND pi.status = 'pending'
       FOR UPDATE`,
      [inventoryId, steamid]
    );

    if (items.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Item not found or already used' });
    }

    const item = items[0];

    if (!rconService.isConfigured()) {
      await connection.rollback();
      return res.status(503).json({
        error: 'Выдача предметов временно недоступна (RCON не настроен)',
      });
    }

    try {
      const isOnline = await rconService.isPlayerOnline(steamid);
      if (!isOnline) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Вы должны быть онлайн на сервере, чтобы получить предмет',
        });
      }
    } catch (onlineCheckError: unknown) {
      await connection.rollback();
      const message = onlineCheckError instanceof Error ? onlineCheckError.message : String(onlineCheckError);
      console.error('RCON online check failed:', message);
      return res.status(502).json({
        error: 'Не удалось проверить онлайн-статус. Попробуйте позже.',
      });
    }

    try {
      await rconService.giveItem(steamid, item.rust_item_code, item.quantity);
    } catch (rconError: unknown) {
      await connection.rollback();
      const message = rconError instanceof Error ? rconError.message : String(rconError);
      console.error('RCON delivery failed:', message);
      return res.status(502).json({
        error: 'Не удалось выдать предмет на сервере. Попробуйте позже.',
      });
    }

    const [updateResult] = await connection.query<ResultSetHeader>(
      "UPDATE player_inventory SET status = 'delivered', delivered_at = NOW() WHERE id = ? AND status = 'pending'",
      [inventoryId]
    );

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Предмет уже был получен' });
    }

    await connection.commit();

    return res.json({
      success: true,
      message: `${item.name} выдан вашему персонажу в игре`,
      item: {
        name: item.name,
        quantity: item.quantity,
        rust_code: item.rust_item_code,
      },
    });
  } catch (error: unknown) {
    await connection.rollback();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error using item:', message);
    return res.status(500).json({ error: 'Failed to use item' });
  } finally {
    connection.release();
  }
});

router.get('/transactions', isAuthenticated, async (req, res) => {
  try {
    const steamid = req.user!.steamid;
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));

    const [rows] = await webPool.query<RowDataPacket[]>(
      'SELECT id, type, amount, description, created_at FROM transactions WHERE steamid = ? ORDER BY created_at DESC LIMIT ?',
      [steamid, limit]
    );

    return res.json({ transactions: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching transactions:', message);
    return res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

export default router;
