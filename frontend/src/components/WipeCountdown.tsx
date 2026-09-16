import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { upcomingWipeInstants, isAnchorWipeInstant } from '../utils/wipeSchedule';
import './WipeCountdown.css';

/** Ближайший будущий вайп; самопересчёт после наступления. */
export function useNextWipe(): Date | null {
  const [wipeAt, setWipeAt] = useState<Date | null>(() => upcomingWipeInstants(new Date(), 1)[0] ?? null);

  useEffect(() => {
    if (!wipeAt) return;
    const id = window.setInterval(() => {
      if (Date.now() >= wipeAt.getTime()) {
        setWipeAt(upcomingWipeInstants(new Date(), 1)[0] ?? null);
      }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [wipeAt]);

  return wipeAt;
}

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function formatWipeDateMsk(wipeAt: Date): string {
  return wipeAt.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface WipeCountdownProps {
  /** home — компактный на главной, page — крупный на странице /wipe */
  variant?: 'home' | 'page';
}

function WipeCountdown({ variant = 'home' }: WipeCountdownProps) {
  const wipeAt = useNextWipe();
  const now = useNow(variant === 'page' ? 1000 : 1000);

  const totalSeconds = wipeAt ? Math.max(0, Math.floor((wipeAt.getTime() - now) / 1000)) : 0;
  const parts = {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };

  const isAnchor = wipeAt ? isAnchorWipeInstant(wipeAt) : false;

  return (
    <div className={`wipe-countdown wipe-countdown--${variant}`}>
      <div className="wipe-countdown-head">
        <span className="wipe-countdown-flame" aria-hidden="true">🔥</span>
        <div>
          <p className="wipe-countdown-label">До следующего вайпа</p>
          {wipeAt && (
            <p className="wipe-countdown-date">
              {formatWipeDateMsk(wipeAt)} МСК
              <span className={`wipe-countdown-kind${isAnchor ? ' anchor' : ''}`}>
                {isAnchor ? 'первый четверг' : 'через 10 дней'}
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="wipe-countdown-timer" role="timer" aria-label="Обратный отсчёт до вайпа">
        <div className="wipe-countdown-cell">
          <span className="wipe-countdown-value">{String(parts.days).padStart(2, '0')}</span>
          <span className="wipe-countdown-unit">
            {parts.days % 10 === 1 && parts.days % 100 !== 11 ? 'день' : [2, 3, 4].includes(parts.days % 10) && ![12, 13, 14].includes(parts.days % 100) ? 'дня' : 'дней'}
          </span>
        </div>
        <span className="wipe-countdown-sep">:</span>
        <div className="wipe-countdown-cell">
          <span className="wipe-countdown-value">{String(parts.hours).padStart(2, '0')}</span>
          <span className="wipe-countdown-unit">час</span>
        </div>
        <span className="wipe-countdown-sep">:</span>
        <div className="wipe-countdown-cell">
          <span className="wipe-countdown-value">{String(parts.minutes).padStart(2, '0')}</span>
          <span className="wipe-countdown-unit">мин</span>
        </div>
        <span className="wipe-countdown-sep">:</span>
        <div className="wipe-countdown-cell">
          <span className="wipe-countdown-value">{String(parts.seconds).padStart(2, '0')}</span>
          <span className="wipe-countdown-unit">сек</span>
        </div>
      </div>

      {variant === 'home' && (
        <Link to="/wipe" className="wipe-countdown-link">
          Расписание вайпов и уведомления →
        </Link>
      )}
    </div>
  );
}

export default WipeCountdown;
