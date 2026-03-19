import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StatePanel from '../components/StatePanel';
import { api, getImageUrl } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { saveLastPage } from '../utils/safeLocalStorage';
import './Inventory.css';

interface InventoryItem {
  id: number;
  shop_item_id: number;
  quantity: number;
  status: 'pending' | 'delivered' | string;
  purchased_at: string;
  delivered_at: string | null;
  item_name: string;
  item_description: string | null;
  item_category: string;
  rust_item_code: string;
  image_url: string | null;
}

interface OnlineStatus {
  online: boolean;
  message: string;
}

const CATEGORY_NAMES: Record<string, string> = {
  weapon: '🔫 Оружие',
  armor: '🛡️ Броня',
  tool: '🔨 Инструменты',
  resource: '📦 Ресурсы',
  medical: '💊 Медикаменты',
  kit: '🎁 Наборы',
  module: '🎯 Модули',
  construction: '🏗️ Конструкции',
  electricity: '⚡ Электрика',
  component: '⚙️ Компоненты',
  ammo: '💥 Боеприпасы',
  misc: '📁 Прочее',
  food: '🍎 Еда',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Inventory() {
  const { user, loading: authLoading } = useAuthStore();
  const navigate = useNavigate();

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [onlineStatus, setOnlineStatus] = useState<OnlineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingItemId, setUsingItemId] = useState<number | null>(null);

  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get<{ inventory: InventoryItem[] }>('/inventory');
      setInventory(response.data.inventory || []);
      setError(null);
    } catch {
      setError('Не удалось загрузить инвентарь');
    } finally {
      setLoading(false);
    }
  }, []);

  const checkOnlineStatus = useCallback(async () => {
    try {
      const response = await api.get<OnlineStatus>('/inventory/check-online');
      setOnlineStatus(response.data);
    } catch {
      // Тихо игнорируем, страница инвентаря всё равно функциональна.
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/');
      return;
    }

    saveLastPage('/inventory');
    void fetchInventory();
    void checkOnlineStatus();
  }, [authLoading, user, navigate, fetchInventory, checkOnlineStatus]);

  const pendingItems = useMemo(() => inventory.filter((item) => item.status === 'pending'), [inventory]);
  const deliveredItems = useMemo(() => inventory.filter((item) => item.status === 'delivered'), [inventory]);

  const handleUseItem = useCallback(
    async (itemId: number, itemName: string) => {
      if (!onlineStatus?.online) {
        alert('Вы должны быть онлайн на сервере, чтобы получить предмет');
        return;
      }
      if (!window.confirm(`Выдать предмет "${itemName}" на вашего персонажа в игре?`)) {
        return;
      }

      try {
        setUsingItemId(itemId);
        const response = await api.post<{ success: boolean; message: string }>(`/inventory/use/${itemId}`);
        if (response.data.success) {
          alert(`✅ ${response.data.message}`);
          await fetchInventory();
        }
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Ошибка при использовании предмета';
        alert(`❌ ${msg}`);
        await checkOnlineStatus();
      } finally {
        setUsingItemId(null);
      }
    },
    [onlineStatus?.online, fetchInventory, checkOnlineStatus]
  );

  if (authLoading || !user || loading) {
    return (
      <div className="inventory">
        <h1>Мой инвентарь</h1>
        <StatePanel type="loading" title="Загрузка инвентаря" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="inventory">
        <h1>Мой инвентарь</h1>
        <StatePanel
          type="error"
          title="Не удалось загрузить инвентарь"
          message={error}
          actionLabel="Попробовать снова"
          onAction={fetchInventory}
        />
      </div>
    );
  }

  return (
    <div className="inventory">
      <div className="inventory-header">
        <h1>🎒 Мой инвентарь</h1>
        <button className="btn-refresh" type="button" onClick={checkOnlineStatus}>
          🔄 Обновить статус
        </button>
      </div>

      {onlineStatus ? (
        <div className={`online-status ${onlineStatus.online ? 'online' : 'offline'}`}>
          <span className="status-indicator">{onlineStatus.online ? '🟢' : '🔴'}</span>
          <div className="status-info">
            <div className="status-label">{onlineStatus.online ? 'Вы онлайн на сервере' : 'Вы оффлайн'}</div>
            <div className="status-detail">{onlineStatus.message}</div>
            {!onlineStatus.online ? (
              <div className="status-warning">⚠️ Войдите на сервер, чтобы получать предметы</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {pendingItems.length > 0 ? (
        <section className="inventory-section">
          <h2>⏳ Ожидают получения ({pendingItems.length})</h2>
          <div className="inventory-grid">
            {pendingItems.map((item) => (
              <article className="inventory-item pending" key={item.id}>
                {item.image_url ? (
                  <div className="item-image">
                    <img src={getImageUrl(item.image_url)} alt={item.item_name} onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                  </div>
                ) : null}
                <div className="item-content">
                  <span className="item-category">{CATEGORY_NAMES[item.item_category] || item.item_category}</span>
                  <h3 className="item-name">{item.item_name}</h3>
                  {item.item_description ? <p className="item-description">{item.item_description}</p> : null}
                  {item.quantity > 1 ? <div className="item-quantity">Количество: {item.quantity}</div> : null}
                  <div className="item-date">Куплено: {formatDate(item.purchased_at)}</div>
                  <button
                    className="btn-use"
                    type="button"
                    onClick={() => handleUseItem(item.id, item.item_name)}
                    disabled={usingItemId === item.id || !onlineStatus?.online}
                  >
                    {usingItemId === item.id ? 'Получение...' : '📦 Получить предмет'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {deliveredItems.length > 0 ? (
        <section className="inventory-section">
          <h2>✅ Полученные предметы ({deliveredItems.length})</h2>
          <div className="inventory-grid">
            {deliveredItems.map((item) => (
              <article className="inventory-item delivered" key={item.id}>
                {item.image_url ? (
                  <div className="item-image">
                    <img src={getImageUrl(item.image_url)} alt={item.item_name} onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                  </div>
                ) : null}
                <div className="item-content">
                  <span className="item-category">{CATEGORY_NAMES[item.item_category] || item.item_category}</span>
                  <h3 className="item-name">{item.item_name}</h3>
                  {item.quantity > 1 ? <div className="item-quantity">Количество: {item.quantity}</div> : null}
                  <div className="item-dates">
                    <div>Куплено: {formatDate(item.purchased_at)}</div>
                    {item.delivered_at ? <div>Получено: {formatDate(item.delivered_at)}</div> : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {inventory.length === 0 ? (
        <div className="empty-inventory">
          <div className="empty-icon">📭</div>
          <h3>Ваш инвентарь пуст</h3>
          <p>Посетите магазин, чтобы приобрести предметы</p>
          <button type="button" className="btn-shop" onClick={() => navigate('/shop')}>
            Перейти в магазин
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default Inventory;
