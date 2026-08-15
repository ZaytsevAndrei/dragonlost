import { Router, Request, Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { webPool } from '../config/database';
import { isRustCategoryId } from '../constants/rustCategories';
import { isAuthenticated } from '../middleware/auth';

const router = Router();

const MAX_ITEMS = 30;
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 2000;
const MAX_SHORTNAME = 128;
const MYSQL_DUP_FIELD = 1060;
const MYSQL_DUP_KEYNAME = 1061;

function mysqlErrno(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('errno' in error)) return null;
  const errno = Number((error as { errno: unknown }).errno);
  return Number.isFinite(errno) ? errno : null;
}

let metaColumnsPromise: Promise<void> | null = null;

async function ensureFilterMetaColumns(): Promise<void> {
  if (!metaColumnsPromise) {
    metaColumnsPromise = (async () => {
      const statements = [
        `ALTER TABLE conveyor_filters ADD COLUMN cover_shortname VARCHAR(128) NULL`,
        `ALTER TABLE conveyor_filters ADD COLUMN category VARCHAR(32) NULL`,
        `ALTER TABLE conveyor_filters ADD INDEX idx_category (category)`,
      ];
      for (const sql of statements) {
        try {
          await webPool.query(sql);
        } catch (error) {
          const errno = mysqlErrno(error);
          if (errno === MYSQL_DUP_FIELD || errno === MYSQL_DUP_KEYNAME) continue;
          console.error('ensureFilterMetaColumns:', error instanceof Error ? error.message : error);
          return;
        }
      }
    })();
  }
  return metaColumnsPromise;
}

interface ConveyorFilterItem {
  TargetCategory: number | null;
  MaxAmountInOutput: number;
  BufferAmount: number;
  MinAmountInInput: number;
  IsBlueprint: boolean;
  TargetItemName: string;
}

interface FilterRow extends RowDataPacket {
  id: number;
  owner_steamid: string;
  title: string;
  description: string | null;
  cover_shortname: string | null;
  category: string | null;
  is_public: number;
  items: string | ConveyorFilterItem[];
  export_count: number;
  created_at: Date;
  updated_at: Date;
  owner_username?: string;
  owner_avatar?: string;
  item_count?: number;
  is_saved?: number;
  can_edit?: number;
}

function parseItems(raw: string | ConveyorFilterItem[]): ConveyorFilterItem[] {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeItem(input: unknown): ConveyorFilterItem | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  const targetItemName =
    typeof obj.TargetItemName === 'string'
      ? obj.TargetItemName.trim()
      : typeof obj.targetItemName === 'string'
        ? obj.targetItemName.trim()
        : '';
  if (targetItemName.length > 128) return null;

  const toInt = (v: unknown, fallback = 0) => {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1_000_000, Math.floor(n)));
  };

  const categoryRaw = obj.TargetCategory ?? obj.targetCategory ?? null;
  let targetCategory: number | null = null;
  if (categoryRaw !== null && categoryRaw !== undefined && categoryRaw !== '') {
    const n = Number(categoryRaw);
    targetCategory = Number.isFinite(n) ? Math.floor(n) : null;
  }

  // В игре допустим фильтр только по категории (TargetItemName пустой, TargetCategory задан)
  if (!targetItemName && targetCategory === null) return null;

  return {
    TargetCategory: targetCategory,
    MaxAmountInOutput: toInt(obj.MaxAmountInOutput ?? obj.maxAmountInOutput),
    BufferAmount: toInt(obj.BufferAmount ?? obj.bufferAmount),
    MinAmountInInput: toInt(obj.MinAmountInInput ?? obj.minAmountInInput),
    IsBlueprint: Boolean(obj.IsBlueprint ?? obj.isBlueprint ?? false),
    TargetItemName: targetItemName,
  };
}

function normalizeItems(input: unknown): ConveyorFilterItem[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length > MAX_ITEMS) return null;
  const items: ConveyorFilterItem[] = [];
  for (const entry of input) {
    const item = normalizeItem(entry);
    if (!item) return null;
    items.push(item);
  }
  return items;
}

function normalizeCoverShortname(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!value || value.length > MAX_SHORTNAME) return null;
  return value;
}

function normalizeCategory(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!value) return null;
  return isRustCategoryId(value) ? value : null;
}

