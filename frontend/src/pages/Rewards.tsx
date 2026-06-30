import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { saveLastPage } from '../utils/safeLocalStorage';
import StatePanel from '../components/StatePanel';
import { DailyRewardWheel, type WheelSpinTarget } from '../components/DailyRewardWheel';
import { DAILY_REWARD_WHEEL_SUMMARY } from '../constants/dailyRewardWheel';
import './Rewards.css';

interface WheelSummaryEntry {
  amount: number;
  count: number;
  rustMultiplier: number;
  tier: string;
}

interface DailyRewardStatus {
  available: boolean;
  current_streak: number;
  longest_streak: number;
  total_claims: number;
  seconds_until_available: number;
  wheel_sectors: number[];
  wheel_summary: WheelSummaryEntry[];
}

interface ClaimResult {
  success: boolean;
  reward: number;
  wheel_sector_index: number;
  current_streak: number;
  longest_streak: number;
  new_balance: number;
}

const TIER_LABELS: Record<string, string> = {
  yellow: '×1 — очень низкая',
  green: '×3 — низкая',
  blue: '×5 — средняя',
  purple: '×10 — высокая',
  red: '×20 — очень высокая',
};

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
  const [spinTarget, setSpinTarget] = useState<WheelSpinTarget | null>(null);
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

  useEffect(() => {
    if (countdown <= 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (status && !status.available) {
        fetchStatus();
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
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

  const handleSpinRequest = async () => {
    if (claiming || !status?.available) return;
    try {
      setClaiming(true);
      setClaimResult(null);
      setError(null);
      const response = await api.post('/rewards/daily/claim');
      const result: ClaimResult = response.data;
      setSpinTarget({ sectorIndex: result.wheel_sector_index, reward: result.reward });
      setClaimResult(result);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setError(msg || 'Ошибка при вращении колеса');
      setClaiming(false);
    }
  };

  const handleSpinComplete = useCallback(() => {
    setClaiming(false);
    void fetchStatus();
  }, [fetchStatus]);

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
        <StatePanel type="loading" title="Загрузка награды" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rewards">
        <h1>Ежедневная награда</h1>
        <StatePanel type="loading" title="Загрузка награды" />
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="rewards">
        <h1>Ежедневная награда</h1>
        <StatePanel
          type="error"
          title="Не удалось загрузить ежедневную награду"
          message={error}
          actionLabel="Попробовать снова"
          onAction={fetchStatus}
        />
      </div>
    );
  }

  const wheelSummary = status?.wheel_summary?.length ? status.wheel_summary : DAILY_REWARD_WHEEL_SUMMARY;

  return (
    <div className="rewards">
      <div className="rewards-header">
        <h1>Ежедневная награда</h1>
        <p className="rewards-subtitle">
          Крутите колесо раз в день — как в казино Bandit Camp в Rust. 25 секторов, награда в рублях на баланс.
        </p>
      </div>

      {claimResult && !claiming && (
        <div className="claim-result" role="status" aria-live="polite">
          <div className="claim-result-icon">🎉</div>
          <div className="claim-result-text">
            <div className="claim-result-title">Выпало!</div>
            <div className="claim-result-amount">+{claimResult.reward} рублей</div>
            <div className="claim-result-balance">
              Баланс: {claimResult.new_balance.toFixed(2)} рублей · серия {claimResult.current_streak}{' '}
              {pluralDays(claimResult.current_streak)}
            </div>
          </div>
        </div>
      )}

      {error && status && <div className="reward-error">{error}</div>}

      <div className="reward-main-card reward-main-card-wheel">
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
              <span className="stat-label">всего спинов</span>
            </div>
          </div>
        </div>

        <div className="reward-wheel-wrap">
          <DailyRewardWheel
            available={!!status?.available}
            countdownLabel={formatCountdown(countdown)}
            spinTarget={spinTarget}
            disabled={claiming}
            onSpinRequest={() => void handleSpinRequest()}
            onSpinComplete={handleSpinComplete}
          />
        </div>
      </div>

      <div className="reward-schedule">
        <h2>Секторы колеса (25)</h2>
        <p className="reward-schedule-desc">
          Распределение как на большом колесе в Rust: ×1 — 12 секторов, ×3 — 6, ×5 — 4, ×10 — 2, ×20 — 1.
        </p>
        <div className="wheel-legend">
          {wheelSummary.map((entry) => (
            <div key={entry.amount} className={`wheel-legend-item wheel-legend-${entry.tier}`}>
              <span className="wheel-legend-mult">×{entry.rustMultiplier}</span>
              <span className="wheel-legend-amount">{entry.amount} ₽</span>
              <span className="wheel-legend-meta">
                {entry.count} сек. · {TIER_LABELS[entry.tier] || entry.tier}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="reward-rules">
        <h3>Как это работает</h3>
        <ul>
          <li>Одно вращение в сутки — отсчёт с 00:00 по Москве</li>
          <li>Нажмите на колесо, дождитесь остановки — рубли зачисляются сразу</li>
          <li>Серия дней сохраняется при ежедневном входе; пропуск сбрасывает счётчик</li>
          <li>Результат определяет сервер — анимация совпадает с выпавшим сектором</li>
        </ul>
      </div>
    </div>
  );
}

export default Rewards;
