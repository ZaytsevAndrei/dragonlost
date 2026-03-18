import { Router } from 'express';
import { webPool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { isAuthenticated } from '../middleware/auth';
import { sensitiveRateLimiter, paymentRateLimiter } from '../middleware/rateLimiter';
import { createPayment } from '../services/yookassa';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

const router = Router();

const MIN_DEPOSIT = 10;
const MAX_DEPOSIT = 50000;
const MAX_PURCHASE_QUANTITY = 100;
const SHOP_UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'shop');
const LOCAL_IMAGE_PREFIX = '/uploads/shop/';
const PLACEHOLDER_LOCAL_IMAGE = `${LOCAL_IMAGE_PREFIX}placeholder.svg`;

function sendDebugLog(hypothesisId: string, location: string, message: string, data: Record<string, unknown>): void {
  // #region agent log
  fetch('http://127.0.0.1:7819/ingest/86a4283c-8121-48d2-a4df-05575a1c2a00',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4b5f35'},body:JSON.stringify({sessionId:'4b5f35',runId:'shop-images-pre-fix',hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
  // #endregion
}

function normalizeImageKey(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]+$/i, '');
}

function buildLocalImageIndex() {
  const byName = new Map<string, string>();
  const byStem = new Map<string, string>();

  if (!fs.existsSync(SHOP_UPLOADS_DIR)) {
    return { byName, byStem };
  }

  const files = fs.readdirSync(SHOP_UPLOADS_DIR, { withFileTypes: true });
  for (const entry of files) {
    if (!entry.isFile()) continue;
    const fileName = entry.name;
    const normalizedFileName = normalizeImageKey(fileName);
    const filePath = `${LOCAL_IMAGE_PREFIX}${fileName}`;
    byName.set(normalizedFileName, filePath);

    const stem = normalizeImageKey(stripFileExtension(fileName));
    if (stem && !byStem.has(stem)) {
      byStem.set(stem, filePath);
    }
  }

  return { byName, byStem };
}

function getFileNameFromImageUrl(imageUrl: string | null | undefined): string {
  const value = String(imageUrl || '').trim();
  if (!value) return '';

  if (value.startsWith(LOCAL_IMAGE_PREFIX)) {
    return value.slice(LOCAL_IMAGE_PREFIX.length);
  }

  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname || '';
    return pathname.split('/').pop() || '';
  } catch {
    const withoutQuery = value.split('?')[0];
    return withoutQuery.split('/').pop() || '';
  }
}

function hasLocalShopImage(fileName: string): boolean {
  if (!fileName) return false;
  const localFilePath = path.join(SHOP_UPLOADS_DIR, fileName);
  return fs.existsSync(localFilePath);
}

function resolveLocalImageUrl(
  item: Pick<ShopItem, 'name' | 'rust_item_code' | 'image_url'>,
  imageIndex: ReturnType<typeof buildLocalImageIndex>
): string | null {
  const currentUrl = String(item.image_url || '').trim();
  if (currentUrl.startsWith(LOCAL_IMAGE_PREFIX)) {
    const currentFileName = getFileNameFromImageUrl(currentUrl);
    return hasLocalShopImage(currentFileName) ? currentUrl : PLACEHOLDER_LOCAL_IMAGE;
  }

  const candidates = [
    normalizeImageKey(getFileNameFromImageUrl(currentUrl)),
    normalizeImageKey(stripFileExtension(getFileNameFromImageUrl(currentUrl))),
    normalizeImageKey(item.rust_item_code),
    normalizeImageKey(item.name),
    normalizeImageKey(item.name.replace(/\s*x\d+\s*$/i, '')),
  ].filter(Boolean);

  for (const key of candidates) {
    const byNameMatch = imageIndex.byName.get(key);
    if (byNameMatch) return byNameMatch;

    const byStemMatch = imageIndex.byStem.get(key);
    if (byStemMatch) return byStemMatch;
  }

  if (currentUrl.startsWith('http://') || currentUrl.startsWith('https://')) {
    return currentUrl;
  }

  return PLACEHOLDER_LOCAL_IMAGE;
}

interface ShopItem {
  id: number;
  name: string;
  description: string | null;
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
    const localImageIndex = buildLocalImageIndex();
    sendDebugLog('H2', 'routes/shop.ts:items:index', 'Local uploads index built', {
      byNameSize: localImageIndex.byName.size,
      byStemSize: localImageIndex.byStem.size,
      shopUploadsDir: SHOP_UPLOADS_DIR,
      sampleByName: Array.from(localImageIndex.byName.entries()).slice(0, 5),
    });
    
    let query = `
      SELECT
        id,
        name,
        CASE
          WHEN description LIKE 'Импорт с SicilianRust%' THEN NULL
          ELSE description
        END AS description,
        category,
        price,
        rust_item_code,
        quantity,
        image_url,
        is_available
      FROM shop_items
      WHERE is_available = TRUE
    `;
    const params: string[] = [];
    
    if (category) {
      query += ' AND category = ?';
      params.push(category as string);
    }
    
    query += ' ORDER BY category, price';
    
