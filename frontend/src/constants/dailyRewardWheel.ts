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

export function wheelSpinDelta(currentRotation: number, sectorIndex: number, extraSpins = 6): number {
  const currentMod = ((currentRotation % 360) + 360) % 360;
  const targetMod = sectorIndex * WHEEL_DEGREES_PER_SECTOR;
  let delta = (targetMod - currentMod + 360) % 360;
  if (delta < 0.5) delta = 360;
  return extraSpins * 360 + delta;
}

/** Цвета сегментов как на колесе Rust (Bandit Camp). */
export const WHEEL_TIER_COLORS: Record<DailyRewardWheelAmount, { fill: string; stroke: string }> = {
  10: { fill: '#e8c84a', stroke: '#9a7a18' },
  30: { fill: '#5da34e', stroke: '#2f6b28' },
  50: { fill: '#4a7eb8', stroke: '#2a5080' },
  100: { fill: '#9b5fbf', stroke: '#5f3880' },
  200: { fill: '#d63830', stroke: '#8a221c' },
};
