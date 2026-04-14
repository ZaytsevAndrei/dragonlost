import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ServerStatus from '../components/ServerStatus';
import './Home.css';

interface DailyRewardStatus {
  available: boolean;
  current_streak: number;
  next_reward: number | null;
  is_random: boolean;
  seconds_until_available: number;
}

function useAnimateOnScroll() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('animate-visible');
          observer.unobserve(el);
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}

function AnimatedSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useAnimateOnScroll();
  return (
    <div ref={ref} className={`animate-section ${className}`}>
      {children}
    </div>
  );
}

function pluralDays(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 19) return 'дней';
  if (last === 1) return 'день';
  if (last >= 2 && last <= 4) return 'дня';
  return 'дней';
}

function Home() {
  const { user } = useAuthStore();
  const [rewardStatus, setRewardStatus] = useState<DailyRewardStatus | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimAmount, setClaimAmount] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;
    api.get('/rewards/daily').then(res => {
      setRewardStatus(res.data);
      setCountdown(res.data.seconds_until_available || 0);
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (countdown <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [countdown > 0]);

  const handleClaim = useCallback(async () => {
    if (claiming) return;
    try {
      setClaiming(true);
      const res = await api.post('/rewards/daily/claim');
      setClaimAmount(res.data.reward);
      const statusRes = await api.get('/rewards/daily');
      setRewardStatus(statusRes.data);
      setCountdown(statusRes.data.seconds_until_available || 0);
    } catch {
      // ignore
    } finally {
      setClaiming(false);
    }
  }, [claiming]);

  const formatCountdown = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="home">
      {/* ===== FEATURE CARDS ===== */}
      <AnimatedSection>
        <div className="features">
          <Link to="/stats" className="feature-card feature-card-link">
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>
            </div>
            <h3>Статистика</h3>
            <p>Подробная статистика игроков: убийства, смерти, K/D и многое другое</p>
          </Link>

          {user && rewardStatus ? (
            <div className="feature-card feature-card-reward">
              <div className="feature-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v10H4V12" /><path d="M2 7h20v5H2z" /><path d="M12 22V7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>
              </div>
              <h3>Ежедневная награда</h3>
              <p className="feature-reward-meta">
                Серия: <strong>{rewardStatus.current_streak}</strong> {pluralDays(rewardStatus.current_streak)}
              </p>
              {claimAmount !== null ? (
                <div className="feature-reward-claimed">+{claimAmount} рублей</div>
              ) : rewardStatus.available ? (
                <button className="btn-home-claim" onClick={handleClaim} disabled={claiming}>
                  {claiming ? 'Получение...' : rewardStatus.is_random ? 'Испытать удачу' : `Забрать ${rewardStatus.next_reward} рублей`}
                </button>
              ) : (
                <div className="feature-reward-timer">{formatCountdown(countdown)}</div>
              )}
              <Link to="/rewards" className="feature-card-inline-link">Подробнее →</Link>
            </div>
          ) : (
            <Link to="/rewards" className="feature-card feature-card-link">
              <div className="feature-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v10H4V12" /><path d="M2 7h20v5H2z" /><path d="M12 22V7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>
              </div>
              <h3>Ежедневная награда</h3>
              <p>Авторизуйтесь и получайте награду каждый день за серию входов</p>
            </Link>
          )}

          <a
            href="https://discord.gg/NSPuBH4mZJ"
            target="_blank"
            rel="noopener noreferrer"
            className="feature-card feature-card-link feature-card-discord"
          >
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24" fill="currentColor" width="30" height="30">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </div>
            <h3>Присоединяйся к Discord</h3>
            <p>Общайся с игроками, следи за новостями и будь в курсе событий</p>
          </a>
        </div>
      </AnimatedSection>

      {/* ===== SERVER STATUS ===== */}
      <AnimatedSection>
        <ServerStatus />
      </AnimatedSection>

    </div>
  );
}

export default Home;