    const [rows] = await webPool.query<RowDataPacket[]>(query, params);
    const items = rows.map((row) => {
      const typedRow = row as unknown as ShopItem;
      return {
        ...row,
        image_url: resolveLocalImageUrl(typedRow, localImageIndex),
      };
    });
    const localUrlItems = items.filter((item) => String(item.image_url || '').startsWith(LOCAL_IMAGE_PREFIX));
    const missingLocalFileCount = localUrlItems.reduce((acc, item) => {
      const fileName = getFileNameFromImageUrl(String(item.image_url || ''));
      return hasLocalShopImage(fileName) ? acc : acc + 1;
    }, 0);
    sendDebugLog('H1', 'routes/shop.ts:items:resolved', 'Shop items resolved to image URLs', {
      category: category ? String(category) : null,
      totalItems: items.length,
      localUrlItems: localUrlItems.length,
      missingLocalFileCount,
      sampleMissingLocalUrls: localUrlItems
        .filter((item) => {
          const fileName = getFileNameFromImageUrl(String(item.image_url || ''));
          return !hasLocalShopImage(fileName);
        })
        .slice(0, 10)
        .map((item) => item.image_url),
    });
    res.json({ items });
  } catch (error) {
    sendDebugLog('H4', 'routes/shop.ts:items:error', 'Error in /shop/items', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    console.error('Error fetching shop items:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch shop items' });
  }
});

// Получить баланс игрока
router.get('/balance', isAuthenticated, async (req, res) => {
  try {
    const steamid = req.user!.steamid;
    
    const [rows] = await webPool.query<RowDataPacket[]>(
      'SELECT balance, total_earned, total_spent FROM player_balance WHERE steamid = ?',
      [steamid]
    );
    
    if (rows.length === 0) {
      // Создаем запись баланса, если её нет
      await webPool.query(
        'INSERT INTO player_balance (steamid, balance, total_earned, total_spent) VALUES (?, 0, 0, 0)',
        [steamid]
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
router.post('/deposit/create', paymentRateLimiter, isAuthenticated, async (req, res) => {
  try {
    const steamid = req.user!.steamid;
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
        `INSERT INTO payment_orders (steamid, amount, currency, status) VALUES (?, ?, 'RUB', 'pending')`,
        [steamid, amount]
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

      const redirectUrl = payment.confirmation?.confirmation_url || null;
      if (!redirectUrl) {
        return res.status(500).json({ error: 'Платёжная система не вернула ссылку на оплату' });
      }
      res.json({ redirect_url: redirectUrl, order_id: orderId });
    } finally {
      connection.release();
    }
  } catch (error: unknown) {
    console.error('Error creating deposit:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Ошибка при создании платежа. Попробуйте позже.' });
  }
});

// Активировать промокод
router.post('/deposit/redeem', sensitiveRateLimiter, isAuthenticated, async (req, res) => {
  const connection = await webPool.getConnection();
  try {
    const steamid = req.user!.steamid;
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
      [req.user!.id, voucher.id]
    );

    await connection.query(
      `INSERT INTO player_balance (steamid, balance, total_earned, total_spent) VALUES (?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE balance = balance + ?, total_earned = total_earned + ?`,
      [steamid, amount, amount, amount, amount]
    );
    await connection.query(
      'INSERT INTO transactions (steamid, type, amount, description) VALUES (?, ?, ?, ?)',
      [steamid, 'earn', amount, 'Активация промокода']
    );
    await connection.commit();

    const [balanceRows] = await connection.query<BalanceRow[]>(
      'SELECT balance FROM player_balance WHERE steamid = ?',
      [steamid]
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
router.post('/purchase', sensitiveRateLimiter, isAuthenticated, async (req, res) => {
  const connection = await webPool.getConnection();
  
  try {
    const steamid = req.user!.steamid;
    const item_id = parseInt(req.body.item_id);
    const quantity = parseInt(req.body.quantity) || 1;
    
    if (!Number.isFinite(item_id) || item_id < 1) {
      return res.status(400).json({ error: 'Invalid item_id' });
    }
    if (quantity < 1 || quantity > MAX_PURCHASE_QUANTITY) {
      return res.status(400).json({ error: `Quantity must be between 1 and ${MAX_PURCHASE_QUANTITY}` });
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
    
    // Получаем баланс игрока (FOR UPDATE блокирует строку до конца транзакции,
    // предотвращая race condition при параллельных покупках)
    let [balanceRows] = await connection.query<BalanceRow[]>(
      'SELECT balance FROM player_balance WHERE steamid = ? FOR UPDATE',
      [steamid]
    );
    
    if (balanceRows.length === 0) {
      // Создаем запись баланса
      await connection.query(
        'INSERT INTO player_balance (steamid, balance, total_earned, total_spent) VALUES (?, 0, 0, 0)',
        [steamid]
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
      'UPDATE player_balance SET balance = balance - ?, total_spent = total_spent + ? WHERE steamid = ?',
      [totalPrice, totalPrice, steamid]
    );
    
    // Добавляем предмет в инвентарь
    const [result] = await connection.query<ResultSetHeader>(
      'INSERT INTO player_inventory (steamid, shop_item_id, quantity, status) VALUES (?, ?, ?, ?)',
      [steamid, item_id, quantity * item.quantity, 'pending']
    );
    
    // Записываем транзакцию
    await connection.query(
      'INSERT INTO transactions (steamid, type, amount, description, reference_id) VALUES (?, ?, ?, ?, ?)',
      [steamid, 'purchase', -totalPrice, `Purchased ${item.name} x${quantity}`, result.insertId]
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
