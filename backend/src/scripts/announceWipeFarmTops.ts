/**
 * Ручной запуск итогов фарма перед вайпом (Discord).
 * backend: npx ts-node src/scripts/announceWipeFarmTops.ts
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { announceWipeFarmTops, computeWipeFarmRatingTop, formatWipeFarmRatingDiscordMessage } from '../services/wipeFarmSummary';

async function main(): Promise<void> {
  const tops = await computeWipeFarmRatingTop();
  if (!tops) {
    console.error('Нет снимка вайпа (stats_wipe_baselines).');
    process.exit(1);
  }
  console.log(formatWipeFarmRatingDiscordMessage(tops));
  console.log('---');
  await announceWipeFarmTops();
  console.log('Отправлено в Discord (если задан DISCORD_ADMIN_WEBHOOK_URL).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
