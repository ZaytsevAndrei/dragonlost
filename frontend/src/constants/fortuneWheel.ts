/** Константы колеса удачи. Должен совпадать с backend/src/constants/fortuneWheel.ts */

export type FortuneWheelRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface FortuneWheelPrize {
  id: number;
  name: string;
  wheel_label: string;
  description: string | null;
  category: string;
  rarity: FortuneWheelRarity;
  quantity: number;
  quantity_max: number | null;
  image_url: string | null;
  chance_percent: number;
  sector_index: number;
}

export interface WheelSpinTarget {
  sectorIndex: number;
}

export const FORTUNE_WHEEL_RARITY_LABELS: Record<FortuneWheelRarity, string> = {
  common: 'Обычный',
  uncommon: 'Необычный',
  rare: 'Редкий',
  epic: 'Эпический',
  legendary: 'Легендарный',
};

export const RARITY_EMOJI: Record<FortuneWheelRarity, string> = {
  common: '📦',
  uncommon: '🌿',
  rare: '💧',
  epic: '💜',
  legendary: '🔥',
};

/** Градиенты секторов — продолжение палитры ежедневного колеса. */
export const FORTUNE_WHEEL_RARITY_COLORS: Record<
  FortuneWheelRarity,
  { light: string; mid: string; dark: string; stroke: string; glow: string }
> = {
  common: { light: '#d7dde6', mid: '#aeb8c8', dark: '#6f7d90', stroke: '#4a5568', glow: 'rgba(174, 184, 200, 0.3)' },
  uncommon: { light: '#7ed99a', mid: '#4caf6a', dark: '#2a7a42', stroke: '#1f6b38', glow: 'rgba(76, 175, 106, 0.35)' },
  rare: { light: '#7eb8f0', mid: '#4a8fd4', dark: '#2a5a98', stroke: '#1e5080', glow: 'rgba(74, 143, 212, 0.35)' },
  epic: { light: '#d4a8f8', mid: '#a86cd8', dark: '#6a3898', stroke: '#5c2e88', glow: 'rgba(168, 108, 216, 0.4)' },
  legendary: { light: '#ff8a7a', mid: '#e04538', dark: '#9a2018', stroke: '#8a1a12', glow: 'rgba(224, 69, 56, 0.55)' },
};
