import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getImageUrl } from '../services/api';
import { MapVoteCards } from '../components/MapVote';
import { rustMapsUrlFromVoteOption } from '../utils/rustMaps';
import './Voting.css';

const WIPE_HINT =
  import.meta.env.VITE_WIPE_SCHEDULE_HINT ||
  'Обычно вайп по расписанию сервера — точное время смотрите в Discord и объявлениях.';

export interface HistoryWinner {
  map_name: string;
  map_seed: number | null;
  map_size: number | null;
  image_url: string | null;
  description: string | null;
}

export interface HistoryEntry {
  id: number;
  title: string;
  ends_at: string;
  total_votes: number;
  winner: HistoryWinner | null;
}

const MONTHS_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const WD_RU = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

function dayKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function estimateFutureWipeDates(entries: HistoryEntry[], max: number): Date[] {
  if (entries.length === 0) return [];
  const sorted = [...entries].sort(
    (a, b) => new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime()
  );
  const last = new Date(sorted[sorted.length - 1].ends_at);
  let deltaMs = 7 * 86400000;
  if (sorted.length >= 2) {
    const deltas: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      deltas.push(new Date(sorted[i].ends_at).getTime() - new Date(sorted[i - 1].ends_at).getTime());
    }
    deltaMs = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    if (!Number.isFinite(deltaMs) || deltaMs < 86400000) deltaMs = 7 * 86400000;
  }
  const out: Date[] = [];
  let cursor = new Date(last.getTime() + deltaMs);
  const now = Date.now();
  const yearCap = new Date(last.getTime() + 400 * 86400000).getTime();
  while (out.length < max && cursor.getTime() < yearCap) {
    if (cursor.getTime() > now) out.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + deltaMs);
  }
  return out;
}

function WipeCalendar({
  history,
  estimatedFuture,
}: {
  history: HistoryEntry[];
  estimatedFuture: Date[];
}) {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });

  const wipeDays = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>();
    for (const e of history) {
      const k = dayKeyLocal(new Date(e.ends_at));
      const list = map.get(k) || [];
      list.push(e);
      map.set(k, list);
    }
    return map;
  }, [history]);

  const estimatedKeys = useMemo(
    () => new Set(estimatedFuture.map((d) => dayKeyLocal(d))),
    [estimatedFuture]
  );

  const { gridDays, labelMonth } = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const last = new Date(cursor.y, cursor.m + 1, 0);
    const pad = (first.getDay() + 6) % 7;
    const daysInMonth = last.getDate();
    const cells: { d: number | null; key: string | null; kind: 'empty' | 'day' }[] = [];
    for (let i = 0; i < pad; i++) cells.push({ d: null, key: null, kind: 'empty' });
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(cursor.y, cursor.m, d);
      cells.push({ d, key: dayKeyLocal(dt), kind: 'day' });
    }
    while (cells.length % 7 !== 0) cells.push({ d: null, key: null, kind: 'empty' });
    return { gridDays: cells, labelMonth: `${MONTHS_RU[cursor.m]} ${cursor.y}` };
  }, [cursor]);

  const shift = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  return (
    <div className="wipe-cal">
      <div className="wipe-cal-toolbar">
        <button type="button" className="wipe-cal-nav" onClick={() => shift(-1)} aria-label="Предыдущий месяц">
          ‹
        </button>
        <h3 className="wipe-cal-title">{labelMonth}</h3>
        <button type="button" className="wipe-cal-nav" onClick={() => shift(1)} aria-label="Следующий месяц">
          ›
        </button>
      </div>
      <div className="wipe-cal-weekdays">
        {WD_RU.map((w) => (
          <span key={w} className="wipe-cal-wd">
            {w}
          </span>
        ))}
      </div>
      <div className="wipe-cal-grid">
        {gridDays.map((cell, i) => {
          if (cell.kind === 'empty' || cell.key === null) {
            return <div key={`e-${i}`} className="wipe-cal-cell wipe-cal-cell-empty" />;
          }
          const hadWipe = wipeDays.has(cell.key);
          const estimates = estimatedKeys.has(cell.key);
          const list = wipeDays.get(cell.key);
          const title =
            hadWipe && list?.length
              ? list
                  .map((e) => (e.winner ? e.winner.map_name : e.title))
                  .filter(Boolean)
                  .join('; ')
              : estimates
                ? 'Предполагаемая дата вайпа (оценка по интервалу прошлых голосований)'
                : undefined;
          return (
            <div
              key={cell.key}
              className={`wipe-cal-cell wipe-cal-cell-day ${
                hadWipe ? 'wipe-cal-cell-past' : ''
              } ${estimates ? 'wipe-cal-cell-estimate' : ''}`}
              title={title}
            >
              <span className="wipe-cal-date-num">{cell.d}</span>
              {hadWipe && <span className="wipe-cal-dot wipe-cal-dot-past" />}
              {estimates && !hadWipe && <span className="wipe-cal-dot wipe-cal-dot-estimate" />}
            </div>
          );
        })}
      </div>
      <div className="wipe-cal-legend">
        <span>
          <span className="wipe-cal-dot wipe-cal-dot-past" /> вайп состоялся (есть запись голосования)
        </span>
        <span>
          <span className="wipe-cal-dot wipe-cal-dot-estimate" /> ориентировочная дата
        </span>
      </div>
    </div>
  );
}

