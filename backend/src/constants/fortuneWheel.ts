/** Константы колеса удачи. Должен совпадать с frontend/src/constants/fortuneWheel.ts */

/** Кулдаун между бесплатными вращениями. */
export const FORTUNE_WHEEL_COOLDOWN_HOURS = 4;

/** Метка, которую нужно добавить в ник Steam для вращения. */
export const FORTUNE_WHEEL_NICKNAME_TAG = 'dragonlost.ru';

/** Сколько последних выигрышей показывать в ленте. */
export const FORTUNE_WHEEL_RECENT_WINS_LIMIT = 12;

export type FortuneWheelRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

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
