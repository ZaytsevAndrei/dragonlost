import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { webPool } from '../config/database';
import { extractShpParams, verifyResultSignature } from '../services/robokassa';

const router = Router();

/** IP Robokassa для ResultURL: https://docs.robokassa.ru/ru/notifications-and-redirects */
const ROBOKASSA_ALLOWED_IPS = new Set(['185.59.216.65', '185.59.217.65']);

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: 'bad request',
  standardHeaders: true,
});

router.use(webhookLimiter);

function normalizeClientIp(raw: string): string {
  let ip = raw.trim();
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  return ip;
}

function isRobokassaIp(requestIp: string): boolean {
  if (process.env.ROBOKASSA_SKIP_IP_CHECK === '1' || process.env.ROBOKASSA_SKIP_IP_CHECK === 'true') {
    return true;
  }
  const ip = normalizeClientIp(requestIp);
  return ROBOKASSA_ALLOWED_IPS.has(ip);
}

function pickParam(source: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = source[name];
    if (value != null && String(value).length > 0) {
      return String(value);
    }
  }
  return '';
}

async function handleResultUrl(req: Request, res: Response): Promise<void> {
  try {
    const clientIp = req.ip || req.socket.remoteAddress || '';
    if (!isRobokassaIp(clientIp)) {
      console.warn(`Robokassa ResultURL: отклонён запрос с IP ${clientIp}`);
      res.status(403).type('text/plain').send('bad ip');
      return;
    }

    const params = { ...(req.query as Record<string, unknown>), ...(req.body as Record<string, unknown>) };
    const outSum = pickParam(params, 'OutSum', 'out_summ', 'outSum');
    const invId = pickParam(params, 'InvId', 'inv_id', 'InvID');
    const signatureValue = pickParam(params, 'SignatureValue', 'crc', 'signature');

    if (!outSum || !invId || !signatureValue) {
      res.status(400).type('text/plain').send('bad request');
      return;
    }

    const shp = extractShpParams(params);
    if (!verifyResultSignature({ outSum, invId, signatureValue, shp })) {
      console.warn(`Robokassa ResultURL: неверная подпись InvId=${invId}`);
      res.status(400).type('text/plain').send('bad sign');
      return;
    }

    const orderId = Number.parseInt(invId, 10);
    if (!Number.isFinite(orderId) || orderId < 1) {
      res.status(400).type('text/plain').send('bad inv');
      return;
    }

    const paidAmount = Number.parseFloat(outSum);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      res.status(400).type('text/plain').send('bad sum');
      return;
    }

    const connection = await webPool.getConnection();
    try {
      await connection.beginTransaction();

      const [orders] = await connection.query<RowDataPacket[]>(
        'SELECT id, steamid, amount, status FROM payment_orders WHERE id = ? FOR UPDATE',
        [orderId]
      );

      if (orders.length === 0) {
        await connection.rollback();
        res.status(404).type('text/plain').send('order not found');
        return;
      }

      const order = orders[0];
      if (order.status === 'success') {
        await connection.commit();
        res.status(200).type('text/plain').send(`OK${invId}`);
        return;
      }

      const orderAmount = Number(order.amount);
      if (Math.abs(paidAmount - orderAmount) > 0.01) {
        console.warn(
          `Robokassa ResultURL: сумма не совпала InvId=${invId} paid=${paidAmount} order=${orderAmount}`
        );
        await connection.rollback();
        res.status(400).type('text/plain').send('bad sum');
        return;
      }

      const resultPayload = {
        provider: 'robokassa',
        result: {
          OutSum: outSum,
          InvId: invId,
          Fee: pickParam(params, 'Fee'),
          PaymentMethod: pickParam(params, 'PaymentMethod'),
          IncCurrLabel: pickParam(params, 'IncCurrLabel'),
          EMail: pickParam(params, 'EMail', 'Email'),
        },
      };

      const [updateResult] = await connection.query<ResultSetHeader>(
        `UPDATE payment_orders
         SET status = 'success',
             external_id = COALESCE(external_id, ?),
             payload = ?
         WHERE id = ? AND status = 'pending'`,
        [invId, JSON.stringify(resultPayload), orderId]
      );

      if (updateResult.affectedRows === 0) {
        await connection.rollback();
        res.status(200).type('text/plain').send(`OK${invId}`);
        return;
      }

      await connection.query(
        `INSERT INTO player_balance (steamid, balance, total_earned, total_spent) VALUES (?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE balance = balance + ?, total_earned = total_earned + ?`,
        [order.steamid, orderAmount, orderAmount, orderAmount, orderAmount]
      );

      await connection.query(
        'INSERT INTO transactions (steamid, type, amount, description) VALUES (?, ?, ?, ?)',
        [order.steamid, 'earn', orderAmount, `Пополнение баланса #${orderId}`]
      );

      await connection.commit();
      res.status(200).type('text/plain').send(`OK${invId}`);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('Robokassa ResultURL error:', err);
    res.status(500).type('text/plain').send('error');
  }
}

/** ResultURL — Robokassa может слать GET или POST */
router.post('/robokassa', (req, res) => {
  void handleResultUrl(req, res);
});
router.get('/robokassa', (req, res) => {
  void handleResultUrl(req, res);
});

export default router;