function Voting() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<{
    id: number;
    title: string;
    starts_at: string;
    ends_at: string;
    status: string;
    total_votes: number;
  } | null>(null);
  const [options, setOptions] = useState<
    {
      id: number;
      map_name: string;
      map_seed: number | null;
      map_size: number | null;
      image_url: string | null;
      description: string | null;
      vote_count: number;
      percentage: number;
    }[]
  >([]);
  const [userVote, setUserVote] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const loadActive = useCallback(async () => {
    const res = await api.get('/map-vote/active');
    setSession(res.data.session);
    setOptions(res.data.options || []);
    setUserVote(res.data.user_vote ?? null);
  }, []);

  const loadHistory = useCallback(async () => {
    const res = await api.get<{ entries: HistoryEntry[] }>('/map-vote/history', { params: { limit: 200 } });
    setHistory(res.data.entries || []);
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadActive(), loadHistory()]);
  }, [loadActive, loadHistory]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await refresh();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const hasActiveVote = Boolean(session && options.length > 0);

  const estimatedFuture = useMemo(() => estimateFutureWipeDates(history, 6), [history]);

  return (
    <div className="voting-page">
      <header className="voting-header">
        <div className="voting-header-icon" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="40" height="40">
            <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
            <path d="M8 2v16" />
            <path d="M16 6v16" />
          </svg>
        </div>
        <div>
          <h1 className="voting-title">Голосование и вайпы</h1>
          <p className="voting-subtitle">
            {hasActiveVote
              ? 'Выберите карту для следующего цикла сервера. Один аккаунт Steam — один голос.'
              : 'Сейчас голосования нет. Ниже — календарь и история карт по прошлым вайпам.'}
          </p>
        </div>
      </header>

      {loading ? (
        <div className="voting-loading">Загрузка…</div>
      ) : hasActiveVote && session ? (
        <MapVoteCards
          session={session}
          options={options}
          userVote={userVote}
          onRefresh={async () => {
            await loadActive();
            await loadHistory();
          }}
        />
      ) : (
        <>
          <section className="voting-section">
            <h2 className="voting-section-title">Расписание вайпов</h2>
            <p className="voting-hint">{WIPE_HINT}</p>
            <WipeCalendar history={history} estimatedFuture={estimatedFuture} />
          </section>

          <section className="voting-section">
            <h2 className="voting-section-title">История: какая карта побеждала</h2>
            {history.length === 0 ? (
              <p className="voting-empty">Пока нет завершённых голосований — история появится после первых вайпов.</p>
            ) : (
              <ul className="wipe-history-list">
                {history.map((e) => {
                  const url = e.winner ? rustMapsUrlFromVoteOption(e.winner) : null;
                  const when = new Date(e.ends_at);
                  const dateStr = when.toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  });
                  return (
                    <li key={e.id} className="wipe-history-item">
                      <div className="wipe-history-date">{dateStr}</div>
                      <div className="wipe-history-body">
                        {e.winner?.image_url ? (
                          <img
                            className="wipe-history-thumb"
                            src={getImageUrl(e.winner.image_url)}
                            alt=""
                            onError={(ev) => {
                              (ev.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="wipe-history-thumb wipe-history-thumb-placeholder" />
                        )}
                        <div>
                          <div className="wipe-history-map">
                            {e.winner ? (
                              url ? (
                                <a href={url} target="_blank" rel="noopener noreferrer" className="wipe-history-link">
                                  {e.winner.map_name}
                                </a>
                              ) : (
                                e.winner.map_name
                              )
                            ) : (
                              <span className="wipe-history-unknown">Победитель не зафиксирован</span>
                            )}
                          </div>
                          <div className="wipe-history-meta">
                            {e.total_votes} {e.total_votes === 1 ? 'голос' : e.total_votes < 5 ? 'голоса' : 'голосов'}
                            {e.winner?.map_size != null ? ` · maps ${e.winner.map_size}` : null}
                          </div>
                          {e.winner?.description && !e.winner.description.startsWith('http') && (
                            <p className="wipe-history-desc">{e.winner.description}</p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default Voting;
