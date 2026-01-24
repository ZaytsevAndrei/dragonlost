import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
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

const CATEGORY_NAMES: Record<string, string> = {
  weapon: '🔫 Оружие',
  armor: '🛡️ Броня',
  tool: '🔨 Инструменты',
  resource: '📦 Ресурсы',
  medical: '💊 Медикаменты',
  kit: '🎁 Наборы',
};

function Shop() {
  const { user } = useAuthStore();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [balance, setBalance] = useState<PlayerBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [purchasing, setPurchasing] = useState<number | null>(null);

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
        setBalance(balanceResponse.data);
      }

      setError(null);
    } catch (err) {
      setError('Не удалось загрузить данные магазина');
      console.error(err);
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

    if (!confirm(`Вы уверены, что хотите купить "${itemName}" за ${price} монет?`)) {
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
            balance: response.data.new_balance,
            total_spent: balance.total_spent + price,
          });
        }
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Ошибка при покупке';
      alert(errorMsg);
      console.error(err);
    } finally {
      setPurchasing(null);
    }
  };

  const filteredItems = selectedCategory === 'all' 
    ? items 
    : items.filter(item => item.category === selectedCategory);

  const categories = ['all', ...new Set(items.map(item => item.category))];

  if (loading) {
    return (
      <div className="shop">
        <h1>Магазин</h1>
        <div className="loading">Загрузка...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shop">
        <h1>Магазин</h1>
        <div className="error">{error}</div>
        <button onClick={fetchShopData} className="btn-retry">
          Попробовать снова
        </button>
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
            <div className="balance-amount">💰 {balance.balance.toFixed(2)} монет</div>
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
            {item.image_url && (
              <div className="item-image">
                <img 
                  src={item.image_url} 
                  alt={item.name}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
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
                <div className="item-price">💰 {item.price} монет</div>
                <button
                  className="btn-purchase"
                  onClick={() => handlePurchase(item.id, item.name, item.price)}
                  disabled={!user || purchasing === item.id || (balance && balance.balance < item.price)}
                >
                  {purchasing === item.id ? 'Покупка...' : 'Купить'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredItems.length === 0 && (
        <div className="no-items">
          Предметы не найдены
        </div>
      )}
    </div>
  );
}

export default Shop;
