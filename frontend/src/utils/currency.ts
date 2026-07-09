/** Склонение «монета / монеты / монет». */
export function pluralCoins(count: number): string {
  const abs = Math.abs(Math.round(count)) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 19) return 'монет';
  if (last === 1) return 'монета';
  if (last >= 2 && last <= 4) return 'монеты';
  return 'монет';
}

export function formatCoinNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '—';
  if (decimals <= 0) return Math.round(value).toLocaleString('ru-RU');
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCoinsWithLabel(value: number, decimals = 0): string {
  const amount = formatCoinNumber(value, decimals);
  return `${amount} ${pluralCoins(value)}`;
}
