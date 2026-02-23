import cron from 'node-cron';
import { webPool } from '../config/database';
import { RowDataPacket } from 'mysql2';

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
        '⚠️ **Напоминание о вайпе**\n' +
        'До вайпа в 17:00 остался 1 час, но активного голосования за карту нет!\n' +
        'Создайте голосование или выберите карту вручную.'
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
      '🗳️ **Напоминание: выберите победившую карту!**\n' +
      `До вайпа в 17:00 остался 1 час.\n\n` +
      `**${session.title}** (всего голосов: ${session.total_votes})\n\n` +
      `${optionsText}\n\n` +
      'Закройте голосование и подтвердите выбор карты в админ-панели.'
    );

    console.log(`📬 [MapVote] Уведомление отправлено (сессия #${session.id}, голосов: ${session.total_votes})`);
  } catch (error) {
    console.error('[MapVote] Ошибка при проверке/уведомлении:', error instanceof Error ? error.message : error);
  }
}

/**
 * Автоматически закрывает истёкшие сессии голосования
 * (ends_at прошло, но status всё ещё active).
 */
async function closeExpiredSessions(): Promise<void> {
  try {
    const [expired] = await webPool.query<ActiveSessionRow[]>(
      `SELECT id FROM map_vote_sessions
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
 * Инициализирует cron-задачи для голосования за карты.
 *
 * - Каждую пятницу в 16:00 МСК (13:00 UTC): уведомление админа
 * - Каждые 5 минут: автозакрытие истёкших сессий
 */
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

export function scheduleMapVoteTasks(): void {
  // Пятница 16:00 МСК = 13:00 UTC (cron работает в UTC на сервере)
  // Формат: минута час * * день_недели (5 = пятница)
  cron.schedule('0 13 * * 5', () => {
    console.log('🔔 [MapVote] Пятничная проверка голосования (16:00 МСК)');
    checkAndNotifyAdmin();
  });

  // Автозакрытие истёкших голосований каждые 5 минут
  cron.schedule('*/5 * * * *', () => {
    closeExpiredSessions();
  });

  console.log('✅ Cron: уведомление о карте (Пт 16:00 МСК), автозакрытие каждые 5 мин');
}
