/**
 * Установить wiped_at в stats_wipe_meta (настенное время МСК).
 * Пример: npx ts-node src/scripts/setWipeTimeMsk.ts 2026-06-02 14:57
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { webPool } from '../config/database';
import { parseMysqlDatetimeMsk } from '../utils/mskDateTime';

async function main(): Promise<void> {
  const datePart = process.argv[2];
  const timePart = process.argv[3] || '00:00';
  if (!datePart) {
    console.error('Usage: npx ts-node src/scripts/setWipeTimeMsk.ts YYYY-MM-DD [HH:mm]');
    process.exit(1);
  }

  const mysqlDatetime = `${datePart} ${timePart.length === 5 ? `${timePart}:00` : timePart}`;
  const parsed = parseMysqlDatetimeMsk(mysqlDatetime);
  if (!parsed) {
    console.error('Invalid date/time:', mysqlDatetime);
    process.exit(1);
  }

  const [result] = await webPool.query(
    'UPDATE stats_wipe_meta SET wiped_at = ? WHERE id = 1',
    [mysqlDatetime]
  );
  const affected = (result as { affectedRows?: number }).affectedRows ?? 0;
  if (affected === 0) {
    console.warn('No row updated — проверьте, что stats_wipe_meta.id = 1 существует');
  } else {
    console.log(`OK: wiped_at = ${mysqlDatetime} (МСК), ISO=${parsed.toISOString()}`);
  }
  await webPool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
