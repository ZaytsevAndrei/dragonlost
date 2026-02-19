import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, getImageUrl } from '../services/api';
import { useAuthStore } from '../store/authStore';
import './Home.css';

interface Server {
  id: number;
  name: string;
  ip: string;
  port: number;
  players: number;
  maxPlayers: number;
  map: string;
  mapSize?: number;
  status: string;
  lastWipe: string | null;
  uptime?: number;
}

interface TopPlayer {
  id: number;
  name: string;
  stats: {
    kills: number;
    deaths: number;
    kd: number;
  };
  resources: {
    wood: number;
    stones: number;
    metalOre: number;
    sulfurOre: number;
  };
  timePlayed: string;
}

interface ShopItem {
  id: number;
  name: string;
  description: string;
  category: string;
  price: number;
  image_url: string;
  is_available: boolean;
}

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
  const [server, setServer] = useState<Server | null>(null);
  const [topPlayers, setTopPlayers] = useState<TopPlayer[]>([]);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [rewardStatus, setRewardStatus] = useState<DailyRewardStatus | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimAmount, setClaimAmount] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.get('/servers').then(res => {
      const servers = res.data.servers;
      if (servers?.length) setServer(servers[0]);
    }).catch(() => {});

    api.get('/stats', { params: { page: 1, limit: 5 } }).then(res => {
      setTopPlayers(res.data.players?.slice(0, 5) || []);
    }).catch(() => {});

    api.get('/shop/items').then(res => {
      const items = (res.data.items || []).filter((i: ShopItem) => i.is_available);
      setShopItems(items.slice(0, 4));
    }).catch(() => {});
  }, []);

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

  const formatWipeDate = (dateStr: string | null) => {
    if (!dateStr) return 'Неизвестно';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Неизвестно';
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const onlinePct = server ? Math.round((server.players / server.maxPlayers) * 100) : 0;

  return (
    <div className="home">
      {/* ===== HERO ===== */}
      <section className="hero">
        <div className="hero-bg-glow" />
        <div className="hero-content">
          <h1 className="hero-title">
            Dragon<span className="hero-accent">Lost</span>
          </h1>
          <p className="hero-subtitle">Rust сервер с магазином, статистикой и наградами</p>
          {server && server.status === 'online' && (
            <div className="hero-online">
              <span className="online-dot" />
              <span>{server.players} / {server.maxPlayers} онлайн</span>
            </div>
          )}
          <div className="hero-actions">
            <Link to="/servers" className="btn-hero-primary">Начать играть</Link>
            <Link to="/shop" className="btn-hero-secondary">Магазин</Link>
          </div>
        </div>
      </section>

      {/* ===== SERVER STATUS ===== */}
      {server && (
        <AnimatedSection className="server-widget-section">
          <div className="server-widget">
            <div className="sw-header">
              <div className="sw-title-row">
                <svg className="sw-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><circle cx="6" cy="6" r="1" fill="currentColor" /><circle cx="6" cy="18" r="1" fill="currentColor" /></svg>
                <h2>Статус сервера</h2>
              </div>
              <span className={`sw-status sw-status-${server.status}`}>
                {server.status === 'online' ? 'Онлайн' : 'Оффлайн'}
              </span>
            </div>

            <div className="sw-grid">
              <div className="sw-stat">
                <span className="sw-stat-label">Игроки</span>
                <span className="sw-stat-value">{server.players} / {server.maxPlayers}</span>
                <div className="sw-progress-bar">
                  <div className="sw-progress-fill" style={{ width: `${onlinePct}%` }} />
                </div>
              </div>
              <div className="sw-stat">
                <span className="sw-stat-label">Карта</span>
                <span className="sw-stat-value">{server.map}</span>
              </div>
              {server.mapSize && (
                <div className="sw-stat">
                  <span className="sw-stat-label">Размер</span>
                  <span className="sw-stat-value">{server.mapSize}m</span>
                </div>
              )}
              <div className="sw-stat">
                <span className="sw-stat-label">Последний вайп</span>
                <span className="sw-stat-value">{formatWipeDate(server.lastWipe)}</span>
              </div>
              {server.uptime !== undefined && (
                <div className="sw-stat">
                  <span className="sw-stat-label">Uptime</span>
                  <span className="sw-stat-value">{server.uptime.toFixed(1)}%</span>
                </div>
              )}
            </div>

            <button
              className="sw-connect-btn"
              onClick={() => copyToClipboard(`client.connect ${server.ip}:${server.port}`)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              Скопировать client.connect
            </button>
          </div>
        </AnimatedSection>
      )}

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

          <Link to="/servers" className="feature-card feature-card-link">
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><circle cx="6" cy="6" r="1" fill="currentColor" /><circle cx="6" cy="18" r="1" fill="currentColor" /></svg>
            </div>
            <h3>Сервера</h3>
            <p>Информация о серверах, онлайн игроков и расписание вайпов</p>
          </Link>

          <Link to="/shop" className="feature-card feature-card-link">
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
            </div>
            <h3>Магазин</h3>
            <p>Покупайте предметы за внутреннюю валюту и получайте их на сервере</p>
          </Link>

          <Link to="/rewards" className="feature-card feature-card-link">
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v10H4V12" /><path d="M2 7h20v5H2z" /><path d="M12 22V7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>
            </div>
            <h3>Ежедневные награды</h3>
            <p>Заходите каждый день и получайте бонусные монеты за серии</p>
          </Link>
        </div>
      </AnimatedSection>

      {/* ===== TOP PLAYERS ===== */}
      {topPlayers.length > 0 && (
        <AnimatedSection className="leaderboard-section">
          <div className="section-header">
            <h2>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="28" height="28"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 8 9 8 9" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 16 9 16 9" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>
              Топ игроков
            </h2>
            <Link to="/stats" className="section-link">Вся статистика →</Link>
          </div>

          <div className="leaderboard">
            <div className="lb-header-row">
              <span className="lb-col lb-rank">#</span>
              <span className="lb-col lb-name">Игрок</span>
              <span className="lb-col lb-stat">Убийств</span>
              <span className="lb-col lb-stat">Смертей</span>
              <span className="lb-col lb-stat">K/D</span>
            </div>
            {topPlayers.map((p, i) => (
              <div key={p.id} className={`lb-row ${i < 3 ? `lb-top-${i + 1}` : ''}`}>
                <span className="lb-col lb-rank">
                  {i === 0 && <span className="lb-medal">🥇</span>}
                  {i === 1 && <span className="lb-medal">🥈</span>}
                  {i === 2 && <span className="lb-medal">🥉</span>}
                  {i >= 3 && <span className="lb-rank-num">{i + 1}</span>}
                </span>
                <span className="lb-col lb-name">{p.name || 'Неизвестный'}</span>
                <span className="lb-col lb-stat">{p.stats.kills}</span>
                <span className="lb-col lb-stat">{p.stats.deaths}</span>
                <span className="lb-col lb-stat lb-kd">{p.stats.kd.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </AnimatedSection>
      )}

      {/* ===== SHOP SHOWCASE ===== */}
      {shopItems.length > 0 && (
        <AnimatedSection className="showcase-section">
          <div className="section-header">
            <h2>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="28" height="28"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
              Товары в магазине
            </h2>
            <Link to="/shop" className="section-link">Все товары →</Link>
          </div>

          <div className="showcase-grid">
            {shopItems.map(item => (
              <Link to="/shop" key={item.id} className="showcase-item">
                {item.image_url ? (
                  <div className="showcase-img">
                    <img
                      src={getImageUrl(item.image_url)}
                      alt={item.name}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                ) : (
                  <div className="showcase-img showcase-img-placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                  </div>
                )}
                <div className="showcase-info">
                  <span className="showcase-name">{item.name}</span>
                  <span className="showcase-price">{item.price} монет</span>
                </div>
              </Link>
            ))}
          </div>
        </AnimatedSection>
      )}

      {/* ===== DAILY REWARD (auth only) ===== */}
      {user && rewardStatus && (
        <AnimatedSection className="home-reward-section">
          <div className="home-reward-card">
            <div className="home-reward-left">
              <div className="home-reward-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v10H4V12" /><path d="M2 7h20v5H2z" /><path d="M12 22V7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>
              </div>
              <div>
                <h3>Ежедневная награда</h3>
                <p className="home-reward-streak">
                  Серия: <strong>{rewardStatus.current_streak}</strong> {pluralDays(rewardStatus.current_streak)}
                </p>
              </div>
            </div>

            <div className="home-reward-right">
              {claimAmount !== null ? (
                <div className="home-reward-claimed">
                  <span className="claimed-amount">+{claimAmount} монет</span>
                </div>
              ) : rewardStatus.available ? (
                <button className="btn-home-claim" onClick={handleClaim} disabled={claiming}>
                  {claiming ? 'Получение...' : rewardStatus.is_random ? 'Испытать удачу' : `Забрать ${rewardStatus.next_reward} монет`}
                </button>
              ) : (
                <div className="home-reward-timer">
                  <span className="timer-label">Через</span>
                  <span className="timer-value">{formatCountdown(countdown)}</span>
                </div>
              )}
              <Link to="/rewards" className="home-reward-link">Подробнее →</Link>
            </div>
          </div>
        </AnimatedSection>
      )}

      {/* ===== DISCORD ===== */}
      <AnimatedSection className="discord-section">
        <a
          href="https://discord.gg/NSPuBH4mZJ"
          target="_blank"
          rel="noopener noreferrer"
          className="discord-card"
        >
          <div className="discord-icon">
            <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </div>
          <div className="discord-info">
            <h3>Присоединяйся к Discord</h3>
            <p>Общайся с игроками, следи за новостями и будь в курсе событий</p>
          </div>
          <div className="discord-arrow">→</div>
        </a>
      </AnimatedSection>

    </div>
  );
}

export default Home;
