import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StatePanel from '../components/StatePanel';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import './TelegramLink.css';

interface TelegramStatus {
  linked: boolean;
  telegram_username: string | null;
  bot_username: string;
}

interface LinkCodeResponse {
  code: string;
  expires_in_seconds: number;
  bot_username: string;
}

function formatCountdown(seconds: number): string {
  const mins = Math.ceil(seconds / 60);
  return `${mins} мин`;
}

function TelegramLink() {
  const { user, loading: authLoading } = useAuthStore();
  const navigate = useNavigate();

  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [linkCode, setLinkCode] = useState<LinkCodeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get<TelegramStatus>('/telegram/status');
      setStatus(response.data);
      setError(null);
    } catch {
      setError('Не удалось загрузить статус Telegram');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/');
      return;
    }
    fetchStatus();
  }, [authLoading, user, navigate, fetchStatus]);

  useEffect(() => {
    if (!linkCode?.expires_in_seconds) return undefined;

    setCountdown(linkCode.expires_in_seconds);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [linkCode]);

  const handleGenerateCode = async () => {
    try {
      setGenerating(true);
      setError(null);
      const response = await api.post<LinkCodeResponse>('/telegram/link-code');
      setLinkCode(response.data);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Не удалось создать код';
      setError(message);
    } finally {
      setGenerating(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="telegram-link-page">
        <StatePanel type="loading" title="Загрузка..." />
      </div>
    );
  }

  const botUsername = linkCode?.bot_username || status?.bot_username || 'DragonLostBot';
  const botUrl = `https://t.me/${botUsername}`;

  return (
    <div className="telegram-link-page">
      <div className="telegram-link-header">
        <h1>Telegram-бот</h1>
        <p>
          Привяжите Telegram к аккаунту Steam и получайте бонус раз в 12 часов — предметы попадут в{' '}
          <a href="/inventory">инвентарь на сайте</a>.
        </p>
      </div>

      {error && <StatePanel type="error" title="Ошибка" message={error} />}

      {status?.linked ? (
        <div className="telegram-link-card telegram-link-card-success">
          <h2>Аккаунт привязан</h2>
          <p>
            Telegram{status.telegram_username ? ` (@${status.telegram_username})` : ''} связан с вашим
            Steam-профилем.
          </p>
          <p>
            Откройте бота и используйте команду <code>/bonus</code> для получения награды.
          </p>
          <a href={botUrl} target="_blank" rel="noopener noreferrer" className="telegram-link-btn">
            Открыть @{botUsername}
          </a>
        </div>
      ) : (
        <div className="telegram-link-card">
          <h2>Привязка аккаунта</h2>
          <ol className="telegram-link-steps">
            <li>Нажмите «Получить код» ниже</li>
            <li>
              Откройте{' '}
              <a href={botUrl} target="_blank" rel="noopener noreferrer">
                @{botUsername}
              </a>{' '}
              в Telegram
            </li>
            <li>
              Отправьте боту команду <code>/link КОД</code>
            </li>
          </ol>

          <button
            type="button"
            className="telegram-link-btn"
            onClick={handleGenerateCode}
            disabled={generating}
          >
            {generating ? 'Генерация...' : 'Получить код'}
          </button>

          {linkCode && countdown > 0 && (
            <div className="telegram-link-code-box">
              <span className="telegram-link-code-label">Ваш код:</span>
              <span className="telegram-link-code">{linkCode.code}</span>
              <span className="telegram-link-code-expiry">Действует ещё {formatCountdown(countdown)}</span>
              <p className="telegram-link-code-hint">
                Отправьте боту: <code>/link {linkCode.code}</code>
              </p>
            </div>
          )}

          {linkCode && countdown === 0 && (
            <p className="telegram-link-expired">Код истёк. Получите новый код.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default TelegramLink;
