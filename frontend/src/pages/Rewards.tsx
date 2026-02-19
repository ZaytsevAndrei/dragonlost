import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { saveLastPage } from '../utils/safeLocalStorage';
import './Rewards.css';

interface RandomPoolEntry {
  amount: number;
  chance: number;
}

interface DailyRewardStatus {
  available: boolean;
  current_streak: number;
  longest_streak: number;
  total_claims: number;
  next_reward: number | null;
  is_random: boolean;
  seconds_until_available: number;
  reward_first_week: number[];
  reward_random_pool: RandomPoolEntry[];
}

interface ClaimResult {
  success: boolean;
  reward: number;
  current_streak: number;
  longest_streak: number;
  new_balance: number;
}

function getStreakHue(streak: number): number {
  const step = Math.min(Math.max(streak, 0), 7);
  return Math.round(4 + (step / 7) * 141);
}

function pluralDays(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 19) return 'дней';
  if (last === 1) return 'день';
  if (last >= 2 && last <= 4) return 'дня';
  return 'дней';
}

function Rewards() {
  const { user, loading: authLoading } = useAuthStore();
  const navigate = useNavigate();
  const [status, setStatus] = useState<DailyRewardStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/');
      return;
    }
    saveLastPage('/rewards');
    fetchStatus();
  }, [user, authLoading, navigate]);

  // Таймер обратного отсчёта
  useEffect(() => {
    if (countdown <= 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // Когда таймер дошёл до нуля — обновляем статус
      if (status && !status.available) {
        fetchStatus();
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [countdown > 0]);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/rewards/daily');
      const data: DailyRewardStatus = response.data;
      setStatus(data);
      setCountdown(data.seconds_until_available);
      setError(null);
    } catch {
      setError('Не удалось загрузить статус награды');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClaim = async () => {
    if (claiming) return;
    try {
      setClaiming(true);
      setClaimResult(null);
      const response = await api.post('/rewards/daily/claim');
      const result: ClaimResult = response.data;
      setClaimResult(result);
      // Обновляем статус после получения
      fetchStatus();
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Ошибка при получении награды';
      setError(msg);
    } finally {
      setClaiming(false);
    }
  };

  const formatCountdown = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (authLoading || !user) {
    return (
      <div className="rewards">
        <h1>Ежедневная награда</h1>
        <div className="loading">Загрузка...</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rewards">
        <h1>Ежедневная награда</h1>
        <div className="loading">Загрузка...</div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="rewards">
        <h1>Ежедневная награда</h1>
        <div className="error">{error}</div>
        <button onClick={fetchStatus} className="btn-retry">
          Попробовать снова
        </button>
      </div>
    );
  }

  const firstWeek = status?.reward_first_week || [];
  const randomPool = status?.reward_random_pool || [];
  const isRandom = status?.is_random ?? false;

  return (
    <div className="rewards">
      <div className="rewards-header">
        <h1>🎁 Ежедневная награда</h1>
        <p className="rewards-subtitle">
          Заходите каждый день и получайте бонусные монеты! Чем длиннее серия — тем больше награда.
        </p>
      </div>

      {/* Результат получения */}
      {claimResult && (
        <div className="claim-result">
          <div className="claim-result-icon">🎉</div>
          <div className="claim-result-text">
            <div className="claim-result-title">Награда получена!</div>
            <div className="claim-result-amount">+{claimResult.reward} монет</div>
            <div className="claim-result-balance">
              Ваш баланс: {claimResult.new_balance.toFixed(2)} монет
            </div>
          </div>
        </div>
      )}

      {error && status && (
        <div className="reward-error">{error}</div>
      )}

      {/* Основная карточка */}
      <div className="reward-main-card">
        <div className="reward-streak-info">
          <div
            className="streak-badge"
            style={{ '--streak-hue': getStreakHue(status?.current_streak || 0) } as React.CSSProperties}
          >
            <span className="streak-number">{status?.current_streak || 0}</span>
            <span className="streak-label">{pluralDays(status?.current_streak || 0)} подряд</span>
          </div>
          <div className="streak-stats">
            <div className="stat-item">
              <span className="stat-value">{status?.longest_streak || 0}</span>
              <span className="stat-label">рекорд</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{status?.total_claims || 0}</span>
              <span className="stat-label">всего наград</span>
            </div>
          </div>
        </div>

        <div className="reward-action">
          {status?.available ? (
            <>
              <div className="next-reward-label">Ваша награда сегодня:</div>
              {isRandom ? (
                <div className="next-reward-amount random">🎲 ???</div>
              ) : (
                <div className="next-reward-amount">{status.next_reward} монет</div>
              )}
              <button
                className="btn-claim"
                onClick={handleClaim}
                disabled={claiming}
              >
                {claiming ? 'Получение...' : isRandom ? '🎲 Испытать удачу' : '🎁 Забрать награду'}
              </button>
            </>
          ) : (
            <>
              <div className="next-reward-label">Следующая награда через:</div>
              <div className="countdown-timer">{formatCountdown(countdown)}</div>
              <div className="next-reward-preview">
                {isRandom ? 'Награда: случайная' : `Награда: ${status?.next_reward} монет`}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Шкала наград по дням */}
      <div className="reward-schedule">
        <h2>Шкала наград</h2>

        <h3 className="schedule-section-title">Первая неделя</h3>
        <div className="schedule-grid schedule-grid-week">
          {firstWeek.map((amount, index) => {
            const day = index + 1;
            const isCurrent = status ? day === (status.current_streak + 1) && status.available && !isRandom : false;
            const isCompleted = status ? day <= status.current_streak : false;

            return (
              <div
                key={day}
                className={`schedule-day ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}
              >
                <div className="day-number">День {day}</div>
                <div className="day-icon">
                  {isCompleted ? '✅' : isCurrent ? '🎁' : '🔒'}
                </div>
                <div className="day-amount">{amount}</div>
                <div className="day-currency">монет</div>
              </div>
            );
          })}
        </div>

        <h3 className="schedule-section-title">
          С 8-го дня — случайная награда 🎲
        </h3>
        <div className="schedule-grid">
          {randomPool.map((entry) => (
            <div
              key={entry.amount}
              className={`schedule-day random-day ${isRandom && status?.available ? 'current' : ''}`}
            >
              <div className="day-chance">{entry.chance}%</div>
              <div className="day-icon">🎲</div>
              <div className="day-amount">{entry.amount}</div>
              <div className="day-currency">монет</div>
            </div>
          ))}
        </div>
      </div>

      {/* Правила */}
      <div className="reward-rules">
        <h3>Как это работает</h3>
        <ul>
          <li>Награда обновляется каждый день в 00:00 по московскому времени</li>
          <li>Первые 7 дней — награда растёт каждый день</li>
          <li>С 8-го дня — случайная награда от {Math.min(...randomPool.map(e => e.amount))} до {Math.max(...randomPool.map(e => e.amount))} монет</li>
          <li>Пропуск дня сбрасывает серию на начало</li>
          <li>Монеты начисляются на ваш баланс мгновенно</li>
        </ul>
      </div>
    </div>
  );
}

export default Rewards;
