/**
 * 25 секторов — порядок как на Big Wheel в Rust (Bandit Camp).
 * Индекс 0 — сектор под указателем (жёлтый ×1).
 */
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

export function rollDailyRewardWheel(): { sectorIndex: number; amount: DailyRewardWheelAmount } {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  const sectorIndex = arr[0] % DAILY_REWARD_WHEEL_SECTORS.length;
  return {
    sectorIndex,
    amount: DAILY_REWARD_WHEEL_SECTORS[sectorIndex],
  };
}
