import { useEffect, useState } from 'react';
import { api, getImageUrl } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { saveLastPage } from '../utils/safeLocalStorage';
import StatePanel from '../components/StatePanel';
import './Inventory.css';

interface InventoryItem {
  id: number;
  shop_item_id: number;
  quantity: number;
  status: string;
  purchased_at: string;
  delivered_at: string | null;
  item_name: string;
  item_description: string;
  item_category: string;
  rust_item_code: string;
  image_url: string;
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
};

function Inventory() {
  const { user, loading: authLoading } = useAuthStore();
  const navigate = useNavigate();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [onlineStatus, setOnlineStatus] = useState<OnlineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingItem, setUsingItem] = useState<number | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/');
      return;
    }
    saveLastPage('/inventory');
    fetchInventory();
    checkOnlineStatus();
  }, [user, authLoading, navigate]);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const response = await api.get('/inventory');
      setInventory(response.data.inventory);
      setError(null);
    } catch {
      setError('Не удалось загрузить инвентарь');
    } finally {
      setLoading(false);
    }
  };

  const checkOnlineStatus = async () => {
    try {
      const response = await api.get('/inventory/check-online');
      setOnlineStatus(response.data);
    } catch {
      // Ошибка проверки статуса — молча игнорируем
    }
  };

  const handleUseItem = async (itemId: number, itemName: string) => {
    if (!onlineStatus?.online) {
      alert('Вы должны быть онлайн на сервере, чтобы получить предмет!');
      return;
    }

    if (!confirm(`Выдать предмет "${itemName}" на вашего персонажа в игре?`)) {
      return;
    }

    try {
      setUsingItem(itemId);
      const response = await api.post(`/inventory/use/${itemId}`);
      
      if (response.data.success) {
        alert(`✅ ${response.data.message}`);
        // Обновляем инвентарь
        fetchInventory();
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Ошибка при использовании предмета';
      alert(`❌ ${errorMsg}`);
      // Обновляем статус онлайна
      checkOnlineStatus();
    } finally {
      setUsingItem(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const pendingItems = inventory.filter(item => item.status === 'pending');
  const deliveredItems = inventory.filter(item => item.status === 'delivered');

  if (authLoading || !user) {
    return (
      <div className="inventory">
        <h1>Мой инвентарь</h1>
        <StatePanel type="loading" title="Загрузка инвентаря" />
      </div>
    );
  }

  if (loading) {
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
        <StatePanel type="error" title="Не удалось загрузить инвентарь" message={error} actionLabel="Попробовать снова" onAction={fetchInventory} />
      </div>
    );
  }

  return (
    <div className="inventory">
      <div className="inventory-header">
        <h1>🎒 Мой инвентарь</h1>
        <button onClick={checkOnlineStatus} className="btn-refresh">
          🔄 Обновить статус
        </button>
      </div>

      {onlineStatus && (
        <div className={`online-status ${onlineStatus.online ? 'online' : 'offline'}`}>
          <div className="status-indicator">
            {onlineStatus.online ? '🟢' : '🔴'}
          </div>
          <div className="status-info">
            <div className="status-label">
              {onlineStatus.online ? 'Вы онлайн на сервере' : 'Вы оффлайн'}
            </div>
            {!onlineStatus.online && (
              <div className="status-warning">
                ⚠️ Войдите на сервер, чтобы получать предметы
              </div>
            )}
          </div>
        </div>
      )}

      {pendingItems.length > 0 && (
        <div className="inventory-section">
          <h2>⏳ Ожидают получения ({pendingItems.length})</h2>
          <div className="inventory-grid">
            {pendingItems.map((item) => (
              <div key={item.id} className="inventory-item pending">
                {item.image_url && (
                  <div className="item-image">
                    <img 
                      src={getImageUrl(item.image_url)} 
                      alt={item.item_name}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <div className="item-content">
                  <div className="item-category">
                    {CATEGORY_NAMES[item.item_category] || item.item_category}
                  </div>
                  <h3 className="item-name">{item.item_name}</h3>
                  <p className="item-description">{item.item_description}</p>
                  {item.quantity > 1 && (
                    <div className="item-quantity">Количество: {item.quantity}</div>
                  )}
                  <div className="item-date">
                    Куплено: {formatDate(item.purchased_at)}
                  </div>
                  <button
                    className="btn-use"
                    onClick={() => handleUseItem(item.id, item.item_name)}
                    disabled={usingItem === item.id || !onlineStatus?.online}
                  >
                    {usingItem === item.id ? 'Получение...' : '📦 Получить предмет'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {deliveredItems.length > 0 && (
        <div className="inventory-section">
          <h2>✅ Полученные предметы ({deliveredItems.length})</h2>
          <div className="inventory-grid">
            {deliveredItems.map((item) => (
              <div key={item.id} className="inventory-item delivered">
                {item.image_url && (
                  <div className="item-image">
                    <img 
                      src={getImageUrl(item.image_url)} 
                      alt={item.item_name}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <div className="item-content">
                  <div className="item-category">
                    {CATEGORY_NAMES[item.item_category] || item.item_category}
                  </div>
                  <h3 className="item-name">{item.item_name}</h3>
                  {item.quantity > 1 && (
                    <div className="item-quantity">Количество: {item.quantity}</div>
                  )}
                  <div className="item-dates">
                    <div>Куплено: {formatDate(item.purchased_at)}</div>
                    {item.delivered_at && (
                      <div>Получено: {formatDate(item.delivered_at)}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {inventory.length === 0 && (
        <StatePanel
          type="empty"
          title="Ваш инвентарь пуст"
          message="Посетите магазин, чтобы приобрести предметы"
          actionLabel="Перейти в магазин"
          onAction={() => navigate('/shop')}
        />
      )}
    </div>
  );
}

export default Inventory;
