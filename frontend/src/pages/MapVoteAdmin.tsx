import { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import './MapVoteAdmin.css';

interface MapOptionForm {
  map_name: string;
  map_seed: string;
  map_size: string;
  image_url: string;
  description: string;
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

const emptyOption = (): MapOptionForm => ({
  map_name: '',
  map_seed: '',
  map_size: '',
  image_url: '',
  description: '',
});

function MapVoteAdmin() {
  const { user } = useAuthStore();
  const [sessions, setSessions] = useState<VoteSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('Голосование за карту');
  const [endsAt, setEndsAt] = useState('');
  const [options, setOptions] = useState<MapOptionForm[]>([emptyOption(), emptyOption()]);
  const [creating, setCreating] = useState(false);

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

  const handleAddOption = () => {
    setOptions((prev) => [...prev, emptyOption()]);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleOptionChange = (index: number, field: keyof MapOptionForm, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, [field]: value } : o)));
  };

  const handleCreate = async () => {
    if (creating) return;
    if (!endsAt) {
      setError('Укажите дату окончания голосования');
      return;
    }
    const validOptions = options.filter((o) => o.map_name.trim());
    if (validOptions.length < 2) {
      setError('Необходимо минимум 2 варианта карт');
      return;
    }

    try {
      setCreating(true);
      setError(null);
      await api.post('/map-vote/sessions', {
        title,
        ends_at: new Date(endsAt).toISOString(),
        options: validOptions.map((o) => ({
          map_name: o.map_name.trim(),
          map_seed: o.map_seed ? parseInt(o.map_seed, 10) : null,
          map_size: o.map_size ? parseInt(o.map_size, 10) : null,
          image_url: o.image_url.trim() || null,
          description: o.description.trim() || null,
        })),
      });
      setShowForm(false);
      setTitle('Голосование за карту');
      setEndsAt('');
      setOptions([emptyOption(), emptyOption()]);
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

      {/* ─── Create Form ─── */}
      {showForm && (
        <div className="mva-form">
          <h3>Новое голосование</h3>

          <div className="mva-form-field">
            <label>Заголовок</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Голосование за карту" />
          </div>

          <div className="mva-form-field">
            <label>Окончание голосования</label>
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>

          <h4>Варианты карт</h4>
          {options.map((opt, i) => (
            <div key={i} className="mva-option-form">
              <div className="mva-option-row">
                <input type="text" placeholder="Название карты *" value={opt.map_name} onChange={(e) => handleOptionChange(i, 'map_name', e.target.value)} />
                <input type="number" placeholder="Seed" value={opt.map_seed} onChange={(e) => handleOptionChange(i, 'map_seed', e.target.value)} />
                <input type="number" placeholder="Размер (м)" value={opt.map_size} onChange={(e) => handleOptionChange(i, 'map_size', e.target.value)} />
                {options.length > 2 && (
                  <button className="mva-btn-remove" onClick={() => handleRemoveOption(i)} type="button">×</button>
                )}
              </div>
              <div className="mva-option-row">
                <input type="url" placeholder="URL изображения" value={opt.image_url} onChange={(e) => handleOptionChange(i, 'image_url', e.target.value)} />
                <input type="text" placeholder="Описание" value={opt.description} onChange={(e) => handleOptionChange(i, 'description', e.target.value)} />
              </div>
            </div>
          ))}

          <div className="mva-form-actions">
            <button className="mva-btn-add-option" onClick={handleAddOption} type="button">
              + Добавить вариант
            </button>
            <button className="mva-btn-submit" onClick={handleCreate} disabled={creating}>
              {creating ? 'Создание...' : 'Создать голосование'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Sessions List ─── */}
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
                  <span className={`mva-status mva-status-${s.status}`}>{statusLabel(s.status)}</span>
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
                    <span className="mva-option-name">{opt.map_name}</span>
                    <span className="mva-option-votes">{opt.vote_count} голосов</span>
                    {s.status === 'active' && (
                      <button className="mva-btn-pick-winner" onClick={() => handleClose(s.id, opt.id)}>
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
    case 'active': return 'Активно';
    case 'closed': return 'Закрыто';
    case 'cancelled': return 'Отменено';
    default: return status;
  }
}

export default MapVoteAdmin;
