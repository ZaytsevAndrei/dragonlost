import { useCallback, useEffect, useState } from 'react';
import CoinAmount from './CoinAmount';
import WalletModal, { type WalletModalTab } from './WalletModal';
import { api } from '../services/api';
import { emitBalanceUpdated, subscribeBalanceUpdated } from '../utils/balanceEvents';
import './HeaderWallet.css';

interface HeaderWalletProps {
  enabled: boolean;
}

function HeaderWallet({ enabled }: HeaderWalletProps) {
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<WalletModalTab>('deposit');

  const fetchBalance = useCallback(async () => {
    if (!enabled) {
      setBalance(0);
      return;
    }
    try {
      setLoading(true);
      const res = await api.get<{ balance: number }>('/shop/balance');
      setBalance(Number(res.data.balance) || 0);
    } catch {
      setBalance(0);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeBalanceUpdated(setBalance);
  }, [enabled]);

  const openModal = (tab: WalletModalTab) => {
    setInitialTab(tab);
    setModalOpen(true);
  };

  const handleBalanceChange = (next: number) => {
    setBalance(next);
    emitBalanceUpdated(next);
  };

  if (!enabled) return null;

  return (
    <>
      <div className="header-wallet">
        <button
          type="button"
          className="header-wallet__promo"
          onClick={() => openModal('promo')}
          aria-label="Промокод"
          title="Промокод"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
            <path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8" />
            <path d="M12 22V7" />
            <path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z" />
            <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
            <path d="M3 12h18" />
          </svg>
        </button>
        <button
          type="button"
          className="header-wallet__balance"
          onClick={() => openModal('deposit')}
          aria-label={`Баланс ${balance} монет. Открыть пополнение`}
          title="Пополнить баланс"
          disabled={loading}
        >
          <CoinAmount value={balance} size="sm" decimals={0} />
        </button>
      </div>

      <WalletModal
        open={modalOpen}
        initialTab={initialTab}
        balance={balance}
        onClose={() => setModalOpen(false)}
        onBalanceChange={handleBalanceChange}
      />
    </>
  );
}

export default HeaderWallet;
