import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, getImageUrl } from '../services/api';
import { MapVoteCards } from '../components/MapVote';
import { rustMapsUrlFromVoteOption } from '../utils/rustMaps';
import './Voting.css';

const WIPE_SCHEDULE_TEXT =
  import.meta.env.VITE_WIPE_SCHEDULE_HINT ||
  'Вайп сервера каждую среду в 18:00 по Москве (МСК).';

const MSK_TZ = 'Europe/Moscow';

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

function formatDayKeyRu(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  if (!y || !m || !d) return dayKey;
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function WinnerDescription({ text }: { text: string | null | undefined }) {
  if (!text?.trim()) return null;
  const t = text.trim();
  if (t.startsWith('http://') || t.startsWith('https://')) {
    return (
      <p className="wipe-cal-modal-desc">
        <a href={t} target="_blank" rel="noopener noreferrer" className="wipe-cal-modal-desc-link">
          Открыть ссылку
        </a>
      </p>
    );
  }
  return <p className="wipe-cal-modal-desc">{t}</p>;
}

function mskHourNow(): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: MSK_TZ, hour: 'numeric', hour12: false }).format(new Date())
  );
}

/** Ближайшие среды с вайпом в 18:00 МСК (до max штук вперёд). */
function scheduledFutureWipeDates(max: number): Date[] {
  const out: Date[] = [];
  const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const wd = d.getDay();
  let add = (3 - wd + 7) % 7;
  if (add === 0 && mskHourNow() >= 18) add = 7;
  d.setDate(d.getDate() + add);
  while (out.length < max) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return out;
}

