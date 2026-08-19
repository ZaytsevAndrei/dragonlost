/**
 * Robokassa payment interface.
 * Docs: https://docs.robokassa.ru/ru/pay-interface
 * Notifications: https://docs.robokassa.ru/ru/notifications-and-redirects
 * Currencies XML: https://docs.robokassa.ru/ru/xml-interfaces
 */

import { createHash } from 'crypto';

const PAYMENT_URL = 'https://auth.robokassa.ru/Merchant/Index.aspx';
const CURRENCIES_URL = 'https://auth.robokassa.ru/Merchant/WebService/Service.asmx/GetCurrencies';
const CURRENCIES_CACHE_MS = 10 * 60 * 1000;

export type RobokassaHashAlgo = 'md5' | 'sha256' | 'sha512';

export interface RobokassaPaymentMethod {
  /** Значение для IncCurrLabel / PaymentMethods (Alias из XML) */
  alias: string;
  label: string;
  name: string;
  groupCode: string;
  groupDescription: string;
  minValue: number | null;
  maxValue: number | null;
}

export interface RobokassaReceiptItem {
  name: string;
  quantity: number;
  sum: number;
  tax: string;
  cost?: number;
  payment_method?: string;
  payment_object?: string;
  nomenclature_code?: string;
}

export interface RobokassaReceipt {
  sno?: string;
  items: RobokassaReceiptItem[];
}

export interface CreatePaymentParams {
  amount: number;
  invId: number;
  description: string;
  email?: string;
  /** Alias способа оплаты (например BankCard, SBP) */
  incCurrLabel?: string;
  /** Несколько Alias (параметр PaymentMethods) */
  paymentMethods?: string[];
  culture?: 'ru' | 'en';
  /** Фискальная номенклатура (54-ФЗ) */
  receipt?: RobokassaReceipt;
  /** Пользовательские параметры Shp_* (без префикса в ключе — будет добавлен) */
  shp?: Record<string, string>;
}

export interface PaymentFormPayload {
  action: string;
  method: 'POST';
  fields: Array<{ name: string; value: string }>;
}

export interface CreatePaymentResult {
  redirectUrl: string;
  paymentForm: PaymentFormPayload;
  signatureValue: string;
  outSum: string;
  invId: number;
  isTest: boolean;
}

let currenciesCache: { at: number; methods: RobokassaPaymentMethod[] } | null = null;

function getConfig() {
  const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN?.trim();
  const password1 = process.env.ROBOKASSA_PASSWORD1?.trim();
  const password2 = process.env.ROBOKASSA_PASSWORD2?.trim();
  if (!merchantLogin || !password1 || !password2) {
    throw new Error('ROBOKASSA_MERCHANT_LOGIN, ROBOKASSA_PASSWORD1 and ROBOKASSA_PASSWORD2 must be set');
  }

  const algoRaw = (process.env.ROBOKASSA_HASH_ALGO || 'md5').trim().toLowerCase();
  const hashAlgo: RobokassaHashAlgo =
    algoRaw === 'sha256' || algoRaw === 'sha512' ? algoRaw : 'md5';

  const isTest = process.env.ROBOKASSA_IS_TEST === '1' || process.env.ROBOKASSA_IS_TEST === 'true';

  return { merchantLogin, password1, password2, hashAlgo, isTest };
}

function hashValue(value: string, algo: RobokassaHashAlgo): string {
  const nodeAlgo = algo === 'md5' ? 'md5' : algo;
  return createHash(nodeAlgo).update(value, 'utf8').digest('hex');
}

function attr(attrs: string, name: string): string {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return match ? match[1] : '';
}

