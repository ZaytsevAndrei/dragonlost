import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CoinAmount from './CoinAmount';
import CoinIcon from './CoinIcon';
import { api } from '../services/api';
import { formatCoinsWithLabel } from '../utils/currency';
import './WalletModal.css';

export type WalletModalTab = 'deposit' | 'promo';

interface PaymentMethod {
  id: string;
  alias: string | null;
  title: string;
  hint: string;
  badge: string;
  icon: string;
  min_value: number | null;
  max_value: number | null;
}

const FALLBACK_METHODS: PaymentMethod[] = [
  {
    id: 'auto',
    alias: null,
    title: 'Все способы',
    hint: 'Выбор на стороне Robokassa',
    badge: 'ALL',
    icon: '◇',
    min_value: null,
    max_value: null,
  },
  {
    id: 'SBP',
    alias: 'SBP',
    title: 'СБП',
    hint: 'Мгновенно',
    badge: 'RUB',
    icon: '⚡',
    min_value: null,
    max_value: 1000000,
  },
  {
    id: 'BankCard',
    alias: 'BankCard',
    title: 'Карта',
    hint: 'МИР / Visa / MC',
    badge: 'RUB',
    icon: '💳',
    min_value: null,
    max_value: null,
  },
  {
    id: 'BankCardHalva',
    alias: 'BankCardHalva',
    title: 'Халва',
    hint: 'Карта Халва',
    badge: 'RUB',
    icon: '🧡',
    min_value: null,
    max_value: null,
  },
];

const MIN_AMOUNT = 30;
const MAX_AMOUNT = 50000;
const DEFAULT_AMOUNT = 50;
const COIN_TO_RUB = 1;
const ROBOKASSA_SITE = 'https://www.robokassa.com/';

interface WalletModalProps {
  open: boolean;
  initialTab?: WalletModalTab;
  balance: number;
  onClose: () => void;
  onBalanceChange: (balance: number) => void;
  /** Сообщение при открытии (возврат с SuccessURL / FailURL) */
  initialDepositNotice?: { text: string; tone: 'ok' | 'error' } | null;
}

