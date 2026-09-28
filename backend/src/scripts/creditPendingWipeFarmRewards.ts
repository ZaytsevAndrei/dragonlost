/**
 * Доначисление наград фарма, которые не были выданы (credited = 0).
 * Старые циклы (prize_amount > 0) доначисляются монетами на баланс — как и было
 * обещано до перехода на предметные награды. Новые циклы (prize_amount = 0) —
 * случайными призами нужных качеств в инвентарь сайта.
 * backend: npx ts-node src/scripts/creditPendingWipeFarmRewards.ts
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { RowDataPacket } from 'mysql2';
import { webPool } from '../config/database';
import {
  creditFarmPrizeMoneyForLeader,
  farmRewardRaritiesForRank,
  grantFarmRewardsForLeader,
  insertFarmRewardItems,
  parseFarmRewardRarities,
} from '../services/wipeFarmSummary';
import { formatCoinsWithLabel } from '../constants/currency';

interface PendingRewardRow extends RowDataPacket {
  id: number;
  wipe_cycle_started_at: Date;
  rank: number;
  steamid: string;
  player_name: string;
  rating_score: number;
  prize_amount: number;
  reward_rarities: string | null;
}

async function main(): Promise<void> {
  const [rows] = await webPool.query<PendingRewardRow[]>(
    `SELECT id, wipe_cycle_started_at, \`rank\`, steamid, player_name, rating_score, prize_amount, reward_rarities
     FROM wipe_farm_rewards
     WHERE credited = 0
     ORDER BY wipe_cycle_started_at, \`rank\``
  );

  if (rows.length === 0) {
    console.log('Нет записей с credited = 0.');
    return;
  }

  console.log(`Найдено записей для доначисления: ${rows.length}`);

  const connection = await webPool.getConnection();
  try {
    await connection.beginTransaction();

    for (const row of rows) {
      const rank = Number(row.rank);
      const steamid = String(row.steamid);
      const name = String(row.player_name);
      const ratingScore = Number(row.rating_score);

      if (Number(row.prize_amount) > 0) {
        const { creditNote } = await creditFarmPrizeMoneyForLeader(connection, {
          rank,
          steamid,
          name,
          ratingScore,
          prizeAmount: Number(row.prize_amount),
        });

        await connection.query(
          'UPDATE wipe_farm_rewards SET credited = 1, credit_note = ? WHERE id = ?',
          [creditNote, row.id]
        );

        console.log(
          `OK (легаси, монеты): #${row.id} ТОП-${rank} ${name} (${steamid}) +${formatCoinsWithLabel(Number(row.prize_amount))} — ${creditNote}`
        );
        continue;
      }

      const rewardRarities =
        parseFarmRewardRarities(row.reward_rarities).length > 0
          ? parseFarmRewardRarities(row.reward_rarities)
          : farmRewardRaritiesForRank(rank);

      const granted = await grantFarmRewardsForLeader(connection, { steamid, name, rewardRarities });
      if (granted.credited) {
        await insertFarmRewardItems(connection, row.id, granted.rewards);
      }

      await connection.query(
        'UPDATE wipe_farm_rewards SET credited = ?, credit_note = ? WHERE id = ?',
        [granted.credited ? 1 : 0, granted.creditNote, row.id]
      );

      if (granted.credited) {
        const rewardList = granted.rewards
          .map((reward) => (reward.quantity > 1 ? `${reward.prizeName} ×${reward.quantity}` : reward.prizeName))
          .join(', ');
        console.log(`OK (награды): #${row.id} ТОП-${rank} ${name} (${steamid}) — ${rewardList}`);
      } else {
        console.warn(
          `ПРОПУСК: #${row.id} ТОП-${rank} ${name} (${steamid}) — ${granted.creditNote}`
        );
      }
    }

    await connection.commit();
    console.log('Доначисление завершено.');
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
