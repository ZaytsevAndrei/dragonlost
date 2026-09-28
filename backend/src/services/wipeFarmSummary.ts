import { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { rustPool, webPool } from '../config/database';
import { formatMysqlDatetimeMsk } from '../utils/mskDateTime';
import {
  getBaselinesForSteamIds,
  getWipeMeta,
  getWipeSinceUnix,
  hasWipeBaselines,
  subtractWipeBaseline,
} from './statsWipeService';
import { ensureWebUser } from './userProvisioning';
import { rollPrizeQuantity, type FortuneWheelRarity } from '../constants/fortuneWheel';
import { upcomingWipeInstants, wipeRestartLabelMsk } from '../utils/wipeSchedule';

const TOP_PLACES = 3;

/**
 * Качества наград за место в ТОП фарма:
 * 1-е — мифическая + легендарная, 2-е — легендарная + эпическая, 3-е — эпическая + редкая.
 */
const REWARD_RARITIES_BY_RANK: ReadonlyArray<readonly [FortuneWheelRarity, FortuneWheelRarity]> = [
  ['mythic', 'legendary'],
  ['legendary', 'epic'],
  ['epic', 'rare'],
];

/** Порядок качеств от высокого к низкому — фолбэк, если пул нужного качества пуст. */
const RARITY_LADDER: readonly FortuneWheelRarity[] = [
  'mythic',
  'legendary',
  'epic',
  'rare',
  'uncommon',
  'common',
];

const RARITY_LABELS_FEM: Record<FortuneWheelRarity, string> = {
  common: 'обычная',
  uncommon: 'необычная',
  rare: 'редкая',
  epic: 'эпическая',
  legendary: 'легендарная',
  mythic: 'мифическая',
};

const FARM_WEIGHTS = {
  sulfurOre: { gatheredKey: 'sulfur.ore', weight: 1 },
  metalOre: { gatheredKey: 'metal.ore', weight: 0.5 },
  stones: { gatheredKey: 'stones', weight: 0.3 },
  wood: { gatheredKey: 'wood', weight: 0.05 },
} as const;

export interface FarmBreakdown {
  sulfurOre: number;
  metalOre: number;
  stones: number;
  wood: number;
}

/** Предмет, выданный как награда за место в ТОП фарма. */
export interface GrantedFarmReward {
  /** Качество из награды за место. */
  rarity: FortuneWheelRarity;
  wheelPrizeId: number;
  prizeName: string;
  /** Фактическое качество приза — ниже запрошенного, если пул был пуст. */
  prizeRarity: FortuneWheelRarity;
  quantity: number;
}

export interface RatedFarmLeader {
  rank: number;
  steamid: string;
  name: string;
  ratingScore: number;
  breakdown: FarmBreakdown;
  rewardRarities: FortuneWheelRarity[];
  rewards: GrantedFarmReward[];
  credited: boolean;
  creditNote: string | null;
}

export interface WipeFarmRatingResult {
  periodStart: Date | null;
  cycleKey: string | null;
  activePlayers: number;
  leaders: RatedFarmLeader[];
  alreadyProcessed: boolean;
}

function parseStatsJson(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  const str = String(raw).trim();
  if (!str) return {};
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function gatheredAmount(stats: Record<string, unknown>, key: string): number {
  const gathered = stats.Gathered as Record<string, unknown> | undefined;
  if (!gathered) return 0;
  const n = Number(gathered[key]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function computeBreakdown(wipeStats: Record<string, unknown>): FarmBreakdown {
  return {
    sulfurOre: gatheredAmount(wipeStats, FARM_WEIGHTS.sulfurOre.gatheredKey),
    metalOre: gatheredAmount(wipeStats, FARM_WEIGHTS.metalOre.gatheredKey),
    stones: gatheredAmount(wipeStats, FARM_WEIGHTS.stones.gatheredKey),
    wood: gatheredAmount(wipeStats, FARM_WEIGHTS.wood.gatheredKey),
  };
}

export function computeRatingScore(breakdown: FarmBreakdown): number {
  return (
    breakdown.sulfurOre * FARM_WEIGHTS.sulfurOre.weight +
    breakdown.metalOre * FARM_WEIGHTS.metalOre.weight +
    breakdown.stones * FARM_WEIGHTS.stones.weight +
    breakdown.wood * FARM_WEIGHTS.wood.weight
  );
}

function formatRating(n: number): string {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPeriodStart(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return 'начала цикла';
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

const MEDALS = ['🥇', '🥈', '🥉'] as const;
const PLACE_LABELS = ['1 место', '2 место', '3 место'] as const;

/** Качества награды за место (1-е — мифическая + легендарная и т.д.). */
export function farmRewardRaritiesForRank(rank: number): FortuneWheelRarity[] {
  return [...(REWARD_RARITIES_BY_RANK[rank - 1] ?? [])];
}

/** Разбирает колонку wipe_farm_rewards.reward_rarities ('mythic+legendary'). */
export function parseFarmRewardRarities(value: unknown): FortuneWheelRarity[] {
  return String(value ?? '')
    .split('+')
    .map((part) => part.trim())
    .filter((part): part is FortuneWheelRarity =>
      (RARITY_LADDER as readonly string[]).includes(part)
    );
}

async function hasRewardsForCycle(cycleKey: string): Promise<boolean> {
  try {
    const [rows] = await webPool.query<RowDataPacket[]>(
      'SELECT id FROM wipe_farm_rewards WHERE wipe_cycle_started_at = ? LIMIT 1',
      [cycleKey]
    );
    return rows.length > 0;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'ER_NO_SUCH_TABLE') return false;
    throw err;
  }
}

/** Считает ТОП-3 по суммарному рейтингу фарма за текущий вайп. */
export async function computeWipeFarmRatingTop(): Promise<WipeFarmRatingResult | null> {
  const hasBaselines = await hasWipeBaselines();
  if (!hasBaselines) return null;

  const wipeSinceUnix = await getWipeSinceUnix();
  const { wipedAt: periodStart } = await getWipeMeta();
  const cycleKey = periodStart ? formatMysqlDatetimeMsk(periodStart) : null;
  const alreadyProcessed = cycleKey ? await hasRewardsForCycle(cycleKey) : false;

  const query =
    wipeSinceUnix != null
      ? 'SELECT steamid, name, StatisticsDB FROM PlayerDatabase WHERE `Last Seen` >= ?'
      : 'SELECT steamid, name, StatisticsDB FROM PlayerDatabase';
  const params = wipeSinceUnix != null ? [wipeSinceUnix] : [];

  const [rows] = await rustPool.query<RowDataPacket[]>(query, params);
  if (rows.length === 0) {
    return { periodStart, cycleKey, activePlayers: 0, leaders: [], alreadyProcessed };
  }

  const steamids = rows.map((r) => String(r.steamid || '').trim()).filter(Boolean);
  const baselines = await getBaselinesForSteamIds(steamids);

  type PlayerRated = {
    steamid: string;
    name: string;
    ratingScore: number;
    breakdown: FarmBreakdown;
  };

  const players: PlayerRated[] = [];

  for (const row of rows) {
    const steamid = String(row.steamid || '').trim();
    if (!steamid) continue;

    const current = parseStatsJson(row.StatisticsDB);
    const baseline = baselines.get(steamid) ?? {};
    const wipeStats = subtractWipeBaseline(current, baseline);
    const breakdown = computeBreakdown(wipeStats);
    const ratingScore = computeRatingScore(breakdown);
    if (ratingScore <= 0) continue;

    const name = String(row.name || 'Неизвестный игрок').trim() || 'Неизвестный игрок';
    players.push({ steamid, name, ratingScore, breakdown });
  }

  const sorted = [...players].sort((a, b) => {
    const diff = b.ratingScore - a.ratingScore;
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, 'ru');
  });

  const leaders: RatedFarmLeader[] = sorted.slice(0, TOP_PLACES).map((p, i) => ({
    rank: i + 1,
    steamid: p.steamid,
    name: p.name,
    ratingScore: p.ratingScore,
    breakdown: p.breakdown,
    rewardRarities: farmRewardRaritiesForRank(i + 1),
    rewards: [],
    credited: false,
    creditNote: null,
  }));

  return {
    periodStart,
    cycleKey,
    activePlayers: players.length,
    leaders,
    alreadyProcessed,
  };
}

interface RewardPrizeRow extends RowDataPacket {
  id: number;
  name: string;
  rarity: FortuneWheelRarity;
  quantity: number;
  quantity_max: number | null;
}

/** Случайный активный приз колеса нужного качества; если пул пуст — ближайший более низкий. */
async function rollRewardPrize(
  connection: PoolConnection,
  rarity: FortuneWheelRarity
): Promise<RewardPrizeRow | null> {
  for (let i = RARITY_LADDER.indexOf(rarity); i < RARITY_LADDER.length; i += 1) {
    const [rows] = await connection.query<RewardPrizeRow[]>(
      `SELECT id, name, rarity, quantity, quantity_max
       FROM wheel_prizes
       WHERE is_active = 1 AND rarity = ?
       ORDER BY RAND()
       LIMIT 1`,
      [RARITY_LADDER[i]]
    );
    if (rows.length > 0) return rows[0];
  }
  return null;
}

const CREDIT_NOTE_EXISTING = 'награды добавлены в инвентарь сайта — забрать: профиль → Инвентарь';
const CREDIT_NOTE_PROVISIONED =
  'награды в инвентаре — войдите через Steam на dragonlost.ru, чтобы забрать их в игре';

/** Создаёт профиль при необходимости и выдаёт случайные награды за место в инвентарь. */
export async function grantFarmRewardsForLeader(
  connection: PoolConnection,
  leader: Pick<RatedFarmLeader, 'steamid' | 'name' | 'rewardRarities'>
): Promise<{ credited: boolean; creditNote: string | null; rewards: GrantedFarmReward[] }> {
  const { created } = await ensureWebUser(connection, {
    steamid: leader.steamid,
    username: leader.name,
  });

  const rewards: GrantedFarmReward[] = [];
  for (const rarity of leader.rewardRarities) {
    const prize = await rollRewardPrize(connection, rarity);
    if (!prize) continue;

    const quantity = rollPrizeQuantity(prize);
    await connection.query(
      `INSERT INTO player_inventory (steamid, shop_item_id, wheel_prize_id, quantity, status)
       VALUES (?, NULL, ?, ?, 'pending')`,
      [leader.steamid, prize.id, quantity]
    );
    rewards.push({
      rarity,
      wheelPrizeId: prize.id,
      prizeName: prize.name,
      prizeRarity: prize.rarity,
      quantity,
    });
  }

  if (rewards.length === 0) {
    return { credited: false, creditNote: 'нет активных призов — награды не выданы', rewards: [] };
  }

  return {
    credited: true,
    creditNote: created ? CREDIT_NOTE_PROVISIONED : CREDIT_NOTE_EXISTING,
    rewards,
  };
}

/** Записывает выданные предметы награды (для истории и повторной выдачи). */
export async function insertFarmRewardItems(
  connection: PoolConnection,
  rewardId: number,
  rewards: GrantedFarmReward[]
): Promise<void> {
  for (const reward of rewards) {
    await connection.query(
      `INSERT INTO wipe_farm_reward_items
         (reward_id, rarity_requested, wheel_prize_id, prize_name, prize_rarity, quantity)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [rewardId, reward.rarity, reward.wheelPrizeId, reward.prizeName, reward.prizeRarity, reward.quantity]
    );
  }
}

export interface LegacyMoneyPrizeLeader {
  rank: number;
  steamid: string;
  name: string;
  ratingScore: number;
  prizeAmount: number;
}

/**
 * Легаси: денежный приз за ТОП фарма. Только для старых циклов (prize_amount > 0),
 * начисленных до перехода на предметные награды — их не отбираем и доначисляем как было.
 */
export async function creditFarmPrizeMoneyForLeader(
  connection: PoolConnection,
  leader: LegacyMoneyPrizeLeader
): Promise<{ creditNote: string }> {
  const { created } = await ensureWebUser(connection, {
    steamid: leader.steamid,
    username: leader.name,
  });

  const amount = leader.prizeAmount;
  await connection.query(
    `INSERT INTO player_balance (steamid, balance, total_earned, total_spent)
     VALUES (?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE balance = balance + ?, total_earned = total_earned + ?`,
    [leader.steamid, amount, amount, amount, amount]
  );
  await connection.query(
    `INSERT INTO transactions (steamid, type, amount, description)
     VALUES (?, 'earn', ?, ?)`,
    [
      leader.steamid,
      amount,
      `ТОП-${leader.rank} фарма перед вайпом (рейтинг ${formatRating(leader.ratingScore)})`,
    ]
  );

  return {
    creditNote: created
      ? 'начислено на баланс — войдите через Steam на dragonlost.ru, чтобы потратить'
      : 'начислено на баланс сайта',
  };
}

/** Выдаёт предметные награды ТОП-3 (один раз за цикл вайпа). */
export async function payWipeFarmPrizes(result: WipeFarmRatingResult): Promise<WipeFarmRatingResult> {
  if (result.alreadyProcessed || !result.cycleKey || result.leaders.length === 0) {
    return result;
  }

  const connection = await webPool.getConnection();
  try {
    await connection.beginTransaction();

    const paidLeaders: RatedFarmLeader[] = [];

    for (const leader of result.leaders) {
      const granted = await grantFarmRewardsForLeader(connection, leader);
      paidLeaders.push({ ...leader, ...granted });
    }

    for (const leader of paidLeaders) {
      const [rewardRow] = await connection.query<ResultSetHeader>(
        `INSERT INTO wipe_farm_rewards
           (wipe_cycle_started_at, \`rank\`, steamid, player_name, rating_score,
            sulfur_ore, metal_ore, stones, wood, prize_amount, reward_rarities, credited, credit_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [
          result.cycleKey,
          leader.rank,
          leader.steamid,
          leader.name,
          leader.ratingScore,
          leader.breakdown.sulfurOre,
          leader.breakdown.metalOre,
          leader.breakdown.stones,
          leader.breakdown.wood,
          leader.rewardRarities.join('+'),
          leader.credited ? 1 : 0,
          leader.creditNote,
        ]
      );

      await insertFarmRewardItems(connection, rewardRow.insertId, leader.rewards);
    }

    await connection.commit();
    return { ...result, leaders: paidLeaders, alreadyProcessed: true };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

function formatGrantedReward(reward: GrantedFarmReward): string {
  const label = reward.quantity > 1 ? `${reward.prizeName} ×${reward.quantity}` : reward.prizeName;
  return `**${label}** (${RARITY_LABELS_FEM[reward.prizeRarity]} награда)`;
}

export function formatWipeFarmRatingDiscordMessage(result: WipeFarmRatingResult): string {
  const nextWipe = upcomingWipeInstants(new Date(), 1)[0];
  const hourLabel = nextWipe ? `${wipeRestartLabelMsk(nextWipe)} МСК` : 'по расписанию';

  const lines: string[] = [
    '🏆 **Итоги фарма перед вайпом** (за ~30 мин)',
    'Рейтинг: **серная руда ×1** + **железная руда ×0,5** + **камень ×0,3** + **дерево ×0,05**.',
    `Период: с **${formatPeriodStart(result.periodStart)}** до вайпа (~**${hourLabel}**).`,
    'Награды за места: 1-е — мифическая + легендарная, 2-е — легендарная + эпическая, 3-е — эпическая + редкая.',
    '',
  ];

  if (result.leaders.length === 0) {
    lines.push('За этот цикл нет игроков с ненулевым рейтингом фарма.');
  } else {
    for (const leader of result.leaders) {
      const medal = MEDALS[leader.rank - 1] ?? `${leader.rank}.`;
      const place = PLACE_LABELS[leader.rank - 1] ?? `${leader.rank} место`;
      lines.push(
        `${medal} **${place}** — **${leader.name}** (рейтинг **${formatRating(leader.ratingScore)}**)`
      );
      if (leader.rewards.length > 0) {
        lines.push(`↳ Награды: ${leader.rewards.map(formatGrantedReward).join(', ')}`);
      }
      if (leader.creditNote) {
        lines.push(`↳ ${leader.creditNote}`);
      }
    }
  }

  lines.push('', 'Через ~30 минут — вайп сервера.');
  return lines.join('\n').trim();
}

async function sendDiscordNotification(message: string): Promise<void> {
  const webhookUrl = process.env.DISCORD_ADMIN_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('⚠️ [WipeFarm] DISCORD_ADMIN_WEBHOOK_URL не задан — итоги фарма не отправлены');
    return;
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message }),
  });

  if (!response.ok) {
    console.error(`[WipeFarm] Discord webhook вернул ${response.status}: ${await response.text()}`);
  }
}

/** Подводит итоги ТОП фарма, выдаёт награды и отправляет в Discord. */
export async function announceWipeFarmTops(): Promise<void> {
  const computed = await computeWipeFarmRatingTop();
  if (!computed) {
    await sendDiscordNotification(
      '⚠️ **Итоги фарма (за ~30 мин до вайпа)**\n' +
        'Нет снимка статистики вайпа — подведение итогов пропущено.\n' +
        'Проверьте таблицы `stats_wipe_*` или выполните снимок вручную.'
    );
    console.warn('[WipeFarm] Нет baselines — итоги пропущены');
    return;
  }

  if (computed.alreadyProcessed) {
    console.log('[WipeFarm] Награды за этот цикл уже выданы — повтор пропущен');
    return;
  }

  const result = await payWipeFarmPrizes(computed);
  const message = formatWipeFarmRatingDiscordMessage(result);
  await sendDiscordNotification(message);

  const topName = result.leaders[0]?.name ?? '—';
  console.log(
    `[WipeFarm] Итоги отправлены: ${result.activePlayers} игроков с рейтингом, ТОП-1: ${topName}`
  );
}

export function isWipeFarmSummaryCronDisabled(): boolean {
  return String(process.env.WIPE_FARM_SUMMARY_CRON || 'true').toLowerCase() === 'false';
}