type CalModal =
  | { mode: 'entries'; dayKey: string; entries: HistoryEntry[] }
  | { mode: 'estimate'; dayKey: string };

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
  const [modal, setModal] = useState<CalModal | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    if (!modal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [modal]);

  const shift = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  return (
    <>
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
            if (cell.kind === 'empty' || cell.key === null || cell.d === null) {
              return <div key={`e-${i}`} className="wipe-cal-cell wipe-cal-cell-empty" />;
            }
            const dayKey = cell.key;
            const hadWipe = wipeDays.has(dayKey);
            const estimates = estimatedKeys.has(dayKey);
            const list = wipeDays.get(dayKey);
            const inner = (
              <>
                <span className="wipe-cal-date-num">{cell.d}</span>
                {hadWipe && <span className="wipe-cal-dot wipe-cal-dot-past" />}
                {estimates && !hadWipe && <span className="wipe-cal-dot wipe-cal-dot-estimate" />}
              </>
            );
            if (hadWipe && list?.length) {
              return (
                <button
                  key={dayKey}
                  type="button"
                  className="wipe-cal-cell wipe-cal-cell-day wipe-cal-cell-past wipe-cal-cell-clickable"
                  aria-label={`Вайп ${cell.d}: открыть победившую карту`}
                  onClick={() => setModal({ mode: 'entries', dayKey, entries: list })}
                >
                  {inner}
                </button>
              );
            }
            if (estimates) {
              return (
                <button
                  key={dayKey}
                  type="button"
                  className="wipe-cal-cell wipe-cal-cell-day wipe-cal-cell-estimate wipe-cal-cell-clickable"
                  aria-label={`${cell.d}: запланированный вайп (среда 18:00 МСК)`}
                  onClick={() => setModal({ mode: 'estimate', dayKey })}
                >
                  {inner}
                </button>
              );
            }
            return (
              <div key={dayKey} className="wipe-cal-cell wipe-cal-cell-day">
                {inner}
              </div>
            );
          })}
        </div>
        <div className="wipe-cal-legend">
          <span>
            <span className="wipe-cal-dot wipe-cal-dot-past" /> вайп (нажмите для карты-победителя)
          </span>
          <span>
            <span className="wipe-cal-dot wipe-cal-dot-estimate" /> запланированный вайп — среда 18:00 МСК
          </span>
        </div>
      </div>

      {modal ? (
        <div
          className="wipe-cal-modal-backdrop"
          role="presentation"
          onClick={() => setModal(null)}
        >
          <div
            className="wipe-cal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wipe-cal-modal-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="wipe-cal-modal-head">
              <h3 id="wipe-cal-modal-title" className="wipe-cal-modal-title">
                {formatDayKeyRu(modal.dayKey)}
              </h3>
              <button
                ref={closeBtnRef}
                type="button"
                className="wipe-cal-modal-close"
                aria-label="Закрыть"
                onClick={() => setModal(null)}
              >
                ×
              </button>
            </div>
            <div className="wipe-cal-modal-body">
              {modal.mode === 'estimate' ? (
                <p className="wipe-cal-modal-estimate-text">{WIPE_SCHEDULE_TEXT}</p>
              ) : (
                modal.entries.map((e) => {
                  const url = e.winner ? rustMapsUrlFromVoteOption(e.winner) : null;
                  return (
                    <article key={e.id} className="wipe-cal-modal-entry">
                      <p className="wipe-cal-modal-session">{e.title}</p>
                      <div className="wipe-cal-modal-entry-body">
                        {e.winner?.image_url ? (
                          <img
                            className="wipe-cal-modal-img"
                            src={getImageUrl(e.winner.image_url)}
                            alt=""
                            onError={(ev) => {
                              (ev.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="wipe-cal-modal-img wipe-cal-modal-img-placeholder" />
                        )}
                        <div className="wipe-cal-modal-entry-text">
                          <div className="wipe-cal-modal-map">
                            {e.winner ? (
                              url ? (
                                <a href={url} target="_blank" rel="noopener noreferrer" className="wipe-cal-modal-link">
                                  {e.winner.map_name}
                                </a>
                              ) : (
                                e.winner.map_name
                              )
                            ) : (
                              <span className="wipe-cal-modal-unknown">Победитель не зафиксирован</span>
                            )}
                          </div>
                          <p className="wipe-cal-modal-meta">
                            {e.total_votes}{' '}
                            {e.total_votes === 1 ? 'голос' : e.total_votes < 5 ? 'голоса' : 'голосов'}
                            {e.winner?.map_size != null ? ` · карта ${e.winner.map_size}` : null}
                          </p>
                          <WinnerDescription text={e.winner?.description} />
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
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

  const estimatedFuture = useMemo(() => scheduledFutureWipeDates(8), []);

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
              ? 'Выберите карту для следующего цикла сервера. Один аккаунт Steam — один голос. История прошлых вайпов — в календаре ниже.'
              : 'Сейчас голосования нет. История победивших карт — в календаре: нажмите на отмеченный день.'}
          </p>
        </div>
      </header>

      {loading ? (
        <div className="voting-loading">Загрузка…</div>
      ) : (
        <>
          {hasActiveVote && session ? (
            <MapVoteCards
              session={session}
              options={options}
              userVote={userVote}
              onRefresh={async () => {
                await loadActive();
                await loadHistory();
              }}
            />
          ) : null}

          <section className="voting-section">
            <h2 className="voting-section-title">
              {hasActiveVote ? 'История победивших карт' : 'Календарь вайпов и победивших карт'}
            </h2>
            <div className="voting-hint">
              <p className="voting-hint-main">{WIPE_SCHEDULE_TEXT}</p>
              <p className="voting-hint-cal">
                Зелёная отметка — состоявшийся вайп: нажмите день, чтобы открыть карту-победителя и описание. Синяя
                пунктирная — запланированный вайп по расписанию (среда, 18:00 МСК).
              </p>
            </div>
            {history.length === 0 ? (
              <p className="voting-empty">
                Пока нет завершённых голосований — в календаре отмечены ближайшие среды с вайпом в 18:00 МСК.
              </p>
            ) : null}
            <WipeCalendar history={history} estimatedFuture={estimatedFuture} />
          </section>
        </>
      )}
    </div>
  );
}

export default Voting;
