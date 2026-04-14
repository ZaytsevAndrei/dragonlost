import cron from 'node-cron';
import { webPool } from '../config/database';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { generateRandomMaps } from './rustmapsApi';
import { isGameServerWipeConfigured, runGameServerWipeFromLatestVote } from './gameServerPanel';

const MSK_TZ = 'Europe/Moscow';

function isAutoVoteScheduleDisabled(): boolean {
  return String(process.env.MAP_VOTE_AUTO_SCHEDULE || 'true').toLowerCase() === 'false';
}

/** Четверг 18:00 МСК → пятница 15:00 МСК (Россия без DST — 21 ч). */
function voteEndsAtAfterThursdayStartMsk(start: Date): Date {
  return new Date(start.getTime() + 21 * 60 * 60 * 1000);
}

function toMysqlDatetime(iso: Date): string {
  return iso.toISOString().slice(0, 19).replace('T', ' ');
}

interface ActiveSessionRow extends RowDataPacket {
  id: number;
  title: string;
  ends_at: Date;
  total_votes: number;
}

interface TopOptionRow extends RowDataPacket {
  id: number;
  map_name: string;
  map_seed: number | null;
  map_size: number | null;
  description: string | null;
  vote_count: number;
}

/**
 * Отправляет уведомление в Discord через webhook.
 * Переменная окружения DISCORD_ADMIN_WEBHOOK_URL должна содержать URL вебхука.
 */
async function sendDiscordNotification(message: string, embeds?: object[]): Promise<void> {
  const webhookUrl = process.env.DISCORD_ADMIN_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('⚠️ [MapVote] DISCORD_ADMIN_WEBHOOK_URL не задан — уведомление пропущено');
    return;
  }

  try {
    const body: Record<string, unknown> = { content: message };
    if (embeds) body.embeds = embeds;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(`[MapVote] Discord webhook вернул ${response.status}: ${await response.text()}`);
    }
  } catch (err) {
    console.error('[MapVote] Ошибка отправки Discord webhook:', err instanceof Error ? err.message : err);
  }
}

/**
 * Проверяет наличие активного голосования и отправляет
 * уведомление администратору о необходимости выбрать победившую карту.
 */
async function checkAndNotifyAdmin(): Promise<void> {
  try {
    const [sessions] = await webPool.query<ActiveSessionRow[]>(
      `SELECT s.id, s.title, s.ends_at,
              (SELECT COUNT(*) FROM map_votes v WHERE v.session_id = s.id) AS total_votes
       FROM map_vote_sessions s
       WHERE s.status = 'active'
       ORDER BY s.ends_at ASC
       LIMIT 1`
    );

    if (sessions.length === 0) {
      await sendDiscordNotification(
        '⚠️ **Напоминание**\n' +
        'Через час (в пятницу в 15:00 МСК) закрывается голосование за карту, но активной сессии нет.\n' +
        'Создайте голосование вручную или проверьте MAP_VOTE_AUTO_SCHEDULE и RUSTMAPS_API_KEY.'
      );
      return;
    }

    const session = sessions[0];

    const [topOptions] = await webPool.query<TopOptionRow[]>(
      `SELECT o.id, o.map_name, o.map_seed, o.map_size, o.description, COUNT(v.id) AS vote_count
       FROM map_vote_options o
       LEFT JOIN map_votes v ON v.option_id = o.id
       WHERE o.session_id = ?
       GROUP BY o.id
       ORDER BY vote_count DESC
       LIMIT 5`,
      [session.id]
    );

    const optionsText = topOptions
      .map((o, i) => {
        const seedSize = o.map_seed ? ` (seed: \`${o.map_seed}\`, size: \`${o.map_size}\`)` : '';
        return `${i + 1}. **${o.map_name}**${seedSize} — ${o.vote_count} голосов`;
      })
      .join('\n');

    await sendDiscordNotification(
      '🗳️ **Напоминание: скоро закроется голосование**\n' +
      `До автозакрытия в пятницу в 15:00 МСК остался примерно час.\n\n` +
      `**${session.title}** (всего голосов: ${session.total_votes})\n\n` +
      `${optionsText}\n\n` +
      'При необходимости закройте голосование вручную в админ-панели до 15:00 МСК.'
    );

    console.log(`📬 [MapVote] Уведомление отправлено (сессия #${session.id}, голосов: ${session.total_votes})`);
  } catch (error) {
    console.error('[MapVote] Ошибка при проверке/уведомлении:', error instanceof Error ? error.message : error);
  }
}

