import { Router, Request, Response } from 'express';
import { webPool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { getPayment } from '../services/yookassa';
import rateLimit from 'express-rate-limit';
import net from 'net';

const router = Router();

// Разрешённые IP-адреса ЮKassa (https://yookassa.ru/developers/using-api/webhooks)
const YOOKASSA_ALLOWED_CIDRS_V4 = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.156.11/32',
  '77.75.156.35/32',
  '77.75.154.128/25',
];

const YOOKASSA_ALLOWED_CIDRS_V6 = [
  '2a02:5180::/32',
];

function ipv4ToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isIpv4InCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr);
  const mask = bits === 32 ? 0xFFFFFFFF : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToNumber(ip) & mask) === (ipv4ToNumber(range) & mask);
}

function expandIpv6(ip: string): string {
  let parts: string[];
  if (ip.includes('::')) {
    const [left, right] = ip.split('::');
    const leftParts = left ? left.split(':') : [];
    const rightParts = right ? right.split(':') : [];
    const missing = 8 - leftParts.length - rightParts.length;
    parts = [...leftParts, ...Array(missing).fill('0'), ...rightParts];
  } else {
    parts = ip.split(':');
  }
  return parts.map(p => p.padStart(4, '0')).join(':');
}

function isIpv6InCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr);
  const expandedIp = expandIpv6(ip);
  const expandedRange = expandIpv6(range);
  const ipBin = expandedIp.split(':').map(h => parseInt(h, 16).toString(2).padStart(16, '0')).join('');
  const rangeBin = expandedRange.split(':').map(h => parseInt(h, 16).toString(2).padStart(16, '0')).join('');
  return ipBin.substring(0, bits) === rangeBin.substring(0, bits);
}

function isYooKassaIp(requestIp: string): boolean {
  let ip = requestIp;

  // IPv4-mapped IPv6 (::ffff:1.2.3.4)
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  if (net.isIPv4(ip)) {
    return YOOKASSA_ALLOWED_CIDRS_V4.some(cidr => isIpv4InCidr(ip, cidr));
  }

  if (net.isIPv6(ip)) {
    return YOOKASSA_ALLOWED_CIDRS_V6.some(cidr => isIpv6InCidr(ip, cidr));
  }

  return false;
}

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
    // Проверка IP-адреса отправителя
    const clientIp = req.ip || req.socket.remoteAddress || '';
    if (!isYooKassaIp(clientIp)) {
      console.warn(`YooKassa webhook: отклонён запрос с IP ${clientIp}`);
      return res.status(403).send();
    }

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
