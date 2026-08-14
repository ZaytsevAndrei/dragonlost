import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { webPool } from '../config/database';
import { extractShpParams, verifyResultSignature } from '../services/robokassa';
import { writePaymentAudit } from '../services/paymentAudit';

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

function documentPayload(params: Record<string, unknown>) {
  return {
    OutSum: pickParam(params, 'OutSum', 'out_summ', 'outSum'),
    InvId: pickParam(params, 'InvId', 'inv_id', 'InvID'),
    SignatureValue: pickParam(params, 'SignatureValue', 'crc', 'signature'),
    Fee: pickParam(params, 'Fee'),
    PaymentMethod: pickParam(params, 'PaymentMethod'),
    IncCurrLabel: pickParam(params, 'IncCurrLabel'),
    EMail: pickParam(params, 'EMail', 'Email'),
    shp: extractShpParams(params),
  };
}

async function handleResultUrl(req: Request, res: Response): Promise<void> {
  const clientIp = req.ip || req.socket.remoteAddress || '';
  const httpMethod = req.method;

  try {
    if (!isRobokassaIp(clientIp)) {
      console.warn(`Robokassa ResultURL: отклонён запрос с IP ${clientIp}`);
      await writePaymentAudit({
        event: 'result_rejected_ip',
        ip: clientIp,
        httpMethod,
        note: 'IP не в белом списке Robokassa',
      });
      res.status(403).type('text/plain').send('bad ip');
      return;
    }

    const params = { ...(req.query as Record<string, unknown>), ...(req.body as Record<string, unknown>) };
    const doc = documentPayload(params);
    const outSum = doc.OutSum;
    const invId = doc.InvId;
    const signatureValue = doc.SignatureValue;
    const parsedOrderId = Number.parseInt(invId, 10);
    const orderId = Number.isFinite(parsedOrderId) && parsedOrderId > 0 ? parsedOrderId : null;

    if (!outSum || !invId || !signatureValue) {
      await writePaymentAudit({
        event: 'result_bad_request',
        orderId,
        ip: clientIp,
        httpMethod,
        payload: doc,
        note: 'Нет OutSum, InvId или SignatureValue',
      });
      res.status(400).type('text/plain').send('bad request');
      return;
    }

    const shp = doc.shp;
    if (!verifyResultSignature({ outSum, invId, signatureValue, shp })) {
      console.warn(`Robokassa ResultURL: неверная подпись InvId=${invId}`);
      await writePaymentAudit({
        event: 'result_bad_sign',
        orderId,
        ip: clientIp,
        httpMethod,
        payload: doc,
        note: 'Неверная SignatureValue',
      });
      res.status(400).type('text/plain').send('bad sign');
      return;
    }

    if (orderId == null) {
      await writePaymentAudit({
        event: 'result_bad_inv',
        ip: clientIp,
        httpMethod,
        payload: doc,
        note: 'Некорректный InvId',
      });
      res.status(400).type('text/plain').send('bad inv');
      return;
    }

    const paidAmount = Number.parseFloat(outSum);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      await writePaymentAudit({
        event: 'result_bad_sum',
        orderId,
        ip: clientIp,
        httpMethod,
        payload: doc,
        note: 'Некорректная сумма',
      });
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
        await writePaymentAudit({
          event: 'result_order_not_found',
          orderId,
          ip: clientIp,
          httpMethod,
          payload: doc,
        });
        res.status(404).type('text/plain').send('order not found');
        return;
      }

      const order = orders[0];
      if (order.status === 'success') {
        await connection.commit();
        await writePaymentAudit({
          event: 'result_already_success',
          orderId,
          steamid: String(order.steamid),
          ip: clientIp,
          httpMethod,
          payload: doc,
          note: 'Повторный ResultURL, баланс не менялся',
        });
        res.status(200).type('text/plain').send(`OK${invId}`);
        return;
      }

      const orderAmount = Number(order.amount);
      if (Math.abs(paidAmount - orderAmount) > 0.01) {
        console.warn(
          `Robokassa ResultURL: сумма не совпала InvId=${invId} paid=${paidAmount} order=${orderAmount}`
        );
        await connection.rollback();
        await writePaymentAudit({
          event: 'result_bad_sum',
          orderId,
          steamid: String(order.steamid),
          ip: clientIp,
          httpMethod,
          payload: { ...doc, orderAmount },
          note: `paid=${paidAmount} order=${orderAmount}`,
        });
        res.status(400).type('text/plain').send('bad sum');
        return;
      }

      const resultPayload = {
        provider: 'robokassa',
        result: {
          OutSum: outSum,
          InvId: invId,
          Fee: doc.Fee,
          PaymentMethod: doc.PaymentMethod,
          IncCurrLabel: doc.IncCurrLabel,
          EMail: doc.EMail,
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
        await writePaymentAudit({
          event: 'result_already_success',
          orderId,
          steamid: String(order.steamid),
          ip: clientIp,
          httpMethod,
          payload: doc,
          note: 'UPDATE pending не затронул строку',
        });
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

      await writePaymentAudit(
        {
          event: 'result_credited',
          orderId,
          steamid: String(order.steamid),
          ip: clientIp,
          httpMethod,
          payload: { ...doc, credited: orderAmount },
          note: `Начислено ${orderAmount} на ${order.steamid}`,
        },
        connection
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
    await writePaymentAudit({
      event: 'result_error',
      ip: clientIp,
      httpMethod,
      note: err instanceof Error ? err.message : 'Unknown error',
    });
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
