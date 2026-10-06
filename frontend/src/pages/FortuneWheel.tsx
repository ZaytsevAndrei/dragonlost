import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getImageUrl } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { saveLastPage } from '../utils/safeLocalStorage';
import StatePanel from '../components/StatePanel';
import { FortuneWheelReel } from '../components/FortuneWheelReel';
import { CheckIcon, CopyIcon, PixelCrateIcon } from '../components/FortuneWheelIcons';
import {
  FORTUNE_WHEEL_RARITY_COLORS,
  FORTUNE_WHEEL_RARITY_LABELS,
  RARITY_EMOJI,
  type FortuneWheelPrize,
  type FortuneWheelRarity,
} from '../constants/fortuneWheel';
import './FortuneWheel.css';

interface WheelStatus {
  available: boolean;
  seconds_until_available: number;
  tag_verified: boolean;
  total_spins: number;
}

interface WheelPrizesResponse {
  cooldown_hours: number;
  nickname_tag: string;
  prizes: FortuneWheelPrize[];
}

interface RecentWin {
  player_name: string;
  player_avatar: string;
  prize_name: string;
  prize_image_url: string | null;
  prize_rarity: FortuneWheelRarity;
  created_at: string;
}

interface SpinResponse {
  success: boolean;
  prize: {
    id: number;
    name: string;
    description: string | null;
    rarity: FortuneWheelRarity;
    image_url: string | null;
    quantity: number;
  };
  wheel_sector_index: number;
  total_spins: number;
  seconds_until_available: number;
}

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatTimeAgo(value: string): string {
  const diffMin = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин. назад`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ч. назад`;
  return `${Math.floor(diffHours / 24)} дн. назад`;
}

