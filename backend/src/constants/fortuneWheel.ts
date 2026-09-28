/** Константы колеса удачи. Должен совпадать с frontend/src/constants/fortuneWheel.ts */

/** Кулдаун между бесплатными вращениями. */
export const FORTUNE_WHEEL_COOLDOWN_HOURS = 4;

/** Метка, которую нужно добавить в ник Steam для вращения. */
export const FORTUNE_WHEEL_NICKNAME_TAG = 'dragonlost.ru';

/** Сколько последних выигрышей показывать в ленте. */
export const FORTUNE_WHEEL_RECENT_WINS_LIMIT = 12;

export type FortuneWheelRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface WeightedPrize {
  weight: number;
}

/** Взвешенный случайный выбор приза (weight — относительный вес, не обязан суммироваться в 100). */
export function rollWeightedPrize<T extends WeightedPrize>(prizes: T[]): T {
  const total = prizes.reduce((sum, prize) => sum + Number(prize.weight), 0);
  let roll = Math.random() * total;
  for (const prize of prizes) {
    roll -= Number(prize.weight);
    if (roll < 0) return prize;
  }
  return prizes[prizes.length - 1];
}

export interface QuantityRangedPrize {
  quantity: number;
  quantity_max: number | null;
}

/**
 * Фактическое количество приза: фикс (quantity) или ролл из диапазона quantity..quantity_max.
 * Для призов старого формата ("wood:1000", quantity=1) возвращает quantity как есть.
 */
export function rollPrizeQuantity(prize: QuantityRangedPrize): number {
  const min = Number(prize.quantity);
  const max = prize.quantity_max === null ? min : Number(prize.quantity_max);
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}
