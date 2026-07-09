import CoinIcon, { type CoinIconSize } from './CoinIcon';
import { formatCoinNumber, pluralCoins } from '../utils/currency';
import './CoinAmount.css';

interface CoinAmountProps {
  value: number;
  size?: CoinIconSize;
  decimals?: number;
  signed?: boolean;
  withLabel?: boolean;
  className?: string;
}

function CoinAmount({
  value,
  size = 'sm',
  decimals = 0,
  signed = false,
  withLabel = false,
  className = '',
}: CoinAmountProps) {
  const prefix = signed && value > 0 ? '+' : '';
  const amount = formatCoinNumber(value, decimals);

  return (
    <span className={`coin-amount coin-amount--${size} ${className}`.trim()}>
      <span className="coin-amount__value">
        {prefix}
        {amount}
      </span>
      <CoinIcon size={size} className="coin-amount__icon" />
      {withLabel ? <span className="coin-amount__label">{pluralCoins(value)}</span> : null}
    </span>
  );
}

export default CoinAmount;
