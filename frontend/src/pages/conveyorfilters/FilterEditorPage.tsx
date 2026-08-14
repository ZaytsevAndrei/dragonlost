import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../services/api';
import { findRustItem, searchRustItems } from '../../data/rustItems';
import { useAuthStore } from '../../store/authStore';
import {
  ConveyorFilter,
  ConveyorFilterItem,
  ConveyorFilterShare,
  copyText,
  createEmptyItem,
  exportConveyorJson,
  parseConveyorImport,
} from '../../utils/conveyorExport';

function FilterEditorPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [items, setItems] = useState<ConveyorFilterItem[]>([]);
  const [filterMeta, setFilterMeta] = useState<ConveyorFilter | null>(null);
  const [shares, setShares] = useState<ConveyorFilterShare[]>([]);
  const [shareUser, setShareUser] = useState('');
  const [shareCanEdit, setShareCanEdit] = useState(false);
  const [itemQuery, setItemQuery] = useState('');
  const [importText, setImportText] = useState('');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canEdit = isNew || Boolean(filterMeta?.can_edit || filterMeta?.is_owner);
  const isOwner = isNew || Boolean(filterMeta?.is_owner);

  const suggestions = useMemo(() => searchRustItems(itemQuery, 24), [itemQuery]);

  const loadShares = useCallback(async (filterId: number) => {
    try {
      const res = await api.get<{ shares: ConveyorFilterShare[] }>(`/conveyor-filters/${filterId}/shares`);
      setShares(res.data.shares || []);
    } catch {
      setShares([]);
    }
  }, []);

  useEffect(() => {
    if (isNew) return;
    const filterId = Number(id);
    if (!Number.isFinite(filterId)) {
      setError('Некорректный ID');
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        setLoading(true);
        const res = await api.get<{ filter: ConveyorFilter }>(`/conveyor-filters/${filterId}`);
        const f = res.data.filter;
        setFilterMeta(f);
        setTitle(f.title);
        setDescription(f.description || '');
        setIsPublic(f.is_public);
        setItems(f.items || []);
        if (f.is_owner) {
          await loadShares(f.id);
        }
      } catch {
        setError('Фильтр не найден или нет доступа');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew, loadShares]);

  useEffect(() => {
    if (authLoading) return;
    if (isNew && !user) {
      navigate('/conveyorfilters');
    }
  }, [authLoading, isNew, user, navigate]);

  const addItem = (shortname: string) => {
    if (!shortname.trim()) return;
    setItems((prev) => [...prev, createEmptyItem(shortname.trim())]);
    setItemQuery('');
  };

  const updateItem = (index: number, patch: Partial<ConveyorFilterItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImport = () => {
    try {
      const parsed = parseConveyorImport(importText);
      setItems(parsed);
      setMessage(`Импортировано предметов: ${parsed.length}`);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка импорта');
    }
  };

  const handleExportLocal = async () => {
    const json = exportConveyorJson(items);
    const ok = await copyText(json);
    setMessage(ok ? 'JSON скопирован в буфер обмена' : 'Не удалось скопировать');
  };

  const handleExportServer = async () => {
    if (!filterMeta) {
      await handleExportLocal();
      return;
    }
    const json = exportConveyorJson(items);
    const ok = await copyText(json);
    try {
      await api.post(`/conveyor-filters/${filterMeta.id}/export`);
      setError(null);
      setMessage(ok ? 'JSON скопирован в буфер обмена' : 'Не удалось скопировать');
    } catch {
      if (ok) {
        setMessage('JSON скопирован в буфер обмена');
      } else {
        setError('Не удалось экспортировать');
      }
    }
  };

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (!title.trim()) {
      setError('Укажите название');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        is_public: isPublic,
        items,
      };
      if (isNew) {
        const res = await api.post<{ filter: ConveyorFilter }>('/conveyor-filters', payload);
        setMessage('Фильтр создан');
        navigate(`/conveyorfilters/${res.data.filter.id}`, { replace: true });
      } else {
        const res = await api.put<{ filter: ConveyorFilter }>(`/conveyor-filters/${id}`, payload);
        setFilterMeta(res.data.filter);
        setMessage('Сохранено');
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Не удалось сохранить';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!filterMeta?.is_owner) return;
    if (!window.confirm('Удалить фильтр безвозвратно?')) return;
    try {
      await api.delete(`/conveyor-filters/${filterMeta.id}`);
      navigate('/conveyorfilters/my');
    } catch {
      setError('Не удалось удалить');
    }
  };

  const onShare = async (e: FormEvent) => {
    e.preventDefault();
    if (!filterMeta?.is_owner || !shareUser.trim()) return;
    try {
      await api.post(`/conveyor-filters/${filterMeta.id}/share`, {
        user: shareUser.trim(),
        can_edit: shareCanEdit,
      });
      setShareUser('');
      setShareCanEdit(false);
      await loadShares(filterMeta.id);
      setMessage('Доступ выдан');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Не удалось выдать доступ';
      setError(msg);
    }
  };

  const revokeShare = async (steamid: string) => {
    if (!filterMeta?.is_owner) return;
    try {
      await api.delete(`/conveyor-filters/${filterMeta.id}/share/${steamid}`);
      await loadShares(filterMeta.id);
    } catch {
      setError('Не удалось отозвать доступ');
    }
  };

  if (loading || authLoading) {
    return <p className="cf-muted">Загрузка…</p>;
  }

  if (error && !filterMeta && !isNew) {
    return (
      <section className="cf-section">
        <p className="cf-error">{error}</p>
        <Link to="/conveyorfilters" className="cf-btn">
          К общим фильтрам
        </Link>
      </section>
    );
  }

  return (
    <section className="cf-section">
      <header className="cf-header">
        <div>
          <h1>{isNew ? 'Новый фильтр' : title || 'Фильтр'}</h1>
          <p className="cf-lead">
            Настройте предметы и скопируйте JSON в буфер обмена — затем вставьте его в настройки конвейера в
            Rust.
          </p>
        </div>
        <div className="cf-header-actions">
          <button type="button" className="cf-btn" onClick={() => void handleExportServer()}>
            Экспорт JSON
          </button>
          {!isNew && (
            <Link to="/conveyorfilters/my" className="cf-btn">
              Приватные фильтры
            </Link>
          )}
        </div>
      </header>

      {message && <p className="cf-success">{message}</p>}
      {error && <p className="cf-error">{error}</p>}

      <form className="cf-editor" onSubmit={(e) => void onSave(e)}>
        <div className="cf-form-grid">
          <label className="cf-field">
            <span>Название</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              maxLength={120}
              required
            />
          </label>
          <label className="cf-field cf-check">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              disabled={!canEdit || (!isNew && !isOwner)}
            />
            <span>Публичный (в общих фильтрах)</span>
          </label>
        </div>

        <label className="cf-field">
          <span>Описание</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canEdit}
            rows={3}
            maxLength={2000}
          />
        </label>

        {canEdit && (
          <div className="cf-item-picker">
            <label className="cf-field">
              <span>Добавить предмет</span>
              <input
                value={itemQuery}
                onChange={(e) => setItemQuery(e.target.value)}
                placeholder="Поиск по имени или shortname…"
              />
            </label>
            {itemQuery.trim() && (
              <ul className="cf-suggest">
                {suggestions.map((item) => (
                  <li key={item.shortname}>
                    <button type="button" onClick={() => addItem(item.shortname)}>
                      <strong>{item.name}</strong>
                      <span>{item.shortname}</span>
                      <em>{item.category}</em>
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" onClick={() => addItem(itemQuery.trim())}>
                    Добавить как shortname: <strong>{itemQuery.trim()}</strong>
                  </button>
                </li>
              </ul>
            )}
          </div>
        )}

        <div className="cf-items-table-wrap">
          <table className="cf-items-table">
            <thead>
              <tr>
                <th>Предмет</th>
                <th>Min Input</th>
                <th>Buffer</th>
                <th>Max Output</th>
                <th>BP</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 6 : 5} className="cf-muted">
                    Список пуст — добавьте предметы или импортируйте JSON из игры
                  </td>
                </tr>
              )}
              {items.map((item, index) => {
                const meta = findRustItem(item.TargetItemName);
                return (
                  <tr key={`${item.TargetItemName}-${index}`}>
                    <td>
                      <div className="cf-item-name">
                        <strong>{meta?.name || item.TargetItemName}</strong>
                        <code>{item.TargetItemName}</code>
                      </div>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={item.MinAmountInInput}
                        disabled={!canEdit}
                        onChange={(e) => updateItem(index, { MinAmountInInput: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={item.BufferAmount}
                        disabled={!canEdit}
                        onChange={(e) => updateItem(index, { BufferAmount: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={item.MaxAmountInOutput}
                        disabled={!canEdit}
                        onChange={(e) => updateItem(index, { MaxAmountInOutput: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={item.IsBlueprint}
                        disabled={!canEdit}
                        onChange={(e) => updateItem(index, { IsBlueprint: e.target.checked })}
                      />
                    </td>
                    {canEdit && (
                      <td>
                        <button type="button" className="cf-btn cf-btn-danger" onClick={() => removeItem(index)}>
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {canEdit && (
          <div className="cf-editor-actions">
            <button type="submit" className="cf-btn cf-btn-primary" disabled={saving}>
              {saving ? 'Сохранение…' : isNew ? 'Создать' : 'Сохранить'}
            </button>
            {isOwner && !isNew && (
              <button type="button" className="cf-btn cf-btn-danger" onClick={() => void onDelete()}>
                Удалить
              </button>
            )}
          </div>
        )}
      </form>

      {canEdit && (
        <details className="cf-panel">
          <summary>Импорт JSON из игры</summary>
          <p className="cf-muted">Вставьте массив фильтров из настроек конвейера (формат как в primer.txt).</p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={8}
            placeholder='[{ "TargetCategory": null, "MaxAmountInOutput": 0, ... }]'
          />
          <button type="button" className="cf-btn" onClick={handleImport}>
            Импортировать
          </button>
        </details>
      )}

      {isOwner && !isNew && (
        <section className="cf-panel">
          <h2>Доступ</h2>
          <p className="cf-muted">Выдайте доступ другу по SteamID или нику с сайта DragonLost.</p>
          <form className="cf-share-form" onSubmit={(e) => void onShare(e)}>
            <input
              value={shareUser}
              onChange={(e) => setShareUser(e.target.value)}
              placeholder="SteamID или ник"
              required
            />
            <label className="cf-check">
              <input
                type="checkbox"
                checked={shareCanEdit}
                onChange={(e) => setShareCanEdit(e.target.checked)}
              />
              Можно редактировать
            </label>
            <button type="submit" className="cf-btn cf-btn-primary">
              Выдать доступ
            </button>
          </form>
          {shares.length === 0 ? (
            <p className="cf-muted">Пока никому не выдан доступ.</p>
          ) : (
            <ul className="cf-share-list">
              {shares.map((s) => (
                <li key={s.steamid}>
                  <span className="cf-owner">
                    {s.avatar && <img src={s.avatar} alt="" />}
                    {s.username}
                  </span>
                  <span className="cf-muted">{s.can_edit ? 'редактирование' : 'просмотр'}</span>
                  <button type="button" className="cf-btn cf-btn-danger" onClick={() => void revokeShare(s.steamid)}>
                    Отозвать
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <details className="cf-panel">
        <summary>Предпросмотр JSON</summary>
        <pre className="cf-json">{exportConveyorJson(items)}</pre>
      </details>
    </section>
  );
}

export default FilterEditorPage;
