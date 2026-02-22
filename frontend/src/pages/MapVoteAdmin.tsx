import { useEffect, useState, useCallback } from 'react';
import { api, getImageUrl } from '../services/api';
import { useAuthStore } from '../store/authStore';
import './MapVoteAdmin.css';

interface RustMapResult {
  seed: number;
  size: number;
  mapId: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  mapPageUrl: string;
  ready: boolean;
}

interface MapOption {
  id: number;
  map_name: string;
  map_seed: number | null;
  map_size: number | null;
  image_url: string | null;
  description: string | null;
  vote_count: number;
}

interface VoteSession {
  id: number;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  winner_option_id: number | null;
  created_at: string;
  options: MapOption[];
}

const MAP_SIZES = Array.from({ length: (6250 - 2500) / 250 + 1 }, (_, i) => 2500 + i * 250);

function getNextDayOfWeek(dayOfWeek: number, hours: number, minutes: number): Date {
  const now = new Date();
  const result = new Date(now);
  const diff = (dayOfWeek - now.getDay() + 7) % 7;
  result.setDate(now.getDate() + (diff === 0 && now.getHours() >= hours ? 7 : diff || 7));
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function toLocalDatetimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function useCountdown(endsAt: string | null): string {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    if (!endsAt) return;
    const update = () => {
      const diff = new Date(endsAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('Завершено'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) setTimeLeft(`${d}д ${h}ч ${m}м`);
      else if (h > 0) setTimeLeft(`${h}ч ${m}м ${s}с`);
      else setTimeLeft(`${m}м ${s}с`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return timeLeft;
}

const DATE_PRESETS = [
  { label: 'Чт 16:00', get: () => getNextDayOfWeek(4, 16, 0) },
  { label: 'Пт 12:00', get: () => getNextDayOfWeek(5, 12, 0) },
  { label: '+24ч', get: () => new Date(Date.now() + 24 * 3600000) },
  { label: '+48ч', get: () => new Date(Date.now() + 48 * 3600000) },
  { label: '+72ч', get: () => new Date(Date.now() + 72 * 3600000) },
];

function MapVoteAdmin() {
  const { user } = useAuthStore();
  const [sessions, setSessions] = useState<VoteSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('Голосование за карту');
  const [endsAt, setEndsAt] = useState('');
  const [creating, setCreating] = useState(false);

  const [mapSize, setMapSize] = useState(4000);
  const [generatedMaps, setGeneratedMaps] = useState<RustMapResult[]>([]);
  const [generating, setGenerating] = useState(false);

  const [confirmAction, setConfirmAction] = useState<{ type: 'close' | 'cancel' | 'pick' | 'delete'; sessionId: number; optionId?: number } | null>(null);

  const isAdmin = user?.role === 'admin';

  const activeSession = sessions.find(s => s.status === 'active') || null;
  const pastSessions = sessions.filter(s => s.status !== 'active');
  const activeTimeLeft = useCountdown(activeSession?.ends_at || null);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/map-vote/sessions');
      setSessions(res.data.sessions || []);
      setError(null);
    } catch {
      setError('Не удалось загрузить сессии голосования');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchSessions();
  }, [isAdmin, fetchSessions]);

  const handleGenerateMaps = async () => {
    if (generating) return;
    try {
      setGenerating(true);
      setError(null);
      const res = await api.post('/map-vote/generate-maps', { size: mapSize, count: 10 });
      setGeneratedMaps(res.data.maps || []);
    } catch {
      setError('Ошибка при генерации карт. Проверьте настройку RUSTMAPS_API_KEY.');
    } finally {
      setGenerating(false);
    }
  };

  const handleRemoveGeneratedMap = (seed: number) => {
    setGeneratedMaps((prev) => prev.filter((m) => m.seed !== seed));
  };

  const handleCreate = async () => {
    if (creating) return;
    if (!endsAt) { setError('Укажите дату окончания голосования'); return; }
    if (generatedMaps.length < 2) { setError('Необходимо минимум 2 варианта карт'); return; }

    try {
      setCreating(true);
      setError(null);
      await api.post('/map-vote/sessions', {
        title,
        ends_at: new Date(endsAt).toISOString(),
        options: generatedMaps.map((m) => ({
          map_name: `Seed ${m.seed}`,
          map_seed: m.seed,
          map_size: m.size,
          image_url: m.thumbnailUrl || m.imageUrl || null,
          description: m.mapPageUrl,
        })),
      });
      setShowForm(false);
      setTitle('Голосование за карту');
      setEndsAt('');
      setGeneratedMaps([]);
      await fetchSessions();
    } catch {
      setError('Ошибка при создании голосования');
    } finally {
      setCreating(false);
    }
  };

  const executeAction = async () => {
    if (!confirmAction) return;
    const { type, sessionId, optionId } = confirmAction;
    setConfirmAction(null);
    try {
      if (type === 'delete') {
        await api.delete(`/map-vote/sessions/${sessionId}/permanent`);
      } else if (type === 'cancel') {
        await api.delete(`/map-vote/sessions/${sessionId}`);
      } else {
        await api.put(`/map-vote/sessions/${sessionId}/close`, {
          winner_option_id: optionId || undefined,
        });
      }
      await fetchSessions();
    } catch {
      const messages: Record<string, string> = {
        cancel: 'Ошибка при отмене голосования',
        delete: 'Ошибка при удалении сессии',
      };
      setError(messages[type] || 'Ошибка при закрытии голосования');
    }
  };

  if (!user || !isAdmin) {
    return (
      <div className="mva-page">
        <h1>Управление голосованиями</h1>
        <p className="mva-no-access">Доступ только для администраторов</p>
      </div>
    );
  }

  const totalVotesActive = activeSession
    ? activeSession.options.reduce((sum, o) => sum + o.vote_count, 0)
    : 0;
  const maxVotesActive = activeSession
    ? Math.max(...activeSession.options.map(o => o.vote_count), 0)
    : 0;

  return (
    <div className="mva-page">
      {/* ─── Header ─── */}
      <div className="mva-header">
        <h1>Управление голосованиями</h1>
        <button className="mva-btn-create" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Отмена' : '+ Создать голосование'}
        </button>
      </div>

      {error && (
        <div className="mva-error">
          <span>{error}</span>
          <button className="mva-error-close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* ─── Confirmation Modal ─── */}
      {confirmAction && (
        <div className="mva-modal-backdrop" onClick={() => setConfirmAction(null)}>
          <div className="mva-modal" onClick={e => e.stopPropagation()}>
            <h3>Подтверждение</h3>
            <p>
              {confirmAction.type === 'delete'
                ? 'Удалить сессию из истории? Это действие необратимо.'
                : confirmAction.type === 'cancel'
                  ? 'Отменить голосование? Все голоса будут потеряны.'
                  : confirmAction.type === 'pick'
                    ? 'Закрыть голосование и назначить эту карту победителем?'
                    : 'Закрыть голосование и выбрать победителя автоматически (по максимуму голосов)?'}
            </p>
            <div className="mva-modal-actions">
              <button className="mva-modal-btn mva-modal-btn-cancel" onClick={() => setConfirmAction(null)}>
                Нет
              </button>
              <button
                className={`mva-modal-btn ${confirmAction.type === 'cancel' || confirmAction.type === 'delete' ? 'mva-modal-btn-danger' : 'mva-modal-btn-primary'}`}
                onClick={executeAction}
              >
                Да, подтверждаю
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Create Form ─── */}
      {showForm && (
        <div className="mva-form">
          <div className="mva-form-row">
            <div className="mva-form-field mva-form-field-grow">
              <label>Заголовок</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Голосование за карту"
              />
            </div>
            <div className="mva-form-field">
              <label>Окончание</label>
              <div className="mva-date-row">
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
                <div className="mva-date-presets">
                  {DATE_PRESETS.map((p) => (
                    <button key={p.label} type="button" className="mva-chip" onClick={() => setEndsAt(toLocalDatetimeString(p.get()))}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              {endsAt && <span className="mva-date-preview">{formatDateTime(endsAt)}</span>}
            </div>
          </div>

          <div className="mva-form-divider" />

          <div className="mva-map-gen-row">
            <h4>Варианты карт <span className="mva-count-badge">{generatedMaps.length}</span></h4>
            <div className="mva-map-gen-controls">
              <div className="mva-size-select">
                <label>Размер</label>
                <select value={mapSize} onChange={(e) => setMapSize(Number(e.target.value))}>
                  {MAP_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button className="mva-btn-generate" onClick={handleGenerateMaps} disabled={generating} type="button">
                {generating ? (
                  <><span className="mva-spinner-inline" /> Генерация...</>
                ) : (
                  'Сгенерировать 10 карт'
                )}
              </button>
            </div>
          </div>

          {generating && (
            <div className="mva-generating">
              <div className="mva-spinner" />
              <span>Генерация через RustMaps API... до 30 сек.</span>
            </div>
          )}

          {generatedMaps.length > 0 && (
            <div className="mva-generated-maps">
              {generatedMaps.map((m) => (
                <div key={m.seed} className={`mva-gen-card ${m.ready ? '' : 'mva-gen-pending'}`}>
                  <div className="mva-gen-card-img">
                    {m.thumbnailUrl || m.imageUrl ? (
                      <img src={getImageUrl(m.thumbnailUrl || m.imageUrl || '')} alt={`Map ${m.seed}`} loading="lazy" />
                    ) : (
                      <div className="mva-gen-card-placeholder">{m.ready ? 'Нет превью' : '...'}</div>
                    )}
                    <button type="button" className="mva-btn-remove-gen" onClick={() => handleRemoveGeneratedMap(m.seed)} title="Удалить">×</button>
                  </div>
                  <div className="mva-gen-card-info">
                    <span className="mva-gen-seed">{m.seed}</span>
                    <span className="mva-gen-size">{m.size}m</span>
                    {m.mapPageUrl && (
                      <a href={m.mapPageUrl} target="_blank" rel="noopener noreferrer" className="mva-gen-link">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><path d="M15 3h6v6" /><path d="M10 14L21 3" />
                        </svg>
                        RustMaps
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mva-form-actions">
            <span className="mva-form-hint">
              {generatedMaps.length < 2 ? 'Нужно минимум 2 карты' : `${generatedMaps.length} карт будет в голосовании`}
            </span>
            <button className="mva-btn-submit" onClick={handleCreate} disabled={creating || generatedMaps.length < 2}>
              {creating ? 'Создание...' : 'Создать голосование'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Active Session Dashboard ─── */}
      {loading ? (
        <div className="mva-loading"><div className="mva-spinner" /> Загрузка...</div>
      ) : activeSession ? (
        <div className="mva-active-panel">
          <div className="mva-active-header">
            <div className="mva-active-info">
              <div className="mva-active-title-row">
                <span className="mva-status-dot mva-status-dot-active" />
                <h2>{activeSession.title}</h2>
              </div>
              <div className="mva-active-stats">
                <div className="mva-stat">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                  <span className="mva-stat-value">{activeTimeLeft}</span>
                </div>
                <div className="mva-stat">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
                  <span className="mva-stat-value">{totalVotesActive} голосов</span>
                </div>
                <div className="mva-stat">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
                  <span className="mva-stat-value">{activeSession.options.length} карт</span>
                </div>
              </div>
            </div>
            <div className="mva-active-actions">
              <button className="mva-btn-action mva-btn-action-close" onClick={() => setConfirmAction({ type: 'close', sessionId: activeSession.id })}>
                Закрыть (авто)
              </button>
              <button className="mva-btn-action mva-btn-action-cancel" onClick={() => setConfirmAction({ type: 'cancel', sessionId: activeSession.id })}>
                Отменить
              </button>
            </div>
          </div>

          <div className="mva-active-grid">
            {activeSession.options
              .slice()
              .sort((a, b) => b.vote_count - a.vote_count)
              .map((opt, idx) => {
                const pct = totalVotesActive > 0 ? Math.round((opt.vote_count / totalVotesActive) * 100) : 0;
                const isLeading = opt.vote_count > 0 && opt.vote_count === maxVotesActive;
                const rustMapsUrl = opt.description?.startsWith('http') ? opt.description : null;

                return (
                  <div key={opt.id} className={`mva-live-card ${isLeading ? 'mva-live-card-leading' : ''}`}>
                    <div className="mva-live-rank">#{idx + 1}</div>
                    <div className="mva-live-card-img">
                      {opt.image_url ? (
                        <img src={getImageUrl(opt.image_url)} alt={opt.map_name} />
                      ) : (
                        <div className="mva-live-card-noimg">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                            <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" /><path d="M8 2v16" /><path d="M16 6v16" />
                          </svg>
                        </div>
                      )}
                      {isLeading && <div className="mva-live-leading-tag">Лидер</div>}
                    </div>
                    <div className="mva-live-card-body">
                      <div className="mva-live-card-top">
                        <span className="mva-live-name">{opt.map_name}</span>
                        {rustMapsUrl && (
                          <a href={rustMapsUrl} target="_blank" rel="noopener noreferrer" className="mva-live-link" title="Открыть на RustMaps">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><path d="M15 3h6v6" /><path d="M10 14L21 3" />
                            </svg>
                          </a>
                        )}
                      </div>
                      {opt.map_size && <span className="mva-live-meta">{opt.map_size}m · seed {opt.map_seed}</span>}
                      <div className="mva-live-bar-row">
                        <div className="mva-live-bar-track">
                          <div className={`mva-live-bar-fill ${isLeading ? 'mva-live-bar-leading' : ''}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="mva-live-pct">{pct}%</span>
                      </div>
                      <div className="mva-live-card-footer">
                        <span className="mva-live-votes">{opt.vote_count} голосов</span>
                        <button
                          className="mva-btn-pick"
                          onClick={() => setConfirmAction({ type: 'pick', sessionId: activeSession.id, optionId: opt.id })}
                        >
                          Назначить
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ) : !showForm ? (
        <div className="mva-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
            <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" /><path d="M8 2v16" /><path d="M16 6v16" />
          </svg>
          <p>Нет активного голосования</p>
        </div>
      ) : null}

      {/* ─── History ─── */}
      {!loading && pastSessions.length > 0 && (
        <div className="mva-history">
          <h3>История ({pastSessions.length})</h3>
          <div className="mva-history-list">
            {pastSessions.map((s) => {
              const total = s.options.reduce((sum, o) => sum + o.vote_count, 0);
              const winner = s.options.find(o => o.id === s.winner_option_id);
              return (
                <div key={s.id} className={`mva-hist-card mva-hist-${s.status}`}>
                  <div className="mva-hist-header">
                    <div className="mva-hist-title">
                      <span className={`mva-status-badge mva-status-badge-${s.status}`}>{statusLabel(s.status)}</span>
                      <span className="mva-hist-name">{s.title}</span>
                    </div>
                    <div className="mva-hist-right">
                      <div className="mva-hist-meta">
                        <span>{formatDateTime(s.ends_at)}</span>
                        <span>{total} голосов</span>
                      </div>
                      <button
                        className="mva-btn-delete-hist"
                        onClick={() => setConfirmAction({ type: 'delete', sessionId: s.id })}
                        title="Удалить из истории"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                          <path d="M3 6h18" /><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {winner && (
                    <div className="mva-hist-winner">
                      {winner.image_url && <img src={getImageUrl(winner.image_url)} alt={winner.map_name} className="mva-hist-winner-img" />}
                      <div className="mva-hist-winner-info">
                        <span className="mva-hist-winner-label">Победитель</span>
                        <span className="mva-hist-winner-name">{winner.map_name}</span>
                        <span className="mva-hist-winner-votes">{winner.vote_count} голосов ({total > 0 ? Math.round((winner.vote_count / total) * 100) : 0}%)</span>
                      </div>
                    </div>
                  )}
                  <div className="mva-hist-options">
                    {s.options.map((opt) => {
                      const pct = total > 0 ? Math.round((opt.vote_count / total) * 100) : 0;
                      return (
                        <div key={opt.id} className={`mva-hist-opt ${opt.id === s.winner_option_id ? 'mva-hist-opt-winner' : ''}`}>
                          <span className="mva-hist-opt-name">{opt.map_name}</span>
                          <div className="mva-hist-opt-bar">
                            <div className="mva-hist-opt-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="mva-hist-opt-pct">{pct}%</span>
                          <span className="mva-hist-opt-count">{opt.vote_count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'active': return 'Активно';
    case 'closed': return 'Закрыто';
    case 'cancelled': return 'Отменено';
    default: return status;
  }
}

export default MapVoteAdmin;
