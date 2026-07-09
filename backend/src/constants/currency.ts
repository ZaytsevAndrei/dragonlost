/** Склонение «монета / монеты / монет» для сообщений бота и Discord. */
export function pluralCoins(count: number): string {
  const abs = Math.abs(Math.round(count)) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 19) return 'монет';
  if (last === 1) return 'монета';
  if (last >= 2 && last <= 4) return 'монеты';
  return 'монет';
}

export function formatCoinsWithLabel(amount: number): string {
  const value = Math.round(amount);
  return `${value.toLocaleString('ru-RU')} ${pluralCoins(value)}`;
}
