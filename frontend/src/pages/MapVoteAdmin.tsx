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

const DATE_PRESETS = [
  {
    label: 'Чт 16:00',
    get: () => getNextDayOfWeek(4, 16, 0),
  },
  {
    label: 'Пт 12:00',
    get: () => getNextDayOfWeek(5, 12, 0),
  },
  {
    label: 'Через 24ч',
    get: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
  },
  {
    label: 'Через 48ч',
    get: () => new Date(Date.now() + 48 * 60 * 60 * 1000),
  },
  {
    label: 'Через 72ч',
    get: () => new Date(Date.now() + 72 * 60 * 60 * 1000),
  },
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

  const isAdmin = user?.role === 'admin';

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
      const res = await api.post('/map-vote/generate-maps', { size: mapSize, count: 5 });
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

  const handleSetPresetDate = (date: Date) => {
    setEndsAt(toLocalDatetimeString(date));
  };

  const handleCreate = async () => {
    if (creating) return;
    if (!endsAt) {
      setError('Укажите дату окончания голосования');
      return;
    }
    if (generatedMaps.length < 2) {
      setError('Необходимо минимум 2 варианта карт. Сгенерируйте карты.');
      return;
    }

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

  const handleClose = async (sessionId: number, winnerOptionId?: number) => {
    try {
      await api.put(`/map-vote/sessions/${sessionId}/close`, {
        winner_option_id: winnerOptionId || undefined,
      });
      await fetchSessions();
    } catch {
      setError('Ошибка при закрытии голосования');
    }
  };

  const handleCancel = async (sessionId: number) => {
    try {
      await api.delete(`/map-vote/sessions/${sessionId}`);
      await fetchSessions();
    } catch {
      setError('Ошибка при отмене голосования');
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

  return (
    <div className="mva-page">
      <div className="mva-header">
        <h1>Управление голосованиями за карту</h1>
        <button className="mva-btn-create" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Отмена' : '+ Создать голосование'}
        </button>
      </div>

      {error && <div className="mva-error">{error}</div>}

      {showForm && (
        <div className="mva-form">
          <h3>Новое голосование</h3>

          <div className="mva-form-field">
            <label>Заголовок</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Голосование за карту"
            />
          </div>

          {/* Date/time picker with presets */}
          <div className="mva-form-field">
            <label>Окончание голосования</label>
            <div className="mva-date-picker">
              <div className="mva-date-presets">
                {DATE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="mva-date-preset-btn"
                    onClick={() => handleSetPresetDate(preset.get())}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
              {endsAt && (
                <div className="mva-date-preview">
                  {formatDateTime(endsAt)}
                </div>
              )}
            </div>
          </div>

          {/* Map generation from RustMaps */}
          <div className="mva-form-section">
            <h4>Варианты карт</h4>
            <div className="mva-map-gen-controls">
              <div className="mva-size-select">
                <label>Размер карты</label>
                <select
                  value={mapSize}
                  onChange={(e) => setMapSize(Number(e.target.value))}
                >
                  {MAP_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="mva-btn-generate"
                onClick={handleGenerateMaps}
                disabled={generating}
                type="button"
              >
                {generating ? 'Генерация...' : 'Сгенерировать 5 карт'}
              </button>
            </div>

            {generating && (
              <div className="mva-generating">
                <div className="mva-spinner" />
                <span>
                  Генерация карт через RustMaps API... Это может занять до 30 секунд.
                </span>
              </div>
            )}

            {generatedMaps.length > 0 && (
              <div className="mva-generated-maps">
                {generatedMaps.map((m) => (
                  <div key={m.seed} className={`mva-gen-card ${m.ready ? '' : 'mva-gen-pending'}`}>
                    <div className="mva-gen-card-img">
                      {m.thumbnailUrl || m.imageUrl ? (
                        <img
                          src={getImageUrl(m.thumbnailUrl || m.imageUrl || '')}
                          alt={`Map ${m.seed}`}
                          loading="lazy"
                        />
                      ) : (
                        <div className="mva-gen-card-placeholder">
                          {m.ready ? 'Нет превью' : 'Генерация...'}
                        </div>
                      )}
                    </div>
                    <div className="mva-gen-card-info">
                      <span className="mva-gen-seed">Seed: {m.seed}</span>
                      <span className="mva-gen-size">Размер: {m.size}</span>
                      {m.mapPageUrl && (
                        <a
                          href={m.mapPageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mva-gen-link"
                        >
                          Открыть на RustMaps
                        </a>
                      )}
                    </div>
                    <button
                      type="button"
                      className="mva-btn-remove-gen"
                      onClick={() => handleRemoveGeneratedMap(m.seed)}
                      title="Удалить"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mva-form-actions">
            <button
              className="mva-btn-submit"
              onClick={handleCreate}
              disabled={creating || generatedMaps.length < 2}
            >
              {creating ? 'Создание...' : 'Создать голосование'}
            </button>
          </div>
        </div>
      )}

      {/* Sessions List */}
      {loading ? (
        <div className="mva-loading">Загрузка...</div>
      ) : sessions.length === 0 ? (
        <div className="mva-empty">Голосований пока нет</div>
      ) : (
        <div className="mva-sessions">
          {sessions.map((s) => (
            <div key={s.id} className={`mva-session ${s.status}`}>
              <div className="mva-session-header">
                <div>
                  <h3>{s.title}</h3>
                  <span className={`mva-status mva-status-${s.status}`}>
                    {statusLabel(s.status)}
                  </span>
                </div>
                <div className="mva-session-dates">
                  <span>До: {new Date(s.ends_at).toLocaleString('ru-RU')}</span>
                </div>
              </div>

              <div className="mva-options-list">
                {s.options.map((opt) => (
                  <div
                    key={opt.id}
                    className={`mva-option-item ${opt.id === s.winner_option_id ? 'mva-option-winner' : ''}`}
                  >
                    {opt.image_url && (
                      <img
                        src={getImageUrl(opt.image_url)}
                        alt={opt.map_name}
                        className="mva-option-thumb"
                      />
                    )}
                    <div className="mva-option-details">
                      <span className="mva-option-name">{opt.map_name}</span>
                      {opt.map_seed && (
                        <span className="mva-option-meta">
                          Seed: {opt.map_seed} | Размер: {opt.map_size}
                        </span>
                      )}
                    </div>
                    <span className="mva-option-votes">{opt.vote_count} голосов</span>
                    {s.status === 'active' && (
                      <button
                        className="mva-btn-pick-winner"
                        onClick={() => handleClose(s.id, opt.id)}
                      >
                        Выбрать
                      </button>
                    )}
                    {opt.id === s.winner_option_id && (
                      <span className="mva-winner-badge">Победитель</span>
                    )}
                  </div>
                ))}
              </div>

              {s.status === 'active' && (
                <div className="mva-session-actions">
                  <button className="mva-btn-close" onClick={() => handleClose(s.id)}>
                    Закрыть (авто-выбор)
                  </button>
                  <button className="mva-btn-cancel" onClick={() => handleCancel(s.id)}>
                    Отменить
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Активно';
    case 'closed':
      return 'Закрыто';
    case 'cancelled':
      return 'Отменено';
    default:
      return status;
  }
}

export default MapVoteAdmin;
