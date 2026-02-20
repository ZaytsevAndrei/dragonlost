import { Router } from 'express';
import { webPool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { isAuthenticated, isAdmin } from '../middleware/auth';

const router = Router();

interface VoteSessionRow extends RowDataPacket {
  id: number;
  title: string;
  starts_at: Date;
  ends_at: Date;
  status: string;
  winner_option_id: number | null;
  created_by: string;
  created_at: Date;
}

interface VoteOptionRow extends RowDataPacket {
  id: number;
  session_id: number;
  map_name: string;
  map_seed: number | null;
  map_size: number | null;
  image_url: string | null;
  description: string | null;
  vote_count: number;
}

interface UserVoteRow extends RowDataPacket {
  option_id: number;
}

// ─── Публичные эндпоинты ───

/**
 * GET /api/map-vote/active — текущая активная сессия голосования
 * с вариантами карт и количеством голосов.
 */
router.get('/active', async (req, res) => {
  try {
    const [sessions] = await webPool.query<VoteSessionRow[]>(
      `SELECT * FROM map_vote_sessions
       WHERE status = 'active' AND ends_at > UTC_TIMESTAMP()
       ORDER BY ends_at ASC LIMIT 1`
    );

    if (sessions.length === 0) {
      return res.json({ session: null });
    }

    const session = sessions[0];

    const [options] = await webPool.query<VoteOptionRow[]>(
      `SELECT o.*, COUNT(v.id) AS vote_count
       FROM map_vote_options o
       LEFT JOIN map_votes v ON v.option_id = o.id
       WHERE o.session_id = ?
       GROUP BY o.id
       ORDER BY vote_count DESC, o.id ASC`,
      [session.id]
    );

    let userVote: number | null = null;
    if (req.isAuthenticated()) {
      const steamid = (req.user as any).steamid;
      const [votes] = await webPool.query<UserVoteRow[]>(
        'SELECT option_id FROM map_votes WHERE session_id = ? AND steamid = ?',
        [session.id, steamid]
      );
      if (votes.length > 0) {
        userVote = votes[0].option_id;
      }
    }

    const totalVotes = options.reduce((sum, o) => sum + Number(o.vote_count), 0);

    res.json({
      session: {
        id: session.id,
        title: session.title,
        starts_at: session.starts_at,
        ends_at: session.ends_at,
        status: session.status,
        total_votes: totalVotes,
      },
      options: options.map((o) => ({
        id: o.id,
        map_name: o.map_name,
        map_seed: o.map_seed,
        map_size: o.map_size,
        image_url: o.image_url,
        description: o.description,
        vote_count: Number(o.vote_count),
        percentage: totalVotes > 0 ? Math.round((Number(o.vote_count) / totalVotes) * 100) : 0,
      })),
      user_vote: userVote,
    });
  } catch (error) {
    console.error('Error fetching active map vote:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Ошибка при загрузке голосования' });
  }
});

/**
 * GET /api/map-vote/latest-result — результат последнего завершённого голосования.
 */
router.get('/latest-result', async (req, res) => {
  try {
    const [sessions] = await webPool.query<VoteSessionRow[]>(
      `SELECT * FROM map_vote_sessions
       WHERE status = 'closed'
       ORDER BY ends_at DESC LIMIT 1`
    );

    if (sessions.length === 0) {
      return res.json({ session: null });
    }

    const session = sessions[0];

    const [options] = await webPool.query<VoteOptionRow[]>(
      `SELECT o.*, COUNT(v.id) AS vote_count
       FROM map_vote_options o
       LEFT JOIN map_votes v ON v.option_id = o.id
       WHERE o.session_id = ?
       GROUP BY o.id
       ORDER BY vote_count DESC`,
      [session.id]
    );

    const totalVotes = options.reduce((sum, o) => sum + Number(o.vote_count), 0);

    res.json({
      session: {
        id: session.id,
        title: session.title,
        ends_at: session.ends_at,
        status: session.status,
        winner_option_id: session.winner_option_id,
        total_votes: totalVotes,
      },
      options: options.map((o) => ({
        id: o.id,
        map_name: o.map_name,
        map_seed: o.map_seed,
        map_size: o.map_size,
        image_url: o.image_url,
        description: o.description,
        vote_count: Number(o.vote_count),
        percentage: totalVotes > 0 ? Math.round((Number(o.vote_count) / totalVotes) * 100) : 0,
        is_winner: o.id === session.winner_option_id,
      })),
    });
  } catch (error) {
    console.error('Error fetching latest vote result:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Ошибка при загрузке результатов' });
  }
});

// ─── Голосование (авторизованные пользователи) ───

/**
 * POST /api/map-vote/vote — проголосовать за вариант карты.
 * Повторное голосование меняет выбор (upsert).
 */
router.post('/vote', isAuthenticated, async (req, res) => {
  const { option_id } = req.body;
  if (!option_id || typeof option_id !== 'number') {
    return res.status(400).json({ error: 'option_id обязателен' });
  }

  const connection = await webPool.getConnection();
  try {
    const steamid = (req.user as any).steamid;

    await connection.beginTransaction();

    const [options] = await connection.query<(VoteOptionRow & { session_status: string; session_ends_at: Date })[]>(
      `SELECT o.*, s.status AS session_status, s.ends_at AS session_ends_at
       FROM map_vote_options o
       INNER JOIN map_vote_sessions s ON s.id = o.session_id
       WHERE o.id = ?
       FOR UPDATE`,
      [option_id]
    );

    if (options.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Вариант карты не найден' });
    }

    const option = options[0];
    if (option.session_status !== 'active') {
      await connection.rollback();
      return res.status(400).json({ error: 'Голосование уже завершено' });
    }

    if (new Date(option.session_ends_at) <= new Date()) {
      await connection.rollback();
      return res.status(400).json({ error: 'Время голосования истекло' });
    }

    await connection.query(
      `INSERT INTO map_votes (session_id, option_id, steamid)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE option_id = VALUES(option_id), voted_at = UTC_TIMESTAMP()`,
      [option.session_id, option_id, steamid]
    );

    await connection.commit();

    res.json({ success: true, option_id });
  } catch (error) {
    await connection.rollback();
    console.error('Error voting:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Ошибка при голосовании' });
  } finally {
    connection.release();
  }
});

