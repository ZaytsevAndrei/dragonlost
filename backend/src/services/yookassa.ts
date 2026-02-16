/**
 * YooKassa API client for creating payments and verifying webhook notifications.
 * Docs: https://yookassa.ru/developers/api
 */

const YOOKASSA_API = 'https://api.yookassa.ru/v3';

function getAuthHeader(): string {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    throw new Error('YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY must be set');
  }
  const encoded = Buffer.from(`${shopId}:${secretKey}`, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}

export interface CreatePaymentParams {
  amount: number;
  returnUrl: string;
  description: string;
  idempotenceKey: string;
  metadata?: Record<string, string>;
}

export interface YooKassaPayment {
  id: string;
  status: string;
  amount: { value: string; currency: string };
  confirmation?: { confirmation_url?: string; type?: string };
  metadata?: Record<string, string>;
}

export interface CreatePaymentResponse {
  id: string;
  status: string;
  confirmation?: { confirmation_url?: string };
  amount?: { value: string; currency: string };
}

/**
 * Create a payment in YooKassa. Returns payment with confirmation_url for redirect.
 */
export async function createPayment(params: CreatePaymentParams): Promise<CreatePaymentResponse> {
  const auth = getAuthHeader();
  const body = {
    amount: {
      value: params.amount.toFixed(2),
      currency: 'RUB',
    },
    confirmation: {
      type: 'redirect',
      return_url: params.returnUrl,
    },
    description: params.description,
    metadata: params.metadata || {},
  };

  const res = await fetch(`${YOOKASSA_API}/payments`, {
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Idempotence-Key': params.idempotenceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`YooKassa create payment failed: ${res.status} ${errText}`);
  }

  return res.json() as Promise<CreatePaymentResponse>;
}

/** Проверяет, что строка похожа на UUID (формат идентификаторов YooKassa) */
function isValidPaymentId(id: string): boolean {
  return /^[0-9a-f-]{36,50}$/i.test(id);
}

/**
 * Get payment by ID. Used to verify webhook notification (object status and amount).
 */
export async function getPayment(paymentId: string): Promise<YooKassaPayment | null> {
  if (!isValidPaymentId(paymentId)) {
    throw new Error(`Invalid payment ID format: ${paymentId.substring(0, 20)}`);
  }
  const auth = getAuthHeader();
  const res = await fetch(`${YOOKASSA_API}/payments/${encodeURIComponent(paymentId)}`, {
    method: 'GET',
    headers: { 'Authorization': auth },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`YooKassa get payment failed: ${res.status} ${errText}`);
  }

  return res.json() as Promise<YooKassaPayment>;
}
