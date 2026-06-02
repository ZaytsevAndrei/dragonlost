/**
 * Одноразовый снимок статистики для текущего вайпа.
 * Запуск из backend: npx ts-node src/scripts/snapshotWipeStats.ts
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import {
  snapshotWipeBaselines,
  fetchLatestClosedMapVoteSessionId,
} from '../services/statsWipeService';

async function main(): Promise<void> {
  const sessionId = await fetchLatestClosedMapVoteSessionId();
  const result = await snapshotWipeBaselines(sessionId);
  console.log(
    `OK: снимок для ${result.playersCount} игроков, wipedAt=${result.wipedAt.toISOString()}, session=${sessionId}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