function mapFilter(row: FilterRow, extras: Record<string, unknown> = {}) {
  const items = parseItems(row.items);
  return {
    id: row.id,
    owner_steamid: row.owner_steamid,
    owner_username: row.owner_username ?? null,
    owner_avatar: row.owner_avatar ?? null,
    title: row.title,
    description: row.description,
    cover_shortname: row.cover_shortname ?? null,
    category: row.category ?? null,
    is_public: Boolean(row.is_public),
    items,
    item_count: row.item_count ?? items.length,
    export_count: row.export_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_saved: row.is_saved !== undefined ? Boolean(row.is_saved) : undefined,
    can_edit: row.can_edit !== undefined ? Boolean(row.can_edit) : undefined,
    ...extras,
  };
}

async function getFilterAccess(filterId: number, steamid?: string) {
  const [rows] = await webPool.query<FilterRow[]>(
    `SELECT f.*, u.username AS owner_username, u.avatar AS owner_avatar
     FROM conveyor_filters f
     JOIN users u ON u.steamid = f.owner_steamid
     WHERE f.id = ?`,
    [filterId]
  );
  if (rows.length === 0) return null;
  const filter = rows[0];

  let canView = Boolean(filter.is_public);
  let canEdit = false;
  let isOwner = false;

  if (steamid) {
    isOwner = filter.owner_steamid === steamid;
    if (isOwner) {
      canView = true;
      canEdit = true;
    } else {
      const [shares] = await webPool.query<RowDataPacket[]>(
        `SELECT can_edit FROM conveyor_filter_shares
         WHERE filter_id = ? AND shared_with_steamid = ?`,
        [filterId, steamid]
      );
      if (shares.length > 0) {
        canView = true;
        canEdit = Boolean(shares[0].can_edit);
      }
    }
  }

  return { filter, canView, canEdit, isOwner };
}

/**
 * GET /api/conveyor-filters — публичный каталог
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const categoryRaw = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const category = isRustCategoryId(categoryRaw) ? categoryRaw : '';
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 24));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const steamid = req.isAuthenticated() ? req.user!.steamid : null;

    const params: Array<string | number> = [];
    let where = 'WHERE f.is_public = 1';
    if (q) {
      where += ' AND (f.title LIKE ? OR f.description LIKE ? OR u.username LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    if (category) {
      where += ' AND f.category = ?';
      params.push(category);
    }

    const savedJoin = steamid
      ? `LEFT JOIN conveyor_filter_saves s ON s.filter_id = f.id AND s.steamid = ?`
      : '';
    if (steamid) params.unshift(steamid);

    const [rows] = await webPool.query<FilterRow[]>(
      `SELECT f.*, u.username AS owner_username, u.avatar AS owner_avatar,
              JSON_LENGTH(f.items) AS item_count
              ${steamid ? ', IF(s.id IS NULL, 0, 1) AS is_saved' : ''}
       FROM conveyor_filters f
       JOIN users u ON u.steamid = f.owner_steamid
       ${savedJoin}
       ${where}
       ORDER BY f.updated_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const countParams: Array<string | number> = [];
    if (q) {
      const like = `%${q}%`;
      countParams.push(like, like, like);
    }
    if (category) countParams.push(category);
    const [countRows] = await webPool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
       FROM conveyor_filters f
       JOIN users u ON u.steamid = f.owner_steamid
       ${where}`,
      countParams
    );

    res.json({
      filters: rows.map((r) => mapFilter(r)),
      total: Number(countRows[0]?.total || 0),
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing public conveyor filters:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Не удалось загрузить фильтры' });
  }
});

/**
 * GET /api/conveyor-filters/mine — свои фильтры
 */
router.get('/mine', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const steamid = req.user!.steamid;
    const [rows] = await webPool.query<FilterRow[]>(
      `SELECT f.*, u.username AS owner_username, u.avatar AS owner_avatar,
              JSON_LENGTH(f.items) AS item_count
       FROM conveyor_filters f
       JOIN users u ON u.steamid = f.owner_steamid
       WHERE f.owner_steamid = ?
       ORDER BY f.updated_at DESC`,
      [steamid]
    );
    res.json({ filters: rows.map((r) => mapFilter(r, { can_edit: true })) });
  } catch (error) {
    console.error('Error listing own conveyor filters:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Не удалось загрузить ваши фильтры' });
  }
});

/**
 * GET /api/conveyor-filters/saved — сохранённые
 */
router.get('/saved', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const steamid = req.user!.steamid;
    const [rows] = await webPool.query<FilterRow[]>(
      `SELECT f.*, u.username AS owner_username, u.avatar AS owner_avatar,
              JSON_LENGTH(f.items) AS item_count, 1 AS is_saved
       FROM conveyor_filter_saves s
       JOIN conveyor_filters f ON f.id = s.filter_id
       JOIN users u ON u.steamid = f.owner_steamid
       WHERE s.steamid = ?
       ORDER BY s.created_at DESC`,
      [steamid]
    );
    res.json({ filters: rows.map((r) => mapFilter(r)) });
  } catch (error) {
    console.error('Error listing saved conveyor filters:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Не удалось загрузить сохранённые фильтры' });
  }
});

