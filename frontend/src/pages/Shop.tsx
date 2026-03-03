import { useEffect, useState, type SyntheticEvent } from 'react';
import { api, getImageUrl } from '../services/api';
import { useAuthStore } from '../store/authStore';
import StatePanel from '../components/StatePanel';
import { CATEGORY_NAMES, CATEGORY_ORDER } from '../constants/shopCategories';
import './Shop.css';

interface ShopItem {
  id: number;
  name: string;
  description: string;
  category: string;
  price: number;
  rust_item_code: string;
  quantity: number;
  image_url: string;
  is_available: boolean;
}

interface PlayerBalance {
  balance: number;
  total_earned: number;
  total_spent: number;
}

function Shop() {
  const { user } = useAuthStore();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [balance, setBalance] = useState<PlayerBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [purchasing, setPurchasing] = useState<number | null>(null);
  const placeholderImage = getImageUrl('/uploads/shop/placeholder.svg');
  const resolveShopImageUrl = (url: string | null | undefined): string => {
    const normalizedUrl = typeof url === 'string' ? url.trim() : '';
    return normalizedUrl ? getImageUrl(normalizedUrl) : placeholderImage;
  };

  useEffect(() => {
    fetchShopData();
  }, [user]);

  const fetchShopData = async () => {
    try {
      setLoading(true);
      const itemsResponse = await api.get('/shop/items');
      setItems(itemsResponse.data.items);

      if (user) {
        const balanceResponse = await api.get('/shop/balance');
        // Обеспечиваем, что все значения являются числами
        const balanceData = balanceResponse.data;
        setBalance({
          balance: Number(balanceData.balance) || 0,
          total_earned: Number(balanceData.total_earned) || 0,
          total_spent: Number(balanceData.total_spent) || 0,
        });
      }

      setError(null);
    } catch {
      setError('Не удалось загрузить данные магазина');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (itemId: number, itemName: string, price: number) => {
    if (!user) {
      alert('Войдите в систему для совершения покупок');
      return;
    }

    if (balance && balance.balance < price) {
      alert('Недостаточно средств на балансе');
      return;
    }

    if (!confirm(`Вы уверены, что хотите купить "${itemName}" за ${price} рублей?`)) {
      return;
    }

    try {
      setPurchasing(itemId);
      const response = await api.post('/shop/purchase', {
        item_id: itemId,
        quantity: 1,
      });

      if (response.data.success) {
        alert(`Покупка успешна! ${itemName} добавлен в ваш инвентарь`);
        // Обновляем баланс
        if (balance) {
          setBalance({
            ...balance,
            balance: Number(response.data.new_balance) || 0,
            total_spent: (balance.total_spent || 0) + price,
          });
        }
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Ошибка при покупке';
      alert(errorMsg);
    } finally {
      setPurchasing(null);
    }
  };

  const filteredItems = selectedCategory === 'all' 
    ? items 
    : items.filter(item => item.category === selectedCategory);

  const categories = [
    'all',
    ...Array.from(new Set(items.map((item) => item.category))).sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b, 'ru');
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }),
  ];

  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    if (img.dataset.fallbackApplied === '1') {
      img.style.display = 'none';
      return;
    }
    img.dataset.fallbackApplied = '1';
    img.src = placeholderImage;
  };

  if (loading) {
    return (
      <div className="shop">
        <h1>Магазин</h1>
        <StatePanel type="loading" title="Загрузка магазина" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="shop">
        <h1>Магазин</h1>
        <StatePanel type="error" title="Не удалось загрузить магазин" message={error} actionLabel="Попробовать снова" onAction={fetchShopData} />
      </div>
    );
  }

  return (
    <div className="shop">
      <div className="shop-header">
        <h1>🛒 Магазин предметов</h1>
        {user && balance && (
          <div className="balance-card">
            <div className="balance-label">Ваш баланс:</div>
            <div className="balance-amount">{(balance.balance || 0).toFixed(2)} рублей</div>
          </div>
        )}
      </div>

      {!user && (
        <div className="login-notice">
          ℹ️ Войдите через Steam, чтобы совершать покупки
        </div>
      )}

      <div className="category-filter">
        {categories.map((category) => (
          <button
            key={category}
            className={`category-btn ${selectedCategory === category ? 'active' : ''}`}
            onClick={() => setSelectedCategory(category)}
          >
            {category === 'all' ? '📋 Все' : CATEGORY_NAMES[category] || category}
          </button>
        ))}
      </div>

      <div className="shop-grid">
        {filteredItems.map((item) => (
          <div key={item.id} className="shop-item">
            <div className="item-image">
              <img
                src={resolveShopImageUrl(item.image_url)}
                alt={item.name}
                onError={handleImageError}
              />
            </div>
            <div className="item-content">
              <div className="item-category">
                {CATEGORY_NAMES[item.category] || item.category}
              </div>
              <h3 className="item-name">{item.name}</h3>
              <p className="item-description">{item.description}</p>
              {item.quantity > 1 && (
                <div className="item-quantity">Количество: {item.quantity}</div>
              )}
              <div className="item-footer">
                <div className="item-price">{item.price} рублей</div>
                <button
                  className="btn-purchase"
                  onClick={() => handlePurchase(item.id, item.name, item.price)}
                  disabled={!user || purchasing === item.id || (balance ? balance.balance < item.price : false)}
                >
                  {purchasing === item.id ? 'Покупка...' : 'Купить'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredItems.length === 0 && (
        <StatePanel
          type="empty"
          title="Предметы не найдены"
          message="Попробуйте выбрать другую категорию или обновить список товаров."
          actionLabel="Сбросить фильтр"
          onAction={() => setSelectedCategory('all')}
        />
      )}
    </div>
  );
}

export default Shop;
