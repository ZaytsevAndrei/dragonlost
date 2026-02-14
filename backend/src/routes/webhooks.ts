import { Router, Request, Response } from 'express';
import { webPool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { getPayment } from '../services/yookassa';
import rateLimit from 'express-rate-limit';

const router = Router();

interface YooKassaWebhookBody {
  type?: string;
  event?: string;
  object?: {
    id?: string;
    status?: string;
    amount?: { value?: string; currency?: string };
  };
}

// Строгий rate limit для webhook (защита от флуда)
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests' },
  standardHeaders: true,
});

router.use(webhookLimiter);

router.post('/yookassa', async (req: Request, res: Response) => {
  try {
    const body = req.body as YooKassaWebhookBody;
    if (body?.type !== 'notification' || body?.event !== 'payment.succeeded' || !body?.object?.id) {
      return res.status(200).send();
    }

    const externalId = body.object.id;
    const connection = await webPool.getConnection();

    try {
      const [orders] = await connection.query<RowDataPacket[]>(
        'SELECT id, user_id, amount, status FROM payment_orders WHERE external_id = ?',
        [externalId]
      );

      if (orders.length === 0) {
        return res.status(200).send();
      }

      const order = orders[0];
      if (order.status === 'success') {
        return res.status(200).send();
      }

      const payment = await getPayment(externalId);
      if (!payment || payment.status !== 'succeeded') {
        return res.status(200).send();
      }
      const paidAmount = parseFloat(payment.amount?.value || '0');
      const orderAmount = Number(order.amount);
      if (Math.abs(paidAmount - orderAmount) > 0.01) {
        return res.status(200).send();
      }

      await connection.beginTransaction();

      const [updateResult] = await connection.query<ResultSetHeader>(
        "UPDATE payment_orders SET status = 'success' WHERE id = ? AND status = 'pending'",
        [order.id]
      );

      if (updateResult.affectedRows === 0) {
        await connection.rollback();
        return res.status(200).send();
      }

      await connection.query(
        `INSERT INTO player_balance (user_id, balance, total_earned, total_spent) VALUES (?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE balance = balance + ?, total_earned = total_earned + ?`,
        [order.user_id, orderAmount, orderAmount, orderAmount, orderAmount]
      );

      await connection.query(
        'INSERT INTO transactions (user_id, type, amount, description, reference_id) VALUES (?, ?, ?, ?, ?)',
        [order.user_id, 'earn', orderAmount, `Пополнение баланса #${order.id}`, order.id]
      );

      await connection.commit();
      res.status(200).send();
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('YooKassa webhook error:', err instanceof Error ? err.message : 'Unknown error');
    res.status(200).send();
  }
});

export default router;