/**
 * GET /api/conveyor-filters/shared — расшаренные пользователю
 */
router.get('/shared', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const steamid = req.user!.steamid;
    const [rows] = await webPool.query<FilterRow[]>(
      `SELECT f.*, u.username AS owner_username, u.avatar AS owner_avatar,
              JSON_LENGTH(f.items) AS item_count, sh.can_edit
       FROM conveyor_filter_shares sh
       JOIN conveyor_filters f ON f.id = sh.filter_id
       JOIN users u ON u.steamid = f.owner_steamid
       WHERE sh.shared_with_steamid = ?
       ORDER BY sh.created_at DESC`,
      [steamid]
    );
    res.json({ filters: rows.map((r) => mapFilter(r)) });
  } catch (error) {
    console.error('Error listing shared conveyor filters:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Не удалось загрузить общие фильтры' });
  }
});

/**
 * GET /api/conveyor-filters/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const filterId = Number(req.params.id);
    if (!Number.isFinite(filterId)) {
      return res.status(400).json({ error: 'Некорректный ID' });
    }
    const steamid = req.isAuthenticated() ? req.user!.steamid : undefined;
    const access = await getFilterAccess(filterId, steamid);
    if (!access || !access.canView) {
      return res.status(404).json({ error: 'Фильтр не найден' });
    }

    let isSaved = false;
    if (steamid) {
      const [saves] = await webPool.query<RowDataPacket[]>(
        `SELECT id FROM conveyor_filter_saves WHERE filter_id = ? AND steamid = ?`,
        [filterId, steamid]
      );
      isSaved = saves.length > 0;
    }

    res.json({
      filter: mapFilter(access.filter, {
        can_edit: access.canEdit,
        is_owner: access.isOwner,
        is_saved: isSaved,
      }),
    });
  } catch (error) {
    console.error('Error fetching conveyor filter:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Не удалось загрузить фильтр' });
  }
});

/**
 * POST /api/conveyor-filters — создать
 */
