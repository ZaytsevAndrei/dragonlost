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
  /** Пользовательские параметры Shp_* (без префикса в ключе — будет добавлен) */
  shp?: Record<string, string>;
}

export interface CreatePaymentResult {
  redirectUrl: string;
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

/**
 * Подпись инициализации платежа (Password#1):
 * MerchantLogin:OutSum:InvId:Пароль#1[:Shp_*]
 */
export function buildPaymentSignature(
  merchantLogin: string,
  outSum: string,
  invId: number | string,
  password1: string,
  hashAlgo: RobokassaHashAlgo,
  shp?: Record<string, string>
): string {
  const base = `${merchantLogin}:${outSum}:${invId}:${password1}${formatShpSuffix(shp)}`;
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

/**
 * Формирует URL редиректа на платёжную страницу Robokassa.
 */
export function createPayment(params: CreatePaymentParams): CreatePaymentResult {
  const { merchantLogin, password1, hashAlgo, isTest } = getConfig();
  const outSum = formatOutSum(params.amount);
  const description = params.description.slice(0, 100);
  const signatureValue = buildPaymentSignature(
    merchantLogin,
    outSum,
    params.invId,
    password1,
    hashAlgo,
    params.shp
  );

  const query = new URLSearchParams();
  query.set('MerchantLogin', merchantLogin);
  query.set('OutSum', outSum);
  query.set('InvId', String(params.invId));
  query.set('Description', description);
  query.set('SignatureValue', signatureValue);
  query.set('Culture', params.culture || 'ru');
  query.set('Encoding', 'utf-8');

  if (isTest) {
    query.set('IsTest', '1');
  }
  if (params.email) {
    query.set('Email', params.email);
  }

  const paymentMethods = (params.paymentMethods || []).map((m) => m.trim()).filter(Boolean);
  if (paymentMethods.length > 0) {
    for (const method of paymentMethods) {
      query.append('PaymentMethods', method);
    }
  } else if (params.incCurrLabel) {
    query.set('IncCurrLabel', params.incCurrLabel);
  }

  if (params.shp) {
    for (const [k, v] of Object.entries(params.shp)) {
      const key = k.startsWith('Shp_') ? k : `Shp_${k}`;
      query.set(key, v);
    }
  }

  return {
    redirectUrl: `${PAYMENT_URL}?${query.toString()}`,
    signatureValue,
    outSum,
    invId: params.invId,
    isTest,
  };
}