function WalletModal({
  open,
  initialTab = 'deposit',
  balance,
  onClose,
  onBalanceChange,
  initialDepositNotice = null,
}: WalletModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<WalletModalTab>(initialTab);
  const [methods, setMethods] = useState<PaymentMethod[]>(FALLBACK_METHODS);
  const [method, setMethod] = useState<string>('SBP');
  const [coins, setCoins] = useState(DEFAULT_AMOUNT);
  const [rub, setRub] = useState(DEFAULT_AMOUNT * COIN_TO_RUB);
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState<'where' | 'types' | null>(null);
  const [depositNote, setDepositNote] = useState<string | null>(null);
  const [depositNoteTone, setDepositNoteTone] = useState<'ok' | 'error' | null>(null);
  const [depositLoading, setDepositLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setPromoMessage(null);
    setPromoError(null);
    setDepositNote(initialDepositNotice?.text ?? null);
    setDepositNoteTone(initialDepositNotice?.tone ?? null);
    setDepositLoading(false);
    setHelpOpen(null);
  }, [open, initialTab, initialDepositNotice]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.get<{ methods: PaymentMethod[] }>('/shop/payment-methods');
        const next = res.data?.methods;
        if (cancelled || !Array.isArray(next) || next.length === 0) return;
        setMethods(next);
        setMethod((prev) => (next.some((m) => m.id === prev) ? prev : next[0].id));
      } catch {
        if (!cancelled) setMethods(FALLBACK_METHODS);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  const syncFromCoins = useCallback((value: number) => {
    const next = Math.min(MAX_AMOUNT, Math.max(0, Math.floor(value) || 0));
    setCoins(next);
    setRub(Math.round(next * COIN_TO_RUB));
  }, []);

  const syncFromRub = useCallback((value: number) => {
    const nextRub = Math.min(MAX_AMOUNT * COIN_TO_RUB, Math.max(0, Math.floor(value) || 0));
    setRub(nextRub);
    setCoins(Math.round(nextRub / COIN_TO_RUB));
  }, []);

  const handleDepositClick = async () => {
    if (coins < MIN_AMOUNT) {
      setDepositNote(`Минимальная сумма — ${MIN_AMOUNT} монет`);
      setDepositNoteTone('error');
      return;
    }
    if (coins > MAX_AMOUNT) {
      setDepositNote(`Максимальная сумма — ${MAX_AMOUNT} монет`);
      setDepositNoteTone('error');
      return;
    }

    try {
      setDepositLoading(true);
      setDepositNote(null);
      setDepositNoteTone(null);
      const res = await api.post<{ redirect_url: string; order_id: number }>('/shop/deposit/create', {
        amount: coins,
        method,
      });
      const redirectUrl = res.data?.redirect_url;
      if (!redirectUrl) {
        setDepositNote('Не удалось получить ссылку на оплату');
        setDepositNoteTone('error');
        return;
      }
      window.location.assign(redirectUrl);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Ошибка при создании платежа. Попробуйте позже.';
      setDepositNote(msg);
      setDepositNoteTone('error');
    } finally {
      setDepositLoading(false);
    }
  };

  const handlePromoApply = async () => {
    const code = promoCode.trim();
    if (!code) {
      setPromoError('Введите код промокода');
      setPromoMessage(null);
      return;
    }

    try {
      setPromoLoading(true);
      setPromoError(null);
      setPromoMessage(null);
      const res = await api.post<{ success: boolean; amount: number; new_balance: number }>(
        '/shop/deposit/redeem',
        { code }
      );
      if (res.data?.success) {
        setPromoCode('');
        onBalanceChange(Number(res.data.new_balance) || balance);
        setPromoMessage(`Начислено ${formatCoinsWithLabel(res.data.amount)}`);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Не удалось активировать промокод';
      setPromoError(msg);
    } finally {
      setPromoLoading(false);
    }
  };

  if (!open) return null;

  const credited = coins;

  return (
    <div className="wallet-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="wallet-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wallet-modal__top">
          <div className="wallet-modal__tabs" role="tablist" aria-label="Кошелёк">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'deposit'}
              className={`wallet-modal__tab ${tab === 'deposit' ? 'wallet-modal__tab--active' : ''}`}
              onClick={() => setTab('deposit')}
            >
              Пополнение
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'promo'}
              className={`wallet-modal__tab ${tab === 'promo' ? 'wallet-modal__tab--active' : ''}`}
              onClick={() => setTab('promo')}
            >
              Промокод
            </button>
          </div>
          <button type="button" className="wallet-modal__close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <h2 id={titleId} className="visually-hidden">
          {tab === 'deposit' ? 'Пополнение баланса' : 'Активация промокода'}
        </h2>

        {tab === 'deposit' ? (
          <div className="wallet-modal__body">
            <div className="wallet-modal__methods" role="listbox" aria-label="Способ оплаты">
              {methods.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={method === item.id}
                  className={`wallet-pay-card ${method === item.id ? 'wallet-pay-card--active' : ''}`}
                  onClick={() => setMethod(item.id)}
                >
                  <span className="wallet-pay-card__badge">{item.badge}</span>
                  <span className="wallet-pay-card__icon" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="wallet-pay-card__title">{item.title}</span>
                  <span className="wallet-pay-card__hint">{item.hint}</span>
                </button>
              ))}
            </div>

            <label className="wallet-modal__label" htmlFor="wallet-amount-coins">
              Введите сумму
            </label>
            <div className="wallet-amount-row">
              <div className="wallet-amount-field">
                <input
                  id="wallet-amount-coins"
                  type="number"
                  min={MIN_AMOUNT}
                  max={MAX_AMOUNT}
                  value={coins}
                  onChange={(e) => syncFromCoins(Number(e.target.value))}
                />
                <CoinIcon size="sm" title="" />
              </div>
              <span className="wallet-amount-swap" aria-hidden>
                ⇄
              </span>
              <div className="wallet-amount-field">
                <input
                  type="number"
                  min={MIN_AMOUNT}
                  max={MAX_AMOUNT}
                  value={rub}
                  onChange={(e) => syncFromRub(Number(e.target.value))}
                  aria-label="Сумма в рублях"
                />
                <span className="wallet-amount-currency">RUB</span>
              </div>
            </div>

            <div className="wallet-modal__summary">
              <div className="wallet-modal__summary-row">
                <span className="wallet-modal__summary-label">Будет зачислено</span>
                <CoinAmount value={credited} size="sm" decimals={0} />
              </div>
            </div>

            {depositNote ? (
              <p
                className={`wallet-modal__note${
                  depositNoteTone === 'ok'
                    ? ' wallet-modal__note--ok'
                    : depositNoteTone === 'error'
                      ? ' wallet-modal__note--error'
                      : ''
                }`}
              >
                {depositNote}
              </p>
            ) : null}

            <div className="wallet-modal__legal">
              <p className="wallet-modal__legal-text">
                Нажимая «Перейти к оплате», вы принимаете{' '}
                <Link to="/agreement" className="wallet-modal__legal-link" onClick={onClose}>
                  публичную оферту
                </Link>
                , включая условия возврата. Монеты — внутриигровая валюта DragonLost (1 ₽ = 1 монета),
                зачисляются на баланс после подтверждения оплаты.
              </p>
              <a
                className="wallet-modal__robokassa"
                href={ROBOKASSA_SITE}
                target="_blank"
                rel="noopener noreferrer"
                title="Оплата через Robokassa"
              >
                <span className="wallet-modal__robokassa-logo" aria-hidden>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8.009 8.009 0 0 1-8 8Z" />
                    <path d="M12.8 7h-2.2v10h2.2a3.5 3.5 0 0 0 0-7h.3V7Zm0 8.2h-.5V9.8h.5a1.7 1.7 0 1 1 0 3.4 1.6 1.6 0 0 1 0 2Z" />
                  </svg>
                </span>
                <span className="wallet-modal__robokassa-copy">
                  <span className="wallet-modal__robokassa-title">Оплата через Robokassa</span>
                  <span className="wallet-modal__robokassa-hint">
                    Карты, СБП и другие способы — условия на сайте платёжной системы
                  </span>
                </span>
              </a>
            </div>

            <div className="wallet-modal__footer">
              <button
                type="button"
                className="wallet-modal__gift"
                onClick={() => setTab('promo')}
                aria-label="Перейти к промокоду"
                title="Промокод"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8" />
                  <path d="M12 22V7" />
                  <path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z" />
                  <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                  <path d="M3 12h18" />
                </svg>
              </button>
              <button
                type="button"
                className="wallet-modal__primary"
                onClick={() => void handleDepositClick()}
                disabled={depositLoading}
              >
                {depositLoading ? 'Переход к оплате...' : 'Перейти к оплате →'}
              </button>
            </div>
          </div>
        ) : (
          <div className="wallet-modal__body">
            <label className="wallet-modal__label" htmlFor="wallet-promo-code">
              Введите промокод
            </label>
            <input
              id="wallet-promo-code"
              className="wallet-promo-input"
              type="text"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              placeholder="X7K2M9QPL4R"
              disabled={promoLoading}
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handlePromoApply();
              }}
            />

            <div className="wallet-help-list">
              <button
                type="button"
                className={`wallet-help-item ${helpOpen === 'where' ? 'wallet-help-item--open' : ''}`}
                onClick={() => setHelpOpen((v) => (v === 'where' ? null : 'where'))}
                aria-expanded={helpOpen === 'where'}
              >
                <span className="wallet-help-item__row">
                  <span className="wallet-help-item__icon" aria-hidden>
                    ⌕
                  </span>
                  <span>Где найти промокод?</span>
                  <span className="wallet-help-item__chevron" aria-hidden>
                    ▾
                  </span>
                </span>
                {helpOpen === 'where' ? (
                  <span className="wallet-help-item__body">
                    Промокоды публикуются в Discord, Telegram и на главной странице сайта. Также их выдают на
                    ивентах и в ежедневных наградах.
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className={`wallet-help-item ${helpOpen === 'types' ? 'wallet-help-item--open' : ''}`}
                onClick={() => setHelpOpen((v) => (v === 'types' ? null : 'types'))}
                aria-expanded={helpOpen === 'types'}
              >
                <span className="wallet-help-item__row">
                  <span className="wallet-help-item__icon" aria-hidden>
                    💬
                  </span>
                  <span>Типы промокодов</span>
                  <span className="wallet-help-item__chevron" aria-hidden>
                    ▾
                  </span>
                </span>
                {helpOpen === 'types' ? (
                  <span className="wallet-help-item__body">
                    Одноразовые — начисляют монеты на баланс один раз. Многоразовые — можно активировать до
                    исчерпания лимита использований.
                  </span>
                ) : null}
              </button>
            </div>

            {promoError ? <p className="wallet-modal__note wallet-modal__note--error">{promoError}</p> : null}
            {promoMessage ? (
              <p className="wallet-modal__note wallet-modal__note--ok">{promoMessage}</p>
            ) : null}

            <button
              type="button"
              className="wallet-modal__primary wallet-modal__primary--full"
              onClick={() => void handlePromoApply()}
              disabled={promoLoading}
            >
              {promoLoading ? 'Проверка...' : 'Применить'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default WalletModal;