/**
 * Каждый четверг в 18:00 МСК: создаёт сессию с 4 картами (как в админке по умолчанию),
 * ends_at — пятница 15:00 МСК. Не создаёт новую, если уже есть активная сессия.
 */
async function autoStartWeeklyMapVote(): Promise<void> {
  if (isAutoVoteScheduleDisabled()) return;

  try {
    await closeExpiredSessions();

    const [active] = await webPool.query<RowDataPacket[]>(
      `SELECT id FROM map_vote_sessions WHERE status = 'active' LIMIT 1`
    );
    if (active.length > 0) {
      console.log(`📅 [MapVote] Автостарт пропущен — уже есть активная сессия #${active[0].id}`);
      return;
    }

    const sizeA = parseInt(process.env.MAP_VOTE_AUTO_SIZE_A || '3750', 10);
    const sizeB = parseInt(process.env.MAP_VOTE_AUTO_SIZE_B || '4250', 10);
    const countA = parseInt(process.env.MAP_VOTE_AUTO_COUNT_A || '5', 10);
    const countB = parseInt(process.env.MAP_VOTE_AUTO_COUNT_B || '5', 10);

    const mapsA = await generateRandomMaps(sizeA, Math.min(10, Math.max(1, countA)));
    const mapsB = await generateRandomMaps(sizeB, Math.min(10, Math.max(1, countB)));
    const maps = [...mapsA, ...mapsB].filter((m) => m.ready && m.seed > 0 && m.size > 0);

    if (maps.length < 2) {
      await sendDiscordNotification(
        '❌ **Автостарт голосования не удался**\n' +
          `RustMaps вернул мало готовых карт (${maps.length}). Проверьте RUSTMAPS_API_KEY и лимиты API.`
      );
      return;
    }

    const startsAt = new Date();
    const endsAt = voteEndsAtAfterThursdayStartMsk(startsAt);
    const title = process.env.MAP_VOTE_AUTO_TITLE || 'Голосование за карту';
    const createdBy = process.env.MAP_VOTE_AUTO_CREATED_BY || 'system';

    const connection = await webPool.getConnection();
    try {
      await connection.beginTransaction();

      const [sessionResult] = await connection.query<ResultSetHeader>(
        `INSERT INTO map_vote_sessions (title, starts_at, ends_at, created_by)
         VALUES (?, ?, ?, ?)`,
        [title, toMysqlDatetime(startsAt), toMysqlDatetime(endsAt), createdBy]
      );
      const sessionId = sessionResult.insertId;

      for (const m of maps) {
        await connection.query<ResultSetHeader>(
          `INSERT INTO map_vote_options (session_id, map_name, map_seed, map_size, image_url, description)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [sessionId, `Seed ${m.seed}`, m.seed, m.size, m.thumbnailUrl || m.imageUrl || null, m.mapPageUrl]
        );
      }

      await connection.commit();
      console.log(`🗳️ [MapVote] Автостарт: сессия #${sessionId}, ends_at=${endsAt.toISOString()}`);

      await sendDiscordNotification(
        `✅ **Открыто голосование за карту** (авто)\n` +
          `Сессия #${sessionId}, вариантов: ${maps.length}. Закрытие: **пятница 15:00 МСК**.`
      );
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('[MapVote] Ошибка автостарта голосования:', error instanceof Error ? error.message : error);
    await sendDiscordNotification(
      `❌ **Автостарт голосования: ошибка**\n\`${error instanceof Error ? error.message : String(error)}\``
    );
  }
}

/**
 * Автоматически закрывает истёкшие сессии голосования
 * (ends_at прошло, но status всё ещё active).
 */
async function closeExpiredSessions(): Promise<void> {
  try {
    const [expired] = await webPool.query<ActiveSessionRow[]>(
      `SELECT id, title FROM map_vote_sessions
       WHERE status = 'active' AND ends_at <= UTC_TIMESTAMP()`
    );

    for (const session of expired) {
      const [topOptions] = await webPool.query<TopOptionRow[]>(
        `SELECT o.id, o.map_name, o.map_seed, o.map_size, o.description, COUNT(v.id) AS vote_count
         FROM map_vote_options o
         LEFT JOIN map_votes v ON v.option_id = o.id
         WHERE o.session_id = ?
         GROUP BY o.id
         ORDER BY vote_count DESC`,
        [session.id]
      );

      const winnerId = topOptions.length > 0 ? topOptions[0].id : null;

      await webPool.query(
        `UPDATE map_vote_sessions SET status = 'closed', winner_option_id = ? WHERE id = ?`,
        [winnerId, session.id]
      );

      console.log(`🗳️ [MapVote] Сессия #${session.id} автоматически закрыта (победитель: ${winnerId})`);

      if (topOptions.length > 0) {
        const winner = topOptions[0];
        const totalVotes = topOptions.reduce((sum, o) => sum + Number(o.vote_count), 0);
        const rustMapsUrl = winner.description?.startsWith('http') ? winner.description : null;

        const resultsText = topOptions
          .map((o, i) => {
            const seedSize = o.map_seed ? ` (seed: \`${o.map_seed}\`, size: \`${o.map_size}\`)` : '';
            const marker = o.id === winnerId ? ' 🏆' : '';
            return `${i + 1}. **${o.map_name}**${seedSize} — ${o.vote_count} голосов${marker}`;
          })
          .join('\n');

        let winnerInfo = `🏆 **Победитель: ${winner.map_name}**`;
        if (winner.map_seed) winnerInfo += `\n📍 Seed: \`${winner.map_seed}\` | Size: \`${winner.map_size}\``;
        if (rustMapsUrl) winnerInfo += `\n🗺️ [Открыть на RustMaps](${rustMapsUrl})`;

        await sendDiscordNotification(
          `✅ **Голосование завершено!**\n\n` +
          `**${session.title}** (всего: ${totalVotes} голосов)\n\n` +
          `${winnerInfo}\n\n` +
          `**Результаты:**\n${resultsText}`
        );
      }
    }
  } catch (error) {
    console.error('[MapVote] Ошибка при закрытии истёкших сессий:', error instanceof Error ? error.message : error);
  }
}

/**
 * Отправляет уведомление в Discord о закрытии голосования.
 * Вызывается из роута при ручном закрытии.
 */
export async function notifyVoteClosed(sessionId: number, winnerId: number | null): Promise<void> {
  try {
    const [sessions] = await webPool.query<ActiveSessionRow[]>(
      'SELECT id, title, ends_at, 0 AS total_votes FROM map_vote_sessions WHERE id = ?',
      [sessionId]
    );
    if (sessions.length === 0) return;
    const session = sessions[0];

    const [options] = await webPool.query<TopOptionRow[]>(
      `SELECT o.id, o.map_name, o.map_seed, o.map_size, o.description, COUNT(v.id) AS vote_count
       FROM map_vote_options o
       LEFT JOIN map_votes v ON v.option_id = o.id
       WHERE o.session_id = ?
       GROUP BY o.id
       ORDER BY vote_count DESC`,
      [sessionId]
    );

    if (options.length === 0) return;

    const totalVotes = options.reduce((sum, o) => sum + Number(o.vote_count), 0);
    const winner = options.find(o => o.id === winnerId) || options[0];
    const rustMapsUrl = winner.description?.startsWith('http') ? winner.description : null;

    const resultsText = options
      .map((o, i) => {
        const seedSize = o.map_seed ? ` (seed: \`${o.map_seed}\`, size: \`${o.map_size}\`)` : '';
        const marker = o.id === winnerId ? ' 🏆' : '';
        return `${i + 1}. **${o.map_name}**${seedSize} — ${o.vote_count} голосов${marker}`;
      })
      .join('\n');

    let winnerInfo = `🏆 **Победитель: ${winner.map_name}**`;
    if (winner.map_seed) winnerInfo += `\n📍 Seed: \`${winner.map_seed}\` | Size: \`${winner.map_size}\``;
    if (rustMapsUrl) winnerInfo += `\n🗺️ [Открыть на RustMaps](${rustMapsUrl})`;

    await sendDiscordNotification(
      `✅ **Голосование завершено!**\n\n` +
      `**${session.title}** (всего: ${totalVotes} голосов)\n\n` +
      `${winnerInfo}\n\n` +
      `**Результаты:**\n${resultsText}`
    );
  } catch (error) {
    console.error('[MapVote] Ошибка уведомления о закрытии:', error instanceof Error ? error.message : error);
  }
}

/** Пятница 17:30 МСК: seed/size победителя → панель (вебхук / Pterodactyl) или RCON (SurvivalHost и др.). */
async function fridayGameServerRestart(): Promise<void> {
  try {
    const r = await runGameServerWipeFromLatestVote();
    if (!r.ok) {
      if (r.reason === 'no_winner') {
        await sendDiscordNotification(
          '⚠️ **Перезапуск сервера (Пт 17:30 МСК)**\n' +
            'Нет закрытого голосования с победителем и полями seed/size — действие пропущено.'
        );
        console.warn('[GameServer] Пт 17:30: нет победителя для seed/size');
      }
      return;
    }
    const modeHint =
      r.mode === 'rcon'
        ? 'RCON (`server.seed` / размер карты) и `quit` для рестарта панелью.'
        : r.mode === 'pterodactyl'
          ? 'Pterodactyl: переменные панели и restart.'
          : 'вебхук.';
    console.log(`🔄 [GameServer] Пт 17:30 МСК: ${r.mode}, seed=${r.seed}, size=${r.size}`);
    await sendDiscordNotification(
      `🔄 **Игровой сервер (вайп по голосованию)**\n` +
        `Канал: **${r.mode}** — ${modeHint}\n` +
        `seed **${r.seed}**, size **${r.size}**.`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[GameServer] Ошибка перезапуска:', msg);
    await sendDiscordNotification(`❌ **Перезапуск сервера (Пт 17:30 МСК)**\n\`${msg}\``);
  }
}

/** Откладывает async-задачу на следующий тик event loop — снижает WARN «missed execution» от node-cron при кратковременной блокировке цикла. */
function runDeferred(fn: () => void | Promise<void>): void {
  setImmediate(() => {
    void Promise.resolve(fn()).catch((err) =>
      console.error('[Cron] Необработанная ошибка задачи:', err instanceof Error ? err.message : err)
    );
  });
}

/** Cron: автостарт голосования (Чт 18:00 МСК), напоминание (Пт 14:00 МСК), автозакрытие по ends_at (~каждые 5 мин). */
export function scheduleMapVoteTasks(): void {
  const tzOpts = { timezone: MSK_TZ };

  // Четверг 18:00 МСК — открытие недельного голосования (конец — пятница 15:00 МСК, см. ends_at)
  cron.schedule(
    '0 18 * * 4',
    () => {
      runDeferred(() => {
        console.log('📅 [MapVote] Чт 18:00 МСК — автостарт голосования');
        return autoStartWeeklyMapVote();
      });
    },
    tzOpts
  );

  // Пятница 14:00 МСК — напоминание за ~1 ч до автозакрытия в 15:00 МСК
  cron.schedule(
    '0 14 * * 5',
    () => {
      runDeferred(() => {
        console.log('🔔 [MapVote] Пт 14:00 МСК — напоминание перед закрытием голосования');
        return checkAndNotifyAdmin();
      });
    },
    tzOpts
  );

  // Каждые ~5 мин, но не в :00 — избегаем одновременного тика с другими задачами на начале часа
  cron.schedule('2,7,12,17,22,27,32,37,42,47,52,57 * * * *', () => {
    runDeferred(closeExpiredSessions);
  });

  if (isGameServerWipeConfigured()) {
    cron.schedule(
      '30 17 * * 5',
      () => {
        runDeferred(() => {
          console.log('🔄 [GameServer] Пт 17:30 МСК — вайп по результату голосования');
          return fridayGameServerRestart();
        });
      },
      tzOpts
    );
  }

  console.log(
    '✅ Cron map-vote: старт Чт 18:00 МСК, конец Пт 15:00 МСК (ends_at + автозакрытие), напоминание Пт 14:00 МСК' +
      (isGameServerWipeConfigured() ? '; перезапуск игры Пт 17:30 МСК' : '')
  );
}
