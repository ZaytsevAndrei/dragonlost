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

interface DeliveredGroup {
  shopItemId: number;
  name: string;
  description: string | null;
  category: string;
  imageUrl: string | null;
  totalQuantity: number;
  purchases: number;
  lastDeliveredAt: string | null;
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

const PAGE_SIZE = 20;

function formatDate(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelative(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин. назад`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ч. назад`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Inventory() {
  const { user, loading: authLoading } = useAuthStore();
  const navigate = useNavigate();

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [onlineStatus, setOnlineStatus] = useState<OnlineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingItemId, setUsingItemId] = useState<number | null>(null);
  const [usingAll, setUsingAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [visibleDelivered, setVisibleDelivered] = useState(PAGE_SIZE);

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

  const deliveredList = useMemo(() => {
    const groups = new Map<number, DeliveredGroup>();
    for (const item of inventory) {
      if (item.status !== 'delivered') continue;
      const existing = groups.get(item.shop_item_id);
      if (existing) {
        existing.totalQuantity += item.quantity;
        existing.purchases += 1;
        if (item.delivered_at && (!existing.lastDeliveredAt || new Date(item.delivered_at) > new Date(existing.lastDeliveredAt))) {
          existing.lastDeliveredAt = item.delivered_at;
        }
      } else {
        groups.set(item.shop_item_id, {
          shopItemId: item.shop_item_id,
          name: item.item_name,
          description: item.item_description,
          category: item.item_category,
          imageUrl: item.image_url,
          totalQuantity: item.quantity,
          purchases: 1,
          lastDeliveredAt: item.delivered_at,
        });
      }
    }
    return [...groups.values()].sort(
      (a, b) => new Date(b.lastDeliveredAt ?? 0).getTime() - new Date(a.lastDeliveredAt ?? 0).getTime()
    );
  }, [inventory]);

  const deliveredCategories = useMemo(() => {
    const categories = new Set(deliveredList.map((group) => group.category));
    return [...categories].sort((a, b) => (CATEGORY_NAMES[a] ?? a).localeCompare(CATEGORY_NAMES[b] ?? b));
  }, [deliveredList]);

  const filteredDelivered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return deliveredList.filter((group) => {
      if (categoryFilter && group.category !== categoryFilter) return false;
      if (query && !group.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [deliveredList, search, categoryFilter]);

  const totalDeliveredItems = useMemo(
    () => inventory.filter((item) => item.status === 'delivered').reduce((sum, item) => sum + item.quantity, 0),
    [inventory]
  );

  const lastPurchaseAt = useMemo(() => {
    if (inventory.length === 0) return null;
    return inventory.reduce<string>(
      (latest, item) => (new Date(item.purchased_at) > new Date(latest) ? item.purchased_at : latest),
      inventory[0].purchased_at
    );
  }, [inventory]);

  useEffect(() => {
    setCategoryFilter(null);
    setVisibleDelivered(PAGE_SIZE);
  }, [search]);

  const handleUseItem = useCallback(
    async (itemId: number) => {
      if (!onlineStatus?.online) return;

      try {
        setUsingItemId(itemId);
        setNotice(null);
        const response = await api.post<{ success: boolean }>(`/inventory/use/${itemId}`);
        if (response.data.success) {
          await fetchInventory();
        }
      } catch {
        await checkOnlineStatus();
      } finally {
        setUsingItemId(null);
      }
    },
    [onlineStatus?.online, fetchInventory, checkOnlineStatus]
  );

  const handleUseAll = useCallback(async () => {
    if (!onlineStatus?.online || pendingItems.length === 0) return;

    try {
      setUsingAll(true);
      setNotice(null);
      const response = await api.post<{ success: boolean; message: string }>('/inventory/use-all');
      setNotice(response.data.message);
      await fetchInventory();
    } catch {
      await checkOnlineStatus();
    } finally {
      setUsingAll(false);
    }
  }, [onlineStatus?.online, pendingItems.length, fetchInventory, checkOnlineStatus]);

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

  const canUse = onlineStatus?.online === true;

  return (
    <div className="inventory">
      <div className="inventory-header">
        <h1>🎒 Мой инвентарь</h1>
        <button
          className="btn-refresh"
          type="button"
          onClick={checkOnlineStatus}
          title="Проверить статус на сервере"
          aria-label="Обновить статус"
        >
          🔄
        </button>
      </div>

      {notice ? <div className="inventory-notice">{notice}</div> : null}

      <div className="inventory-summary">
        <div className={`summary-card ${pendingItems.length > 0 ? 'has-pending' : ''}`}>
          <span className="summary-value">{pendingItems.length}</span>
          <span className="summary-label">⏳ Ожидают получения</span>
        </div>
        <div className="summary-card">
          <span className="summary-value">{totalDeliveredItems}</span>
          <span className="summary-label">✅ Получено предметов</span>
        </div>
        <div className="summary-card">
          <span className="summary-value">{lastPurchaseAt ? formatRelative(lastPurchaseAt) : '—'}</span>
          <span className="summary-label">📤 Последний вывод</span>
        </div>
      </div>

      {onlineStatus ? (
        <div className={`online-status ${onlineStatus.online ? 'online' : 'offline'}`}>
          <span className="status-indicator">{onlineStatus.online ? '🟢' : '🔴'}</span>
          <div className="status-info">
            <div className="status-label">{onlineStatus.online ? 'Вы онлайн на сервере' : 'Вы оффлайн'}</div>
            <div className="status-detail">
              {onlineStatus.message}
              {!canUse && pendingItems.length > 0 ? ' — зайдите на сервер, чтобы получить предметы' : ''}
            </div>
          </div>
        </div>
      ) : null}

      {pendingItems.length > 0 ? (
        <section className="inventory-section">
          <div className="section-header">
            <h2>⏳ Ожидают получения ({pendingItems.length})</h2>
            <button
              className="btn-use-all"
              type="button"
              onClick={handleUseAll}
              disabled={!canUse || usingAll || usingItemId !== null}
            >
              {usingAll ? 'Выдача...' : '📦 Получить все'}
            </button>
          </div>
          <div className="inventory-list pending-list">
            {pendingItems.map((item) => (
              <article className="inventory-row pending" key={item.id}>
                {item.image_url ? (
                  <img
                    className="row-image"
                    src={getImageUrl(item.image_url)}
                    alt={item.item_name}
                    onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                  />
                ) : (
                  <div className="row-image row-image-placeholder">📦</div>
                )}
                <div className="row-main">
                  <div className="row-title">
                    <span className="item-name">{item.item_name}</span>
                    {item.quantity > 1 ? <span className="quantity-badge">×{item.quantity}</span> : null}
                  </div>
                  <div className="row-meta">
                    <span className="item-category">{CATEGORY_NAMES[item.item_category] || item.item_category}</span>
                    <span className="row-date" title={formatDate(item.purchased_at)}>
                      Куплено: {formatRelative(item.purchased_at)}
                    </span>
                  </div>
                </div>
                <button
                  className="btn-use"
                  type="button"
                  onClick={() => handleUseItem(item.id)}
                  disabled={usingItemId === item.id || usingAll || !canUse}
                >
                  {usingItemId === item.id ? '...' : 'Получить'}
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {deliveredList.length > 0 ? (
        <section className="inventory-section">
          <h2>✅ Полученные ({deliveredList.length})</h2>

          {deliveredList.length > 5 || deliveredCategories.length > 1 ? (
            <div className="inventory-filters">
              <input
                className="filter-search"
                type="search"
                placeholder="Поиск по названию..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="filter-chips">
                <button
                  className={`filter-chip ${categoryFilter === null ? 'active' : ''}`}
                  type="button"
                  onClick={() => setCategoryFilter(null)}
                >
                  Все
                </button>
                {deliveredCategories.map((category) => (
                  <button
                    className={`filter-chip ${categoryFilter === category ? 'active' : ''}`}
                    type="button"
                    key={category}
                    onClick={() => setCategoryFilter(category === categoryFilter ? null : category)}
                  >
                    {CATEGORY_NAMES[category] || category}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {filteredDelivered.length > 0 ? (
            <div className="inventory-list">
              {filteredDelivered.slice(0, visibleDelivered).map((group) => (
                <article className="inventory-row delivered" key={group.shopItemId}>
                  {group.imageUrl ? (
                    <img
                      className="row-image"
                      src={getImageUrl(group.imageUrl)}
                      alt={group.name}
                      onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                    />
                  ) : (
                    <div className="row-image row-image-placeholder">📦</div>
                  )}
                  <div className="row-main">
                    <div className="row-title">
                      <span className="item-name">{group.name}</span>
                      {group.totalQuantity > 1 ? <span className="quantity-badge">×{group.totalQuantity}</span> : null}
                    </div>
                    <div className="row-meta">
                      <span className="item-category">{CATEGORY_NAMES[group.category] || group.category}</span>
                      <span className="row-date" title={group.lastDeliveredAt ? formatDate(group.lastDeliveredAt) : ''}>
                        {group.purchases > 1 ? `${group.purchases} покупок · ` : ''}
                        {formatRelative(group.lastDeliveredAt)}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="filters-empty">Ничего не найдено</div>
          )}

          {filteredDelivered.length > visibleDelivered ? (
            <button
              className="btn-show-more"
              type="button"
              onClick={() => setVisibleDelivered((visible) => visible + PAGE_SIZE)}
            >
              Показать ещё ({filteredDelivered.length - visibleDelivered})
            </button>
          ) : null}
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
