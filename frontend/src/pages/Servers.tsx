import { useEffect, useState } from 'react';
import { api } from '../services/api';
import StatePanel from '../components/StatePanel';
import './Servers.css';

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
  country?: string;
  rank?: number;
  uptime?: number;
}

function Servers() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/servers');
      setServers(response.data.servers);
      setError(null);
    } catch {
      setError('Не удалось загрузить информацию о серверах');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Неизвестно';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Неизвестно';
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) {
    return (
      <div className="servers">
        <h1>Наши сервера</h1>
        <StatePanel type="loading" title="Загрузка серверов" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="servers">
        <h1>Наши сервера</h1>
        <StatePanel type="error" title="Не удалось загрузить сервера" message={error} actionLabel="Попробовать снова" onAction={fetchServers} />
      </div>
    );
  }

  return (
    <div className="servers">
      <h1>Наши сервера</h1>

      {servers.length === 0 ? (
        <StatePanel type="empty" title="Серверы не найдены" message="Список серверов пока пуст. Обновите страницу позже." actionLabel="Обновить" onAction={fetchServers} />
      ) : (
      <div className="servers-grid">
        {servers.map((server) => (
          <div key={server.id} className="server-card">
            <div className="server-header">
              <h2>{server.name}</h2>
              <span className={`status ${server.status}`}>
                {server.status === 'online' ? '🟢 Онлайн' : '🔴 Оффлайн'}
              </span>
            </div>

            <div className="server-info">
              <div className="info-row">
                <span className="label">IP адрес:</span>
                <span className="value">
                  {server.ip}:{server.port}
                  <button
                    onClick={() => copyToClipboard(`${server.ip}:${server.port}`)}
                    className="btn-copy"
                    title="Скопировать"
                  >
                    📋
                  </button>
                </span>
              </div>

              <div className="info-row">
                <span className="label">Игроки:</span>
                <span className="value">
                  {server.players}/{server.maxPlayers}
                </span>
              </div>

              <div className="info-row">
                <span className="label">Карта:</span>
                <span className="value">{server.map}</span>
              </div>

              {server.mapSize && (
                <div className="info-row">
                  <span className="label">Размер карты:</span>
                  <span className="value">{server.mapSize}m</span>
                </div>
              )}

              <div className="info-row">
                <span className="label">Последний вайп:</span>
                <span className="value">{formatDate(server.lastWipe)}</span>
              </div>

              {server.rank && (
                <div className="info-row">
                  <span className="label">Рейтинг:</span>
                  <span className="value">#{server.rank}</span>
                </div>
              )}

              {server.uptime !== undefined && (
                <div className="info-row">
                  <span className="label">Uptime:</span>
                  <span className="value">{server.uptime.toFixed(1)}%</span>
                </div>
              )}
            </div>

            <button
              onClick={() => copyToClipboard(`client.connect ${server.ip}:${server.port}`)}
              className="btn-connect"
            >
              Подключиться
            </button>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

export default Servers;
