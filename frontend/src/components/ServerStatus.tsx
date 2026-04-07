import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import './ServerStatus.css';

interface ServerInfo {
  id: number;
  name: string;
  ip: string;
  port: number;
  players: number;
  maxPlayers: number;
  map: string;
  status: 'online' | 'offline';
  lastWipe: string | null;
  country?: string;
  rank?: number;
  uptime?: number;
}

const POLL_MS = 60_000;

function ServerStatus() {
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isManual: boolean, silent: boolean) => {
    if (isManual) setRefreshing(true);
    else if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ servers: ServerInfo[] }>('/servers');
      setServers(res.data.servers || []);
    } catch {
      setError('Не удалось загрузить статус сервера');
      setServers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false, false);
    const id = window.setInterval(() => void load(false, true), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const copyAddress = useCallback((id: number, ip: string, port: number) => {
    const text = `${ip}:${port}`;
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  if (loading && servers.length === 0) {
    return (
      <div className="server-status server-status-loading" role="status" aria-live="polite">
        Загрузка статуса сервера…
      </div>
    );
  }

  if (error && servers.length === 0) {
    return (
      <div className="server-status server-status-error">
        <p>{error}</p>
        <button type="button" className="server-status-retry" onClick={() => void load(true, false)} disabled={refreshing}>
          {refreshing ? 'Обновление…' : 'Повторить'}
        </button>
      </div>
    );
  }

  return (
    <div className="server-status">
      <div className="server-status-header">
        <div className="server-status-title-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden>
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
          </svg>
          <h2>Сервер</h2>
        </div>
        <button
          type="button"
          className="server-status-refresh"
          onClick={() => void load(true, false)}
          disabled={refreshing}
          title="Обновить статус"
        >
          {refreshing ? '…' : '↻'}
        </button>
      </div>

      <div className="server-status-list">
        {servers.map((s) => (
          <div key={s.id} className="server-status-card">
            <div className="server-status-card-top">
              <span className={`server-status-badge ${s.status === 'online' ? 'server-status-badge-online' : 'server-status-badge-offline'}`}>
                <span className="server-status-dot" aria-hidden />
                {s.status === 'online' ? 'Онлайн' : 'Оффлайн'}
              </span>
              <h3 className="server-status-name">{s.name}</h3>
            </div>

            <dl className="server-status-dl">
              <div className="server-status-row">
                <dt>Игроки</dt>
                <dd>
                  {s.players} / {s.maxPlayers}
                </dd>
              </div>
              <div className="server-status-row">
                <dt>Карта</dt>
                <dd title={s.map}>{s.map}</dd>
              </div>
              <div className="server-status-row">
                <dt>Адрес</dt>
                <dd className="server-status-address">
                  <code>{s.ip}:{s.port}</code>
                  <button type="button" className="server-status-copy" onClick={() => copyAddress(s.id, s.ip, s.port)}>
                    {copiedId === s.id ? 'Скопировано' : 'Копировать'}
                  </button>
                </dd>
              </div>
              {typeof s.uptime === 'number' && !Number.isNaN(s.uptime) ? (
                <div className="server-status-row">
                  <dt>Аптайм</dt>
                  <dd>{s.uptime.toFixed(1)}%</dd>
                </div>
              ) : null}
              {typeof s.rank === 'number' && s.rank > 0 ? (
                <div className="server-status-row">
                  <dt>Рейтинг</dt>
                  <dd>#{s.rank}</dd>
                </div>
              ) : null}
              {s.country ? (
                <div className="server-status-row">
                  <dt>Локация</dt>
                  <dd>{s.country}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ServerStatus;
