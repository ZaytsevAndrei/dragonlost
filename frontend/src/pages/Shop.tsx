import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getImageUrl } from '../services/api';
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

const DEPOSIT_AMOUNTS = [100, 300, 500, 1000, 2000, 5000];
const MIN_DEPOSIT = 10;
const MAX_DEPOSIT = 50000;

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [balance, setBalance] = useState<PlayerBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [purchasing, setPurchasing] = useState<number | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [depositAmount, setDepositAmount] = useState<number>(500);
  const [depositLoading, setDepositLoading] = useState(false);
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherLoading, setVoucherLoading] = useState(false);

  useEffect(() => {
    fetchShopData();
  }, [user]);

  useEffect(() => {
    if (searchParams.get('payment') === 'success') {
      setPaymentSuccess(true);
      setSearchParams({}, { replace: true });
      if (user) {
        api.get('/shop/balance').then((res) => {
          const d = res.data;
          setBalance({
            balance: Number(d.balance) || 0,
            total_earned: Number(d.total_earned) || 0,
            total_spent: Number(d.total_spent) || 0,
          });
        }).catch(() => {});
      }
    }
  }, [searchParams, user, setSearchParams]);

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
    } catch (err) {
      setError('Не удалось загрузить данные магазина');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (!user) return;
    const amount = depositAmount;
    if (amount < MIN_DEPOSIT || amount > MAX_DEPOSIT) {
      alert(`Сумма от ${MIN_DEPOSIT} до ${MAX_DEPOSIT}`);
      return;
    }
    try {
      setDepositLoading(true);
      const res = await api.post('/shop/deposit/create', { amount });
      const url = res.data?.redirect_url;
      if (url) {
        window.location.href = url;
        return;
      }
      alert('Не удалось создать платёж');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Ошибка при создании платежа';
      alert(msg);
    } finally {
      setDepositLoading(false);
    }
  };

  const handleVoucherRedeem = async () => {
    if (!user || !voucherCode.trim()) {
      alert('Введите код промокода');
      return;
    }
    try {
      setVoucherLoading(true);
      const res = await api.post('/shop/deposit/redeem', { code: voucherCode.trim() });
      if (res.data?.success && balance) {
        setBalance({ ...balance, balance: Number(res.data.new_balance) || 0 });
        setVoucherCode('');
        alert(`Промокод активирован! Зачислено ${res.data.amount} монет.`);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Ошибка при активации промокода';
      alert(msg);
    } finally {
      setVoucherLoading(false);
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
            balance: Number(response.data.new_balance) || 0,
            total_spent: (balance.total_spent || 0) + price,
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
            <div className="balance-amount">💰 {(balance.balance || 0).toFixed(2)} монет</div>
          </div>
        )}
      </div>

      {paymentSuccess && (
        <div className="payment-success-notice">
          Оплата прошла успешно. Баланс обновлён.
        </div>
      )}

      {!user && (
        <div className="login-notice">
          ℹ️ Войдите через Steam, чтобы совершать покупки
        </div>
      )}

      {user && (
        <div className="deposit-section">
          <h2 className="deposit-title">Пополнить счёт</h2>
          <div className="deposit-amounts">
            {DEPOSIT_AMOUNTS.map((amount) => (
              <button
                key={amount}
                type="button"
                className={`deposit-amount-btn ${depositAmount === amount ? 'active' : ''}`}
                onClick={() => setDepositAmount(amount)}
              >
                {amount} ₽
              </button>
            ))}
          </div>
          <div className="deposit-custom">
            <label>
              Своя сумма (₽):{' '}
              <input
                type="number"
                min={MIN_DEPOSIT}
                max={MAX_DEPOSIT}
                value={depositAmount}
                onChange={(e) => setDepositAmount(Number(e.target.value) || MIN_DEPOSIT)}
                className="deposit-input"
              />
            </label>
          </div>
          <button
            type="button"
            className="btn-deposit"
            onClick={handleDeposit}
            disabled={depositLoading}
          >
            {depositLoading ? 'Создание платежа...' : 'Пополнить баланс'}
          </button>
          <div className="voucher-row">
            <input
              type="text"
              placeholder="Код промокода"
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value)}
              className="voucher-input"
              disabled={voucherLoading}
            />
            <button
              type="button"
              className="btn-voucher"
              onClick={handleVoucherRedeem}
              disabled={voucherLoading || !voucherCode.trim()}
            >
              {voucherLoading ? 'Проверка...' : 'Активировать'}
            </button>
          </div>
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
                  src={getImageUrl(item.image_url)} 
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
        <div className="no-items">
          Предметы не найдены
        </div>
      )}
    </div>
  );
}

export default Shop;
