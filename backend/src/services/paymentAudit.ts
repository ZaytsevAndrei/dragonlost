import type { Pool, PoolConnection } from 'mysql2/promise';
import { webPool } from '../config/database';

const MAX_PAYLOAD_CHARS = 16_000;

export type PaymentAuditEvent =
  | 'deposit_created'
  | 'result_rejected_ip'
  | 'result_bad_request'
  | 'result_bad_sign'
  | 'result_bad_inv'
  | 'result_bad_sum'
  | 'result_order_not_found'
  | 'result_already_success'
  | 'result_credited'
  | 'result_error';

export interface PaymentAuditEntry {
  event: PaymentAuditEvent;
  orderId?: number | null;
  steamid?: string | null;
  ip?: string | null;
  httpMethod?: string | null;
  payload?: unknown;
  note?: string | null;
}

function sanitizePayload(payload: unknown): string | null {
  if (payload == null) return null;
  try {
    const json = JSON.stringify(payload);
    if (!json) return null;
    if (json.length <= MAX_PAYLOAD_CHARS) return json;
    return `${json.slice(0, MAX_PAYLOAD_CHARS)}…[truncated]`;
  } catch {
    return null;
  }
}

/**
 * Журнал электронных документов по оплатам (п. 3.4 договора Robokassa).
 * Пишется даже при ошибке callback; сбой журнала не откатывает платёж.
 */
export async function writePaymentAudit(
  entry: PaymentAuditEntry,
  connection?: Pool | PoolConnection
): Promise<void> {
  const db = connection || webPool;
  try {
    await db.query(
      `INSERT INTO payment_audit_log
        (order_id, steamid, event, ip, http_method, payload, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.orderId ?? null,
        entry.steamid ?? null,
        entry.event,
        entry.ip ? entry.ip.slice(0, 45) : null,
        entry.httpMethod ? entry.httpMethod.slice(0, 8) : null,
        sanitizePayload(entry.payload),
        entry.note ? entry.note.slice(0, 512) : null,
      ]
    );
  } catch (err) {
    console.error(
      'payment_audit_log write failed:',
      err instanceof Error ? err.message : err
    );
  }
}