router.post('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const steamid = req.user!.steamid;
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const description =
      typeof req.body.description === 'string' ? req.body.description.trim().slice(0, MAX_DESCRIPTION) : null;
    const isPublic = Boolean(req.body.is_public);
    const items = normalizeItems(req.body.items);
    const coverShortname =
      normalizeCoverShortname(req.body.cover_shortname) ||
      items?.find((item) => item.TargetItemName)?.TargetItemName ||
      null;
    const category = normalizeCategory(req.body.category);

    if (!title || title.length > MAX_TITLE) {
      return res.status(400).json({ error: 'Укажите название фильтра (до 120 символов)' });
    }
    if (!coverShortname) {
      return res.status(400).json({ error: 'Выберите предмет для превью' });
    }
    if (!items) {
      return res.status(400).json({ error: `Список предметов некорректен (макс. ${MAX_ITEMS})` });
    }

    await ensureFilterMetaColumns();

    let insertId: number;
    try {
      const [result] = await webPool.query<ResultSetHeader>(
        `INSERT INTO conveyor_filters (owner_steamid, title, description, cover_shortname, category, is_public, items)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [steamid, title, description || null, coverShortname, category, isPublic ? 1 : 0, JSON.stringify(items)]
      );
      insertId = result.insertId;
    } catch (error) {
      if (mysqlErrno(error) !== 1054) throw error;
      const [result] = await webPool.query<ResultSetHeader>(
        `INSERT INTO conveyor_filters (owner_steamid, title, description, is_public, items)
         VALUES (?, ?, ?, ?, ?)`,
        [steamid, title, description || null, isPublic ? 1 : 0, JSON.stringify(items)]
      );
      insertId = result.insertId;
    }

    const access = await getFilterAccess(insertId, steamid);
    res.status(201).json({ filter: mapFilter(access!.filter, { can_edit: true, is_owner: true }) });
  } catch (error) {
    console.error('Error creating conveyor filter:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Не удалось создать фильтр' });
  }
});

/**
 * PUT /api/conveyor-filters/:id — обновить
 */
router.put('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const filterId = Number(req.params.id);
    if (!Number.isFinite(filterId)) {
      return res.status(400).json({ error: 'Некорректный ID' });
    }
    const steamid = req.user!.steamid;
    const access = await getFilterAccess(filterId, steamid);
    if (!access || !access.canEdit) {
      return res.status(403).json({ error: 'Нет прав на редактирование' });
    }

    const title =
      typeof req.body.title === 'string' ? req.body.title.trim() : access.filter.title;
    const description =
      typeof req.body.description === 'string'
        ? req.body.description.trim().slice(0, MAX_DESCRIPTION)
        : access.filter.description;
    const isPublic =
      req.body.is_public !== undefined ? Boolean(req.body.is_public) : Boolean(access.filter.is_public);
    const items =
      req.body.items !== undefined ? normalizeItems(req.body.items) : parseItems(access.filter.items);
    const coverShortname =
      normalizeCoverShortname(req.body.cover_shortname) ||
      access.filter.cover_shortname ||
      items?.find((item) => item.TargetItemName)?.TargetItemName ||
      null;
    const category =
      req.body.category !== undefined ? normalizeCategory(req.body.category) : access.filter.category;

    if (!title || title.length > MAX_TITLE) {
      return res.status(400).json({ error: 'Укажите название фильтра (до 120 символов)' });
    }
    if (!coverShortname) {
      return res.status(400).json({ error: 'Выберите предмет для превью' });
    }
    if (!items) {
      return res.status(400).json({ error: `Список предметов некорректен (макс. ${MAX_ITEMS})` });
    }

    // Только владелец может менять публичность
    const finalPublic = access.isOwner ? (isPublic ? 1 : 0) : access.filter.is_public;

    await ensureFilterMetaColumns();

    try {
      await webPool.query(
        `UPDATE conveyor_filters
         SET title = ?, description = ?, cover_shortname = ?, category = ?, is_public = ?, items = ?
         WHERE id = ?`,
        [title, description || null, coverShortname, category, finalPublic, JSON.stringify(items), filterId]
      );
    } catch (error) {
      if (mysqlErrno(error) !== 1054) throw error;
      await webPool.query(
        `UPDATE conveyor_filters
         SET title = ?, description = ?, is_public = ?, items = ?
         WHERE id = ?`,
        [title, description || null, finalPublic, JSON.stringify(items), filterId]
      );
    }

    const updated = await getFilterAccess(filterId, steamid);
    res.json({ filter: mapFilter(updated!.filter, { can_edit: true, is_owner: updated!.isOwner }) });
  } catch (error) {
    console.error('Error updating conveyor filter:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Не удалось обновить фильтр' });
  }
});

/**
 * DELETE /api/conveyor-filters/:id
 */
router.delete('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const filterId = Number(req.params.id);
    if (!Number.isFinite(filterId)) {
      return res.status(400).json({ error: 'Некорректный ID' });
    }
    const steamid = req.user!.steamid;
    const access = await getFilterAccess(filterId, steamid);
    if (!access || !access.isOwner) {
      return res.status(403).json({ error: 'Удалить может только владелец' });
    }

    await webPool.query(`DELETE FROM conveyor_filters WHERE id = ?`, [filterId]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting conveyor filter:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Не удалось удалить фильтр' });
  }
});

/**
 * POST /api/conveyor-filters/:id/export — экспорт JSON + счётчик
 */
router.post('/:id/export', async (req: Request, res: Response) => {
  try {
    const filterId = Number(req.params.id);
    if (!Number.isFinite(filterId)) {
      return res.status(400).json({ error: 'Некорректный ID' });
    }
    const steamid = req.isAuthenticated() ? req.user!.steamid : undefined;
    const access = await getFilterAccess(filterId, steamid);
    if (!access || !access.canView) {
      return res.status(404).json({ error: 'Фильтр не найден' });
    }

    await webPool.query(`UPDATE conveyor_filters SET export_count = export_count + 1 WHERE id = ?`, [
      filterId,
    ]);

    const items = parseItems(access.filter.items);
    res.json({
      items,
      json: JSON.stringify(items, null, 2),
      filename: `${access.filter.title.replace(/[^\w\-а-яёА-ЯЁ]+/gi, '_').slice(0, 40) || 'filter'}.json`,
    });
  } catch (error) {
    console.error('Error exporting conveyor filter:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Не удалось экспортировать фильтр' });
  }
});

/**
 * POST /api/conveyor-filters/:id/save — в избранное
 */
router.post('/:id/save', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const filterId = Number(req.params.id);
    if (!Number.isFinite(filterId)) {
      return res.status(400).json({ error: 'Некорректный ID' });
    }
    const steamid = req.user!.steamid;
    const access = await getFilterAccess(filterId, steamid);
    if (!access || !access.canView) {
      return res.status(404).json({ error: 'Фильтр не найден' });
    }
    if (access.isOwner) {
      return res.status(400).json({ error: 'Свой фильтр уже в вашем списке' });
    }

    await webPool.query(
      `INSERT IGNORE INTO conveyor_filter_saves (filter_id, steamid) VALUES (?, ?)`,
      [filterId, steamid]
    );
    res.json({ ok: true, is_saved: true });
  } catch (error) {
    console.error('Error saving conveyor filter:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Не удалось сохранить фильтр' });
  }
});

/**
 * DELETE /api/conveyor-filters/:id/save
 */
router.delete('/:id/save', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const filterId = Number(req.params.id);
    if (!Number.isFinite(filterId)) {
      return res.status(400).json({ error: 'Некорректный ID' });
    }
    await webPool.query(`DELETE FROM conveyor_filter_saves WHERE filter_id = ? AND steamid = ?`, [
      filterId,
      req.user!.steamid,
    ]);
    res.json({ ok: true, is_saved: false });
  } catch (error) {
    console.error('Error unsaving conveyor filter:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Не удалось убрать фильтр из сохранённых' });
  }
});

/**
 * GET /api/conveyor-filters/:id/shares
 */
router.get('/:id/shares', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const filterId = Number(req.params.id);
    if (!Number.isFinite(filterId)) {
      return res.status(400).json({ error: 'Некорректный ID' });
    }
    const access = await getFilterAccess(filterId, req.user!.steamid);
    if (!access || !access.isOwner) {
      return res.status(403).json({ error: 'Только владелец видит список доступа' });
    }

    const [rows] = await webPool.query<RowDataPacket[]>(
      `SELECT sh.shared_with_steamid AS steamid, sh.can_edit, sh.created_at,
              u.username, u.avatar
       FROM conveyor_filter_shares sh
       JOIN users u ON u.steamid = sh.shared_with_steamid
       WHERE sh.filter_id = ?
       ORDER BY sh.created_at DESC`,
      [filterId]
    );
    res.json({ shares: rows });
  } catch (error) {
    console.error('Error listing shares:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Не удалось загрузить список доступа' });
  }
});

/**
 * POST /api/conveyor-filters/:id/share — выдать доступ по SteamID или нику
 */
router.post('/:id/share', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const filterId = Number(req.params.id);
    if (!Number.isFinite(filterId)) {
      return res.status(400).json({ error: 'Некорректный ID' });
    }
    const steamid = req.user!.steamid;
    const access = await getFilterAccess(filterId, steamid);
    if (!access || !access.isOwner) {
      return res.status(403).json({ error: 'Только владелец может выдавать доступ' });
    }

    const query =
      typeof req.body.user === 'string'
        ? req.body.user.trim()
        : typeof req.body.steamid === 'string'
          ? req.body.steamid.trim()
          : '';
    if (!query) {
      return res.status(400).json({ error: 'Укажите SteamID или имя пользователя' });
    }

    const [users] = await webPool.query<RowDataPacket[]>(
      `SELECT steamid, username, avatar FROM users
       WHERE steamid = ? OR username = ?
       LIMIT 1`,
      [query, query]
    );
    if (users.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден (нужен аккаунт на сайте)' });
    }
    const target = users[0];
    if (target.steamid === steamid) {
      return res.status(400).json({ error: 'Нельзя выдать доступ самому себе' });
    }

    const canEdit = Boolean(req.body.can_edit);
    await webPool.query(
      `INSERT INTO conveyor_filter_shares (filter_id, shared_with_steamid, can_edit)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE can_edit = VALUES(can_edit)`,
      [filterId, target.steamid, canEdit ? 1 : 0]
    );

    res.json({
      share: {
        steamid: target.steamid,
        username: target.username,
        avatar: target.avatar,
        can_edit: canEdit,
      },
    });
  } catch (error) {
    console.error('Error sharing conveyor filter:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Не удалось выдать доступ' });
  }
});

/**
 * DELETE /api/conveyor-filters/:id/share/:steamid
 */
router.delete('/:id/share/:steamid', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const filterId = Number(req.params.id);
    const targetSteamid = req.params.steamid;
    if (!Number.isFinite(filterId) || !targetSteamid) {
      return res.status(400).json({ error: 'Некорректные параметры' });
    }
    const access = await getFilterAccess(filterId, req.user!.steamid);
    if (!access || !access.isOwner) {
      return res.status(403).json({ error: 'Только владелец может отзывать доступ' });
    }

    await webPool.query(
      `DELETE FROM conveyor_filter_shares WHERE filter_id = ? AND shared_with_steamid = ?`,
      [filterId, targetSteamid]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error revoking share:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Не удалось отозвать доступ' });
  }
});

export default router;
