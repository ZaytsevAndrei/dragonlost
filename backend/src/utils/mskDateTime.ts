/** Москва (UTC+3, без перехода на летнее время с 2014 г.). */
export const MSK_TZ = 'Europe/Moscow';

/** DATETIME для MySQL: настенное время в МСК (без таймзоны в колонке). */
export function formatMysqlDatetimeMsk(date: Date): string {
  return date.toLocaleString('sv-SE', { timeZone: MSK_TZ }).replace('T', ' ');
}

/** Парсит DATETIME из MySQL как московское настенное время. */
export function parseMysqlDatetimeMsk(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value;
  }
  const raw = String(value).trim();
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, sec = '00'] = m;
  const parsed = new Date(`${y}-${mo}-${d}T${h}:${mi}:${sec}+03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