function FortuneWheel() {
  const { user, loading: authLoading } = useAuthStore();
  const API_URL = import.meta.env.VITE_API_URL || '/api';

  const [config, setConfig] = useState<WheelPrizesResponse | null>(null);
  const [status, setStatus] = useState<WheelStatus | null>(null);
  const [wins, setWins] = useState<RecentWin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [countdown, setCountdown] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<SpinResponse | null>(null);
  const [spinTarget, setSpinTarget] = useState<{ sectorIndex: number } | null>(null);

  const [tagChecking, setTagChecking] = useState(false);
  const [tagMessage, setTagMessage] = useState<string | null>(null);
  const [tagNickname, setTagNickname] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const winsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingResultRef = useRef<SpinResponse | null>(null);

  const nicknameTag = config?.nickname_tag ?? 'dragonlost.ru';

  const fetchWins = useCallback(async () => {
    try {
      const response = await api.get<{ wins: RecentWin[] }>('/wheel/recent-wins');
      setWins(response.data.wins || []);
    } catch {
      // Лента не критична — тихо оставляем предыдущее состояние.
    }
  }, []);

  const fetchStatus = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!user) return;
    try {
      if (!silent) setLoading(true);
      const response = await api.get<WheelStatus>('/wheel/status');
      setStatus(response.data);
      setCountdown(response.data.seconds_until_available);
      setError(null);
    } catch {
      if (!silent) setError('Не удалось загрузить статус колеса');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    saveLastPage('/wheel');
    let cancelled = false;
    (async () => {
      try {
        const response = await api.get<WheelPrizesResponse>('/wheel/prizes');
        if (!cancelled) setConfig(response.data);
      } catch {
        if (!cancelled) setError('Не удалось загрузить призы колеса');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    void fetchWins();
    winsTimerRef.current = setInterval(() => void fetchWins(), 30000);
    return () => {
      cancelled = true;
      if (winsTimerRef.current) clearInterval(winsTimerRef.current);
    };
  }, [fetchWins]);

  useEffect(() => {
    if (!authLoading) void fetchStatus();
  }, [authLoading, fetchStatus]);

  useEffect(() => {
    if (countdown <= 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (status && !status.available) {
        void fetchStatus({ silent: true });
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

  const handleSpin = async () => {
    if (spinning || !status?.available || !status?.tag_verified) return;
    try {
      setSpinning(true);
      setSpinResult(null);
      setError(null);
      setTagMessage(null);
      const response = await api.post<SpinResponse>('/wheel/spin');
      pendingResultRef.current = response.data;
      setSpinTarget({ sectorIndex: response.data.wheel_sector_index });
    } catch (err: unknown) {
      const data = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: SpinResponse & { error?: string; tag_verified?: boolean; nickname?: string; seconds_until_available?: number } } }).response?.data
        : undefined;

      if (data?.tag_verified === false) {
        setStatus((prev) => (prev ? { ...prev, tag_verified: false } : prev));
        setTagNickname(data.nickname ?? null);
        setTagMessage(`В нике «${data.nickname ?? '—'}» метка не найдена. Добавьте её и проверьте снова.`);
      } else if (typeof data?.seconds_until_available === 'number' && data.seconds_until_available > 0) {
        setStatus((prev) => (prev ? { ...prev, available: false } : prev));
        setCountdown(data.seconds_until_available);
        setError(data.error ?? 'Колесо уже крутилось недавно');
      } else {
        setError(data?.error ?? 'Ошибка при вращении колеса');
      }
      setSpinning(false);
    }
  };

  const handleSpinComplete = useCallback(() => {
    setSpinTarget(null);
    setSpinning(false);
    setSpinResult(pendingResultRef.current);
    pendingResultRef.current = null;
    void fetchStatus({ silent: true });
    void fetchWins();
  }, [fetchStatus, fetchWins]);

  const handleCheckTag = async () => {
    try {
      setTagChecking(true);
      setTagMessage(null);
      const response = await api.post<{ tag_verified: boolean; nickname: string }>('/wheel/check-tag');
      setTagNickname(response.data.nickname);
      setStatus((prev) => (prev ? { ...prev, tag_verified: response.data.tag_verified } : prev));
      setTagMessage(
        response.data.tag_verified
          ? `Метка найдена в нике «${response.data.nickname}» — можно крутить!`
          : `В нике «${response.data.nickname}» метка не найдена. Добавьте её в Steam и повторите проверку.`
      );
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null;
      setTagMessage(msg ?? 'Не удалось проверить ник. Попробуйте позже.');
    } finally {
      setTagChecking(false);
    }
  };

  const handleCopyTag = async () => {
    try {
      await navigator.clipboard.writeText(nicknameTag);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard может быть недоступен — метку можно скопировать вручную
    }
  };

  const handleLogin = () => {
    window.location.href = `${API_URL}/auth/steam`;
  };

  const prizes = config?.prizes ?? [];
  const wheelAvailable = !!status?.available && !!status?.tag_verified;
  const spinBlockedReason = !user
    ? null
    : !status?.tag_verified
      ? 'Добавьте метку в ник Steam'
      : !status?.available
        ? `Следующее вращение через ${formatCountdown(countdown)}`
        : null;

  if (loading && !config) {
    return (
      <div className="fortune-wheel">
        <h1>Колесо удачи</h1>
        <StatePanel type="loading" title="Загрузка колеса" />
      </div>
    );
  }

  if (!config && error) {
    return (
      <div className="fortune-wheel">
        <h1>Колесо удачи</h1>
        <StatePanel
          type="error"
          title="Не удалось загрузить колесо"
          message={error}
          actionLabel="Попробовать снова"
          onAction={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="fortune-wheel">
      <div className="fw-page-header">
        <span className="fw-page-badge">Колесо удачи</span>
        <h1>Бесплатный шанс раз в сутки</h1>
        <p className="fw-page-subtitle">
          Испытайте удачу — раз в {config?.cooldown_hours ?? 24} часа можно бесплатно крутить колесо.
          Приз зачисляется на ваш аккаунт автоматически — заберите его, находясь в игре, на странице{' '}
          <Link to="/inventory">«Инвентарь»</Link> на сайте.
        </p>
      </div>

      {error && <div className="fw-error">{error}</div>}

      <div className="fw-main-card">
        <div className="fw-wheel-wrap">
          <FortuneWheelReel
            prizes={prizes}
            available={wheelAvailable}
            countdownLabel={formatCountdown(countdown)}
            spinTarget={spinTarget}
            disabled={spinning || !user}
            onSpinRequest={() => void handleSpin()}
            onSpinComplete={handleSpinComplete}
          />
        </div>

        <div className="fw-actions">
          {user ? (
            <>
              <button
                type="button"
                className="fw-spin-button"
                disabled={!wheelAvailable || spinning}
                onClick={() => void handleSpin()}
              >
                {spinning ? 'Крутим…' : wheelAvailable ? 'Крутить' : spinBlockedReason ? 'Ждём' : 'Крутить'}
              </button>

              {spinBlockedReason && !spinning && (
                <p className="fw-spin-blocked">{spinBlockedReason}</p>
              )}

              <div className="fw-stats-row">
                <div className="fw-stat">
                  <span className="fw-stat-value">{status?.total_spins ?? 0}</span>
                  <span className="fw-stat-label">всего спинов</span>
                </div>
                <div className={`fw-tag-state ${status?.tag_verified ? 'ok' : 'wait'}`}>
                  {status?.tag_verified ? 'Метка в нике найдена' : 'Метка не проверена'}
                </div>
              </div>
            </>
          ) : (
            <>
              <button type="button" className="fw-spin-button" onClick={handleLogin}>
                Войти через Steam
              </button>
              <p className="fw-spin-blocked">Войдите, чтобы крутить колесо бесплатно</p>
            </>
          )}
        </div>
      </div>

      {spinResult && (
        <div className="fw-result" role="status" aria-live="polite">
          <div className="fw-result-icon">{RARITY_EMOJI[spinResult.prize.rarity] ?? '🎉'}</div>
          <div className="fw-result-text">
            <div className="fw-result-title">Вы выиграли!</div>
            <div className={`fw-result-prize rarity-${spinResult.prize.rarity}`}>
              {spinResult.prize.name}
              {spinResult.prize.quantity > 1 && (
                <span className="fw-result-qty"> ×{spinResult.prize.quantity}</span>
              )}
            </div>
            <div className="fw-result-note">
              Предмет добавлен в инвентарь и ждёт получения. Зайдите на сервер и заберите его в игре.
            </div>
            <Link to="/inventory" className="fw-result-link">
              Открыть инвентарь →
            </Link>
          </div>
        </div>
      )}

      {user && (
        <div className={`fw-tag-card ${status?.tag_verified ? 'verified' : ''}`}>
          <div className="fw-tag-card-head">
            <h3>Метка в нике Steam</h3>
            <p>
              Чтобы крутить колесо, добавьте метку{' '}
              <button type="button" className="fw-tag-chip" onClick={() => void handleCopyTag()} title="Скопировать">
                {nicknameTag}
                <span className="fw-tag-chip-icon">{copied ? <CheckIcon /> : <CopyIcon />}</span>
              </button>{' '}
              в своё имя в Steam (Friends → Change Profile Name), затем нажмите «Проверить».
            </p>
          </div>
          <div className="fw-tag-card-actions">
            <button type="button" className="fw-check-button" onClick={() => void handleCheckTag()} disabled={tagChecking}>
              {tagChecking ? 'Проверяем…' : 'Проверить метку'}
            </button>
            {tagNickname && <span className="fw-tag-nickname">Ник: {tagNickname}</span>}
          </div>
          {tagMessage && <p className={`fw-tag-message ${status?.tag_verified ? 'ok' : 'warn'}`}>{tagMessage}</p>}
        </div>
      )}

      <section className="fw-section">
        <h2>Последние выигрыши</h2>
        {wins.length === 0 ? (
          <p className="fw-empty">Пока никто не крутил — станьте первым!</p>
        ) : (
          <div className="fw-wins-row">
            {wins.map((win, index) => (
              <article className="fw-win-card" key={`${win.player_name}-${index}`}>
                {win.player_avatar ? (
                  <img className="fw-win-avatar" src={win.player_avatar} alt={win.player_name} loading="lazy" />
                ) : (
                  <div className="fw-win-avatar fw-win-avatar-placeholder">
                    {win.player_name.trim().charAt(0).toUpperCase() || '?'}
                  </div>
                )}
                <div className="fw-win-info">
                  <span className="fw-win-player">{win.player_name}</span>
                  <span className={`fw-win-prize rarity-${win.prize_rarity}`}>{win.prize_name}</span>
                  <span className="fw-win-time">{formatTimeAgo(win.created_at)}</span>
                </div>
                <div
                  className="fw-win-glow"
                  style={{ borderColor: FORTUNE_WHEEL_RARITY_COLORS[win.prize_rarity].mid }}
                  aria-hidden
                />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="fw-section">
        <h2>Возможные призы</h2>
        <p className="fw-section-sub">
          Все предметы, которые можно выиграть в колесе. Шанс каждого приза указан на карточке.
        </p>
        <div className="fw-prizes-grid">
          {prizes.map((prize) => (
            <article
              className={`fw-prize-card rarity-${prize.rarity}`}
              key={prize.id}
              style={{ '--rarity-color': FORTUNE_WHEEL_RARITY_COLORS[prize.rarity].mid } as React.CSSProperties}
            >
              <div className="fw-prize-image">
                {prize.image_url ? (
                  <img src={getImageUrl(prize.image_url)} alt={prize.name} loading="lazy" />
                ) : (
                  <PixelCrateIcon width={56} height={56} />
                )}
                {prize.quantity > 1 && (
                  <span className="fw-prize-qty-badge">
                    {prize.quantity_max ? `${prize.quantity}–${prize.quantity_max}` : `×${prize.quantity}`}
                  </span>
                )}
              </div>
              <div className="fw-prize-body">
                <span className={`fw-prize-rarity rarity-${prize.rarity}`}>
                  {FORTUNE_WHEEL_RARITY_LABELS[prize.rarity]}
                </span>
                <h3 className="fw-prize-name">{prize.name}</h3>
                {prize.description && <p className="fw-prize-desc">{prize.description}</p>}
                <div className="fw-prize-chance">
                  <span className="fw-prize-chance-caption">Шанс: {prize.chance_percent}%</span>
                  <span className="fw-prize-chance-bar">
                    <span
                      className="fw-prize-chance-fill"
                      style={{ width: `${Math.min(100, prize.chance_percent)}%` }}
                    />
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default FortuneWheel;