// ─── Админские эндпоинты ───

/**
 * GET /api/map-vote/sessions — все сессии голосования (для админ-панели).
 */
router.get('/sessions', isAdmin, async (req, res) => {
  try {
    const [sessions] = await webPool.query<VoteSessionRow[]>(
      'SELECT * FROM map_vote_sessions ORDER BY created_at DESC LIMIT 20'
    );

    const result = [];
    for (const s of sessions) {
      const [options] = await webPool.query<VoteOptionRow[]>(
        `SELECT o.*, COUNT(v.id) AS vote_count
         FROM map_vote_options o
         LEFT JOIN map_votes v ON v.option_id = o.id
         WHERE o.session_id = ?
         GROUP BY o.id
         ORDER BY vote_count DESC`,
        [s.id]
      );
      result.push({
        ...s,
        options: options.map((o) => ({
          id: o.id,
          map_name: o.map_name,
          map_seed: o.map_seed,
          map_size: o.map_size,
          image_url: o.image_url,
          description: o.description,
          vote_count: Number(o.vote_count),
        })),
      });
    }

    res.json({ sessions: result });
  } catch (error) {
    console.error('Error fetching vote sessions:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Ошибка при загрузке сессий' });
  }
});

/**
 * POST /api/map-vote/sessions — создать новую сессию голосования.
 *
 * Body: { title, starts_at?, ends_at, options: [{ map_name, map_seed?, map_size?, image_url?, description? }] }
 */
router.post('/sessions', isAdmin, async (req, res) => {
  const { title, starts_at, ends_at, options } = req.body;

  if (!ends_at || !options || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'Необходимо указать ends_at и минимум 2 варианта карт' });
  }

  const connection = await webPool.getConnection();
  try {
    const steamid = (req.user as any).steamid;

    await connection.beginTransaction();

    const [sessionResult] = await connection.query<ResultSetHeader>(
      `INSERT INTO map_vote_sessions (title, starts_at, ends_at, created_by)
       VALUES (?, COALESCE(?, UTC_TIMESTAMP()), ?, ?)`,
      [title || 'Голосование за карту', starts_at || null, ends_at, steamid]
    );

    const sessionId = sessionResult.insertId;

    for (const opt of options) {
      await connection.query<ResultSetHeader>(
        `INSERT INTO map_vote_options (session_id, map_name, map_seed, map_size, image_url, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [sessionId, opt.map_name, opt.map_seed || null, opt.map_size || null, opt.image_url || null, opt.description || null]
      );
    }

    await connection.commit();

    res.json({ success: true, session_id: sessionId });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating vote session:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Ошибка при создании голосования' });
  } finally {
    connection.release();
  }
});

/**
 * PUT /api/map-vote/sessions/:id/close — закрыть голосование и выбрать победителя.
 *
 * Body: { winner_option_id? } — если не указан, выбирается вариант с максимумом голосов.
 */
router.put('/sessions/:id/close', isAdmin, async (req, res) => {
  const sessionId = parseInt(req.params.id, 10);
  const { winner_option_id } = req.body;

  const connection = await webPool.getConnection();
  try {
    await connection.beginTransaction();

    const [sessions] = await connection.query<VoteSessionRow[]>(
      'SELECT * FROM map_vote_sessions WHERE id = ? FOR UPDATE',
      [sessionId]
    );

    if (sessions.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Сессия не найдена' });
    }

    if (sessions[0].status !== 'active') {
      await connection.rollback();
      return res.status(400).json({ error: 'Сессия уже закрыта' });
    }

    let winnerId = winner_option_id;
    if (!winnerId) {
      const [topOption] = await connection.query<(VoteOptionRow & { vote_count: number })[]>(
        `SELECT o.id, COUNT(v.id) AS vote_count
         FROM map_vote_options o
         LEFT JOIN map_votes v ON v.option_id = o.id
         WHERE o.session_id = ?
         GROUP BY o.id
         ORDER BY vote_count DESC
         LIMIT 1`,
        [sessionId]
      );
      winnerId = topOption.length > 0 ? topOption[0].id : null;
    }

    await connection.query(
      `UPDATE map_vote_sessions SET status = 'closed', winner_option_id = ? WHERE id = ?`,
      [winnerId, sessionId]
    );

    await connection.commit();

    res.json({ success: true, winner_option_id: winnerId });
  } catch (error) {
    await connection.rollback();
    console.error('Error closing vote session:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Ошибка при закрытии голосования' });
  } finally {
    connection.release();
  }
});

/**
 * DELETE /api/map-vote/sessions/:id — отменить голосование.
 */
router.delete('/sessions/:id', isAdmin, async (req, res) => {
  const sessionId = parseInt(req.params.id, 10);
  try {
    await webPool.query(
      `UPDATE map_vote_sessions SET status = 'cancelled' WHERE id = ? AND status = 'active'`,
      [sessionId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error cancelling vote session:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Ошибка при отмене голосования' });
  }
});

export default router;
