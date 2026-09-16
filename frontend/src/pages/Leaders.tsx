import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import StatePanel from '../components/StatePanel';
import { usePageMeta } from '../hooks/usePageMeta';
import type { LeaderboardEntry, LeaderboardResponse } from '../types';
import './Leaders.css';

const RESOURCE_ICON = {
  wood: '/uploads/stats/wood.png',
  stones: '/uploads/stats/stones.png',
  metalOre: '/uploads/stats/metal.ore.png',
  sulfurOre: '/uploads/stats/sulfur.ore.png',
} as const;

type MetricKey = 'time' | 'kills' | 'kd' | 'headshots' | 'sulfur' | 'wood' | 'stones' | 'metal';

const METRICS: {
  key: MetricKey;
  label: string;
  emoji?: string;
  iconSrc?: string;
}[] = [
  { key: 'time', label: 'Время', emoji: '⏱️' },
  { key: 'kills', label: 'Убийства', emoji: '⚔️' },
  { key: 'kd', label: 'K/D', emoji: '🎯' },
  { key: 'headshots', label: 'Хедшоты', emoji: '🔫' },
  { key: 'sulfur', label: 'Сера', iconSrc: RESOURCE_ICON.sulfurOre },
  { key: 'wood', label: 'Дерево', iconSrc: RESOURCE_ICON.wood },
  { key: 'stones', label: 'Камень', iconSrc: RESOURCE_ICON.stones },
  { key: 'metal', label: 'Металл', iconSrc: RESOURCE_ICON.metalOre },
];

const LEADERS_LIMIT = 50;

function formatPlaytime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return `${hours} ч ${Math.floor((seconds % 3600) / 60)} м`;
  return `${Math.floor(hours / 24)} д ${hours % 24} ч`;
}

function formatNumber(value: number): string {
  return value.toLocaleString('ru-RU');
}

function metricValue(player: LeaderboardEntry, metric: MetricKey): string {
  switch (metric) {
    case 'time':
      return formatPlaytime(player.stats.secondsPlayed);
    case 'kills':
      return formatNumber(player.stats.kills);
    case 'kd':
      return player.stats.kd.toFixed(2);
    case 'headshots':
      return formatNumber(player.stats.headshots);
    case 'sulfur':
      return formatNumber(player.resources.sulfurOre);
    case 'wood':
      return formatNumber(player.resources.wood);
    case 'stones':
      return formatNumber(player.resources.stones);
    case 'metal':
      return formatNumber(player.resources.metalOre);
  }
}

function metricTitle(metric: MetricKey): string {
  return METRICS.find((m) => m.key === metric)?.label ?? 'Значение';
}

function Leaders() {
  usePageMeta({
    title: 'Топ игроков сервера — DragonLost',
    description:
      'Публичный рейтинг игроков Rust-сервера DragonLost за текущий вайп: наигранное время, убийства, K/D, хедшоты и фарм ресурсов.',
    path: '/leaders',
  });

  const [metric, setMetric] = useState<MetricKey>('time');
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wipedAt, setWipedAt] = useState<string | null>(null);
  const [wipeStatsActive, setWipeStatsActive] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchLeaders = useCallback(async (m: MetricKey) => {
    try {
      setLoading(true);
      const response = await api.get<LeaderboardResponse>('/stats/leaderboard', {
        params: { metric: m, limit: LEADERS_LIMIT },
      });
      setLeaders(response.data.leaders);
      setWipeStatsActive(Boolean(response.data.wipeStats));
      setWipedAt(typeof response.data.wipedAt === 'string' ? response.data.wipedAt : null);
      setError(null);
    } catch {
      setError('Не удалось загрузить рейтинг');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaders(metric);
  }, [metric, fetchLeaders]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const shareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      // буфер обмена недоступен — игнорируем
    }
  };

  const wipePeriodLabel = wipedAt
    ? new Date(wipedAt).toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="leaders">
      <header className="leaders-header">
        <div className="leaders-title-row">
          <div>
            <h1>Топ игроков</h1>
            <p className="leaders-subtitle">
              {wipeStatsActive && wipePeriodLabel
                ? `Рейтинг за текущий вайп с ${wipePeriodLabel} (МСК)`
                : 'Публичный рейтинг игроков сервера'}
            </p>
          </div>
          <button type="button" className="leaders-share" onClick={shareLink}>
            {copied ? '✓ Ссылка скопирована' : '🔗 Поделиться'}
          </button>
        </div>

        <div className="leaders-filters">
          {METRICS.map(({ key, label, emoji, iconSrc }) => (
            <button
              key={key}
              type="button"
              className={`leaders-filter-btn ${metric === key ? 'active' : ''}`}
              onClick={() => setMetric(key)}
            >
              <span className="leaders-filter-label">
                {iconSrc ? (
                  <img src={iconSrc} alt="" width={18} height={18} loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  emoji && <span aria-hidden="true">{emoji}</span>
                )}
                <span>{label}</span>
              </span>
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <StatePanel type="loading" title="Загрузка рейтинга" />
      ) : error ? (
        <StatePanel
          type="error"
          title="Не удалось загрузить рейтинг"
          message={error}
          actionLabel="Попробовать снова"
          onAction={() => fetchLeaders(metric)}
        />
      ) : leaders.length === 0 ? (
        <StatePanel type="empty" title="Данных пока нет" message="Рейтинг появится после первого вайпа." />
      ) : (
        <div className="leaders-table-container">
          <table className="leaders-table">
            <thead>
              <tr>
                <th className="leaders-rank-col">#</th>
                <th>Игрок</th>
                <th className="leaders-metric-col">{metricTitle(metric)}</th>
                <th>Убийств</th>
                <th>K/D</th>
                <th>Время</th>
              </tr>
            </thead>
            <tbody>
              {leaders.map((player) => (
                <tr key={player.steamid}>
                  <td className="leaders-rank-cell">
                    <span className={`leaders-rank-badge rank-${player.rank <= 3 ? player.rank : 'n'}`}>
                      {player.rank}
                    </span>
                  </td>
                  <td className="leaders-player-cell">
                    <Link to={`/player/${player.steamid}`} className="leaders-player-link">
                      {player.name || 'Неизвестный игрок'}
                    </Link>
                  </td>
                  <td className="leaders-metric-cell">{metricValue(player, metric)}</td>
                  <td>{formatNumber(player.stats.kills)}</td>
                  <td className="kd-stat">{player.stats.kd.toFixed(2)}</td>
                  <td>{formatPlaytime(player.stats.secondsPlayed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="leaders-footer-hint">
        Полная таблица с поиском — на странице{' '}
        <Link to="/stats">статистики</Link>.
      </p>
    </div>
  );
}

export default Leaders;
