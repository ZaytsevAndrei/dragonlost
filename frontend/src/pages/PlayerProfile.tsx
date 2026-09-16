import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../services/api';
import StatePanel from '../components/StatePanel';
import { usePageMeta } from '../hooks/usePageMeta';
import type { PlayerProfileResponse } from '../types';
import './PlayerProfile.css';

const RESOURCE_ROWS = [
  { key: 'sulfurOre', label: 'Серная руда', icon: '/uploads/stats/sulfur.ore.png' },
  { key: 'metalOre', label: 'Железная руда', icon: '/uploads/stats/metal.ore.png' },
  { key: 'stones', label: 'Камень', icon: '/uploads/stats/stones.png' },
  { key: 'wood', label: 'Дерево', icon: '/uploads/stats/wood.png' },
] as const;

const STEAMID64_REGEX = /^\d{17}$/;

function formatPlaytime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return `${hours} ч ${Math.floor((seconds % 3600) / 60)} м`;
  return `${Math.floor(hours / 24)} д ${hours % 24} ч`;
}

function formatNumber(value: number): string {
  return value.toLocaleString('ru-RU');
}

function formatUnix(unix: number): string | null {
  if (!unix) return null;
  const d = new Date(unix * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function PlayerProfile() {
  const { steamid = '' } = useParams<{ steamid: string }>();

  const [data, setData] = useState<PlayerProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState<'link' | 'steamid' | null>(null);

  const displayName = data?.steam?.personaname || data?.player.name || 'Игрок';

  usePageMeta({
    title: data ? `${displayName} — статистика игрока | DragonLost` : 'Профиль игрока | DragonLost',
    description: data
      ? `Наиграно за вайп: ${formatPlaytime(data.player.stats.secondsPlayed)}; убийств: ${formatNumber(
          data.player.stats.kills
        )}; K/D: ${data.player.stats.kd.toFixed(2)}. Профиль игрока Rust-сервера DragonLost.`
      : 'Профиль игрока Rust-сервера DragonLost: статистика текущего вайпа.',
    path: `/player/${steamid}`,
  });

  const fetchProfile = useCallback(async () => {
    if (!STEAMID64_REGEX.test(steamid)) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setNotFound(false);
      const response = await api.get<PlayerProfileResponse>(`/stats/${steamid}`);
      setData(response.data);
      setError(null);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setNotFound(true);
      } else {
        setError('Не удалось загрузить профиль');
      }
    } finally {
      setLoading(false);
    }
  }, [steamid]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async (what: 'link' | 'steamid') => {
    try {
      await navigator.clipboard.writeText(what === 'link' ? window.location.href : steamid);
      setCopied(what);
    } catch {
      // буфер обмена недоступен — игнорируем
    }
  };

  if (loading) {
    return (
      <div className="player-profile">
        <StatePanel type="loading" title="Загрузка профиля" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="player-profile">
        <StatePanel
          type="empty"
          title="Игрок не найден"
          message="Возможно, игрок ещё не заходил на сервер после вайпа или указан неверный SteamID."
          actionLabel="К топу игроков"
          onAction={() => window.history.back()}
        />
        <p className="player-profile-back">
          <Link to="/leaders">← Топ игроков</Link>
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="player-profile">
        <StatePanel
          type="error"
          title="Не удалось загрузить профиль"
          message={error ?? undefined}
          actionLabel="Попробовать снова"
          onAction={fetchProfile}
        />
      </div>
    );
  }

  const { player, steam } = data;
  const lastSeenLabel = player.lastSeen ? formatUnix(player.lastSeen) : null;
  const firstConnectionLabel = formatUnix(player.firstConnection);
  const steamProfileUrl =
    steam?.profileurl || `https://steamcommunity.com/profiles/${steamid}`;

  const wipePeriodLabel = data.wipedAt
    ? new Date(data.wipedAt).toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="player-profile">
      <header className="player-profile-header">
        {steam?.avatarfull ? (
          <img
            className="player-profile-avatar"
            src={steam.avatarfull}
            alt={displayName}
            width={96}
            height={96}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="player-profile-avatar player-profile-avatar--fallback" aria-hidden="true">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
        )}

        <div className="player-profile-info">
          <h1>{displayName}</h1>
          <div className="player-profile-meta">
            <button
              type="button"
              className="player-profile-steamid"
              onClick={() => copy('steamid')}
              title="Скопировать SteamID"
            >
              {copied === 'steamid' ? '✓ скопировано' : steamid}
            </button>
            <a
              href={steamProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="player-profile-steam-link"
            >
              Профиль Steam ↗
            </a>
          </div>
          {lastSeenLabel && <p className="player-profile-seen">Последний заход: {lastSeenLabel} МСК</p>}
          {firstConnectionLabel && (
            <p className="player-profile-seen">Первый визит: {firstConnectionLabel} МСК</p>
          )}
        </div>

        <button type="button" className="player-profile-share" onClick={() => copy('link')}>
          {copied === 'link' ? '✓ Ссылка скопирована' : '🔗 Поделиться'}
        </button>
      </header>

      {data.wipeStats && wipePeriodLabel && (
        <p className="player-profile-wipe-note">Показатели за текущий вайп с {wipePeriodLabel} (МСК)</p>
      )}

      <section className="player-profile-section">
        <h2>Боевая статистика</h2>
        <div className="player-profile-stats">
          <div className="player-stat-card player-stat-card--accent">
            <span className="player-stat-label">Наиграно</span>
            <span className="player-stat-value">{formatPlaytime(player.stats.secondsPlayed)}</span>
          </div>
          <div className="player-stat-card">
            <span className="player-stat-label">Убийств</span>
            <span className="player-stat-value">{formatNumber(player.stats.kills)}</span>
          </div>
          <div className="player-stat-card">
            <span className="player-stat-label">Смертей</span>
            <span className="player-stat-value">{formatNumber(player.stats.deaths)}</span>
          </div>
          <div className="player-stat-card">
            <span className="player-stat-label">K/D</span>
            <span className="player-stat-value">{player.stats.kd.toFixed(2)}</span>
          </div>
          <div className="player-stat-card">
            <span className="player-stat-label">Хедшоты</span>
            <span className="player-stat-value">{formatNumber(player.stats.headshots)}</span>
          </div>
          <div className="player-stat-card">
            <span className="player-stat-label">Выстрелов</span>
            <span className="player-stat-value">{formatNumber(player.stats.shots)}</span>
          </div>
          <div className="player-stat-card">
            <span className="player-stat-label">Бочек разбито</span>
            <span className="player-stat-value">{formatNumber(player.stats.barrelsBroken)}</span>
          </div>
          <div className="player-stat-card">
            <span className="player-stat-label">Заходов</span>
            <span className="player-stat-value">{formatNumber(player.stats.joins)}</span>
          </div>
        </div>
      </section>

      <section className="player-profile-section">
        <h2>Добыча ресурсов</h2>
        <div className="player-profile-resources">
          {RESOURCE_ROWS.map(({ key, label, icon }) => (
            <div key={key} className="player-resource-card">
              <img src={icon} alt="" width={22} height={22} loading="lazy" referrerPolicy="no-referrer" />
              <div>
                <span className="player-stat-label">{label}</span>
                <span className="player-resource-value">{formatNumber(player.resources[key])}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="player-profile-back">
        <Link to="/leaders">← Топ игроков</Link>
        <Link to="/stats">Полная статистика</Link>
      </p>
    </div>
  );
}

export default PlayerProfile;
