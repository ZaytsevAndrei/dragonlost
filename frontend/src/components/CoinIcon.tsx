import { useId } from 'react';
import { COIN_VIEW_BOX, CoinSvgBody } from './coinIconMarkup';
import './CoinIcon.css';

export type CoinIconSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_PX: Record<CoinIconSize, number> = {
  xs: 16,
  sm: 18,
  md: 20,
  lg: 24,
};

interface CoinIconProps {
  size?: CoinIconSize;
  className?: string;
  /** Пустая строка — декоративная иконка без подписи для screen readers */
  title?: string;
}

/** Золотая монета DragonLost с буквой D. */
function CoinIcon({ size = 'sm', className = '', title = 'монеты DragonLost' }: CoinIconProps) {
  const px = SIZE_PX[size];
  const gradPrefix = useId().replace(/:/g, '');
  const decorative = title === '';

  return (
    <svg
      className={`coin-icon coin-icon--${size} ${className}`.trim()}
      width={px}
      height={px}
      viewBox={COIN_VIEW_BOX}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : title}
    >
      <CoinSvgBody gradPrefix={gradPrefix} />
    </svg>
  );
}

export default CoinIcon;
