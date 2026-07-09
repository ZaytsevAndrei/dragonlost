/**
 * Доначисление призов фарма, которые не были зачислены (credited = 0).
 * backend: npx ts-node src/scripts/creditPendingWipeFarmRewards.ts
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { RowDataPacket } from 'mysql2';
import { webPool } from '../config/database';
import { creditFarmPrizeForLeader } from '../services/wipeFarmSummary';
import { formatCoinsWithLabel } from '../constants/currency';

interface PendingRewardRow extends RowDataPacket {
  id: number;
  wipe_cycle_started_at: Date;
  rank: number;
  steamid: string;
  player_name: string;
  rating_score: number;
  prize_amount: number;
}

async function main(): Promise<void> {
  const [rows] = await webPool.query<PendingRewardRow[]>(
    `SELECT id, wipe_cycle_started_at, \`rank\`, steamid, player_name, rating_score, prize_amount
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
      const leader = {
        rank: Number(row.rank),
        steamid: String(row.steamid),
        name: String(row.player_name),
        ratingScore: Number(row.rating_score),
        prizeAmount: Number(row.prize_amount),
      };

      const { creditNote } = await creditFarmPrizeForLeader(connection, leader);

      await connection.query(
        `UPDATE wipe_farm_rewards
         SET credited = 1, credit_note = ?
         WHERE id = ?`,
        [creditNote, row.id]
      );

      console.log(
        `OK: #${row.id} ТОП-${leader.rank} ${leader.name} (${leader.steamid}) +${formatCoinsWithLabel(leader.prizeAmount)} — ${creditNote}`
      );
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
