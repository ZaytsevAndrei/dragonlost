import { Router } from 'express';
import { RowDataPacket } from 'mysql2';
import { webPool } from '../config/database';

const router = Router();

interface ShopItemRow extends RowDataPacket {
  id?: number;
  sort_order?: number;
  [key: string]: unknown;
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

export default router;
