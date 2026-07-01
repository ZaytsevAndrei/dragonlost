/** Должен совпадать с backend/src/constants/dailyRewardWheel.ts */
export const DAILY_REWARD_WHEEL_SECTORS = [
  10, 30, 10, 100, 10, 30, 10, 50, 10, 30, 10, 50, 10, 30, 10, 100, 10, 30, 10, 50, 10, 30, 10, 50,
  200,
] as const;

export type DailyRewardWheelAmount = (typeof DAILY_REWARD_WHEEL_SECTORS)[number];

export const RUST_WHEEL_MULTIPLIER: Record<DailyRewardWheelAmount, number> = {
  10: 1,
  30: 3,
  50: 5,
  100: 10,
  200: 20,
};

export const DAILY_REWARD_WHEEL_SUMMARY = [
  { amount: 10, count: 12, rustMultiplier: 1, tier: 'yellow' as const },
  { amount: 30, count: 6, rustMultiplier: 3, tier: 'green' as const },
  { amount: 50, count: 4, rustMultiplier: 5, tier: 'blue' as const },
  { amount: 100, count: 2, rustMultiplier: 10, tier: 'purple' as const },
  { amount: 200, count: 1, rustMultiplier: 20, tier: 'red' as const },
];

export const WHEEL_SECTOR_COUNT = DAILY_REWARD_WHEEL_SECTORS.length;
export const WHEEL_DEGREES_PER_SECTOR = 360 / WHEEL_SECTOR_COUNT;

/**
 * Угол поворота (по часовой), при котором сектор sectorIndex оказывается под указателем (12 ч).
 * Сектор 0 в покое уже под стрелкой; при вращении колесо крутится по часовой.
 */
export function wheelRotationForSector(sectorIndex: number): number {
  const normalized =
    ((360 - sectorIndex * WHEEL_DEGREES_PER_SECTOR) % 360) + 360;
  return normalized % 360;
}

export function wheelSpinDelta(currentRotation: number, sectorIndex: number, extraSpins = 6): number {
  const currentMod = ((currentRotation % 360) + 360) % 360;
  const targetMod = wheelRotationForSector(sectorIndex);
  let delta = (targetMod - currentMod + 360) % 360;
  if (delta < 0.5) delta = 360;
  return extraSpins * 360 + delta;
}

/** Цвета сегментов — насыщенные градиенты в духе Bandit Camp / Rust. */
export const WHEEL_TIER_COLORS: Record<DailyRewardWheelAmount, { fill: string; stroke: string; glow: string }> = {
  10: { fill: '#f0c040', stroke: '#8a6a10', glow: 'rgba(240, 192, 64, 0.35)' },
  30: { fill: '#4caf6a', stroke: '#1f6b38', glow: 'rgba(76, 175, 106, 0.35)' },
  50: { fill: '#4a8fd4', stroke: '#1e5080', glow: 'rgba(74, 143, 212, 0.35)' },
  100: { fill: '#a86cd8', stroke: '#5c2e88', glow: 'rgba(168, 108, 216, 0.4)' },
  200: { fill: '#e04538', stroke: '#8a1a12', glow: 'rgba(224, 69, 56, 0.55)' },
};