function parseNumberAttr(attrs: string, name: string): number | null {
  const raw = attr(attrs, name);
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function parseCurrenciesXml(xml: string): RobokassaPaymentMethod[] {
  const methods: RobokassaPaymentMethod[] = [];
  const groupRe = /<Group\b([^>]*)>([\s\S]*?)<\/Group>/gi;
  let groupMatch: RegExpExecArray | null;
  while ((groupMatch = groupRe.exec(xml)) !== null) {
    const groupAttrs = groupMatch[1];
    const groupBody = groupMatch[2];
    const groupCode = attr(groupAttrs, 'Code');
    const groupDescription = attr(groupAttrs, 'Description');
    const currencyRe = /<Currency\b([^>]*?)\s*\/>/gi;
    let currencyMatch: RegExpExecArray | null;
    while ((currencyMatch = currencyRe.exec(groupBody)) !== null) {
      const currencyAttrs = currencyMatch[1];
      const alias = attr(currencyAttrs, 'Alias');
      const label = attr(currencyAttrs, 'Label');
      if (!alias) continue;
      methods.push({
        alias,
        label: label || alias,
        name: attr(currencyAttrs, 'Name') || alias,
        groupCode,
        groupDescription,
        minValue: parseNumberAttr(currencyAttrs, 'MinValue'),
        maxValue: parseNumberAttr(currencyAttrs, 'MaxValue'),
      });
    }
  }
  return methods;
}

/**
 * Список способов оплаты магазина (GetCurrencies).
 * В IncCurrLabel / PaymentMethods передаётся Alias.
 */
export async function getPaymentMethods(options?: { force?: boolean }): Promise<RobokassaPaymentMethod[]> {
  const now = Date.now();
  if (!options?.force && currenciesCache && now - currenciesCache.at < CURRENCIES_CACHE_MS) {
    return currenciesCache.methods;
  }

  const { merchantLogin } = getConfig();
  const url = `${CURRENCIES_URL}?MerchantLogin=${encodeURIComponent(merchantLogin)}&Language=ru`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Robokassa GetCurrencies failed: ${res.status}`);
  }
  const xml = await res.text();
  if (!/<Result>\s*<Code>0<\/Code>/i.test(xml)) {
    const code = xml.match(/<Code>(\d+)<\/Code>/i)?.[1] || 'unknown';
    throw new Error(`Robokassa GetCurrencies error code: ${code}`);
  }

  const methods = parseCurrenciesXml(xml);
  currenciesCache = { at: now, methods };
  return methods;
}

/** Сортировка Shp_* по имени (алфавит), формат :Shp_key=value */
function formatShpSuffix(shp?: Record<string, string>): string {
  if (!shp) return '';
  const entries = Object.entries(shp)
    .filter(([, v]) => v != null && String(v).length > 0)
    .map(([k, v]) => {
      const key = k.startsWith('Shp_') ? k : `Shp_${k}`;
      return [key, String(v)] as const;
    })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `:${k}=${v}`).join('');
}

export function formatOutSum(amount: number): string {
  return amount.toFixed(2);
}

/** JSON Receipt и URL-кодированное значение для подписи и формы оплаты */
export function serializeReceipt(receipt: RobokassaReceipt): { json: string; encoded: string } {
  const json = JSON.stringify(receipt);
  return { json, encoded: encodeURIComponent(json) };
}

/** Номенклатура для пополнения игрового баланса (аванс) */
export function buildDepositReceipt(amount: number): RobokassaReceipt {
  const tax = process.env.ROBOKASSA_RECEIPT_TAX?.trim() || 'none';
  const paymentMethod = process.env.ROBOKASSA_RECEIPT_PAYMENT_METHOD?.trim() || 'advance';
  const paymentObject = process.env.ROBOKASSA_RECEIPT_PAYMENT_OBJECT?.trim() || 'payment';
  const itemName =
    process.env.ROBOKASSA_RECEIPT_ITEM_NAME?.trim() || 'Пополнение игрового баланса DragonLost';
  const sno = process.env.ROBOKASSA_RECEIPT_SNO?.trim();

  const receipt: RobokassaReceipt = {
    items: [
      {
        name: itemName.slice(0, 128),
        quantity: 1,
        sum: Number.parseFloat(formatOutSum(amount)),
        tax,
        payment_method: paymentMethod,
        payment_object: paymentObject,
      },
    ],
  };

  if (sno) {
    receipt.sno = sno;
  }

  return receipt;
}

/**
 * Подпись инициализации платежа (Password#1):
 * MerchantLogin:OutSum:InvId[:Receipt]:Пароль#1[:Shp_*]
 */
export function buildPaymentSignature(
  merchantLogin: string,
  outSum: string,
  invId: number | string,
  password1: string,
  hashAlgo: RobokassaHashAlgo,
  options?: { shp?: Record<string, string>; receiptEncoded?: string }
): string {
  const receiptPart = options?.receiptEncoded ? `:${options.receiptEncoded}` : '';
  const base = `${merchantLogin}:${outSum}:${invId}${receiptPart}:${password1}${formatShpSuffix(options?.shp)}`;
  return hashValue(base, hashAlgo);
}

/**
 * Подпись ResultURL (Password#2):
 * OutSum:InvId:Пароль#2[:Shp_*]
 */
export function buildResultSignature(
  outSum: string,
  invId: number | string,
  password2: string,
  hashAlgo: RobokassaHashAlgo,
  shp?: Record<string, string>
): string {
  const base = `${outSum}:${invId}:${password2}${formatShpSuffix(shp)}`;
  return hashValue(base, hashAlgo);
}

export function extractShpParams(params: Record<string, unknown>): Record<string, string> {
  const shp: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!key.startsWith('Shp_') && !key.startsWith('shp_')) continue;
    if (value == null) continue;
    shp[key.startsWith('Shp_') ? key : `Shp_${key.slice(4)}`] = String(value);
  }
  return shp;
}

export function verifyResultSignature(params: {
  outSum: string;
  invId: string;
  signatureValue: string;
  shp?: Record<string, string>;
}): boolean {
  const { password2, hashAlgo } = getConfig();
  const expected = buildResultSignature(params.outSum, params.invId, password2, hashAlgo, params.shp);
  return expected.toUpperCase() === params.signatureValue.toUpperCase();
}

function buildPaymentFields(
  params: CreatePaymentParams,
  ctx: { merchantLogin: string; password1: string; hashAlgo: RobokassaHashAlgo; isTest: boolean }
): { fields: Array<{ name: string; value: string }>; signatureValue: string; outSum: string } {
  const { merchantLogin, password1, hashAlgo, isTest } = ctx;
  const outSum = formatOutSum(params.amount);
  const description = params.description.slice(0, 100);
  const receiptEncoded = params.receipt ? serializeReceipt(params.receipt).encoded : undefined;

  const signatureValue = buildPaymentSignature(merchantLogin, outSum, params.invId, password1, hashAlgo, {
    shp: params.shp,
    receiptEncoded,
  });

  const fields: Array<{ name: string; value: string }> = [
    { name: 'MerchantLogin', value: merchantLogin },
    { name: 'OutSum', value: outSum },
    { name: 'InvId', value: String(params.invId) },
    { name: 'Description', value: description },
    { name: 'SignatureValue', value: signatureValue },
    { name: 'Culture', value: params.culture || 'ru' },
    { name: 'Encoding', value: 'utf-8' },
  ];

  if (isTest) {
    fields.push({ name: 'IsTest', value: '1' });
  }
  if (params.email) {
    fields.push({ name: 'Email', value: params.email });
  }
  if (receiptEncoded) {
    fields.push({ name: 'Receipt', value: receiptEncoded });
  }

  const paymentMethods = (params.paymentMethods || []).map((m) => m.trim()).filter(Boolean);
  if (paymentMethods.length > 0) {
    for (const method of paymentMethods) {
      fields.push({ name: 'PaymentMethods', value: method });
    }
  } else if (params.incCurrLabel) {
    fields.push({ name: 'IncCurrLabel', value: params.incCurrLabel });
  }

  if (params.shp) {
    for (const [k, v] of Object.entries(params.shp)) {
      const key = k.startsWith('Shp_') ? k : `Shp_${k}`;
      fields.push({ name: key, value: v });
    }
  }

  return { fields, signatureValue, outSum };
}

/**
 * Формирует URL редиректа и POST-форму на платёжную страницу Robokassa.
 * При наличии Receipt рекомендуется отправлять paymentForm методом POST.
 */
export function createPayment(params: CreatePaymentParams): CreatePaymentResult {
  const ctx = getConfig();
  const { fields, signatureValue, outSum } = buildPaymentFields(params, ctx);

  const query = new URLSearchParams();
  for (const { name, value } of fields) {
    query.append(name, value);
  }

  return {
    redirectUrl: `${PAYMENT_URL}?${query.toString()}`,
    paymentForm: {
      action: PAYMENT_URL,
      method: 'POST',
      fields,
    },
    signatureValue,
    outSum,
    invId: params.invId,
    isTest: ctx.isTest,
  };
}
