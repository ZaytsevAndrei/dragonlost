import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import WipeCountdown from '../components/WipeCountdown';
import { usePageMeta } from '../hooks/usePageMeta';
import { TELEGRAM_URL } from '../constants/social';
import {
  upcomingWipeInstants,
  mapVoteWindowForWipe,
  isAnchorWipeInstant,
  WIPE_SCHEDULE_HINT_DEFAULT,
  MSK_TZ,
} from '../utils/wipeSchedule';
import './WipeSchedule.css';

const HINT =
  import.meta.env.VITE_WIPE_SCHEDULE_HINT?.trim() || WIPE_SCHEDULE_HINT_DEFAULT;

function formatDay(wipeAt: Date): string {
  return wipeAt.toLocaleDateString('ru-RU', {
    timeZone: MSK_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
}

function formatTime(wipeAt: Date): string {
  return wipeAt.toLocaleTimeString('ru-RU', {
    timeZone: MSK_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatVoteWindow(wipeAt: Date): string {
  const win = mapVoteWindowForWipe(wipeAt);
  const fmt = (d: Date) =>
    d.toLocaleString('ru-RU', {
      timeZone: MSK_TZ,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  return `${fmt(win.opensAt)} — ${fmt(win.endsAt)}`;
}

function WipeSchedule() {
  usePageMeta({
    title: 'Расписание вайпов — DragonLost | Rust сервер',
    description:
      'Когда вайп на Rust-сервере DragonLost: первый четверг месяца в 20:30 МСК и каждые 10 дней в 17:30 МСК. Обратный отсчёт, голосование за карту и уведомления в Telegram.',
    path: '/wipe',
  });

  const upcoming = useMemo(() => upcomingWipeInstants(new Date(), 6), []);

  return (
    <div className="wipe-schedule">
      <header className="wipe-schedule-header">
        <h1>Расписание вайпов</h1>
        <p className="wipe-schedule-subtitle">
          Игроки выбирают сервер в день вайпа — добавьте страницу в закладки и подпишитесь на уведомления.
        </p>
      </header>

      <WipeCountdown variant="page" />

      <section className="wipe-schedule-section">
        <h2>Ближайшие вайпы</h2>
        <div className="wipe-schedule-table-wrap">
          <table className="wipe-schedule-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Рестарт (МСК)</th>
                <th>Тип</th>
                <th>Голосование за карту</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((wipeAt) => {
                const anchor = isAnchorWipeInstant(wipeAt);
                return (
                  <tr key={wipeAt.getTime()} className={anchor ? 'is-anchor' : undefined}>
                    <td className="wipe-date-cell">{formatDay(wipeAt)}</td>
                    <td className="wipe-time-cell">{formatTime(wipeAt)}</td>
                    <td>
                      <span className={`wipe-type-badge${anchor ? ' anchor' : ''}`}>
                        {anchor ? 'Первый четверг' : 'Промежуточный'}
                      </span>
                    </td>
                    <td className="wipe-vote-cell">{formatVoteWindow(wipeAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="wipe-schedule-section">
        <h2>Как устроены вайпы</h2>
        <div className="wipe-rules">
          <div className="wipe-rule-card">
            <span className="wipe-rule-icon" aria-hidden="true">📅</span>
            <div>
              <h3>Первый четверг месяца</h3>
              <p>Полный вайп в 20:30 МСК. Голосование за карту открывается в среду в 15:00.</p>
            </div>
          </div>
          <div className="wipe-rule-card">
            <span className="wipe-rule-icon" aria-hidden="true">🔁</span>
            <div>
              <h3>Каждые 10 дней</h3>
              <p>Промежуточный вайп в 17:30 МСК. Если до следующего первого четверга меньше 5 дней — пропускается.</p>
            </div>
          </div>
          <div className="wipe-rule-card">
            <span className="wipe-rule-icon" aria-hidden="true">🗳️</span>
            <div>
              <h3>Карта — по голосованию</h3>
              <p>
                Перед каждым вайпом выбираем карту из случайных сидов.{' '}
                <Link to="/vote">Проголосовать →</Link>
              </p>
            </div>
          </div>
        </div>
        <p className="wipe-rules-hint">{HINT}</p>
      </section>

      <section className="wipe-schedule-section">
        <h2>Не пропусти вайп</h2>
        <div className="wipe-cta-grid">
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="wipe-cta-card"
          >
            <span className="wipe-cta-icon" aria-hidden="true">📣</span>
            <div>
              <h3>Telegram-канал</h3>
              <p>Автопост о каждом вайпе: дата, размер карты, сид и онлайн.</p>
            </div>
          </a>
          <div className="wipe-cta-card wipe-cta-card--static">
            <span className="wipe-cta-icon" aria-hidden="true">🤖</span>
            <div>
              <h3>Уведомления в боте</h3>
              <p>
                Откройте нашего Telegram-бота и отправьте{' '}
                <code className="wipe-cta-code">/subscribe</code> — напомним за 24 часа и за час до вайпа.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default WipeSchedule;
