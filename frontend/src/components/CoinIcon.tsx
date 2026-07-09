import { useId } from 'react';
import './CoinIcon.css';

export type CoinIconSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_PX: Record<CoinIconSize, number> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
};

interface CoinIconProps {
  size?: CoinIconSize;
  className?: string;
  /** Пустая строка — декоративная иконка без подписи для screen readers */
  title?: string;
}

/** Монета DragonLost: красный круг с золотой буквой D в драконьем стиле. */
function CoinIcon({ size = 'sm', className = '', title = 'монеты DragonLost' }: CoinIconProps) {
  const px = SIZE_PX[size];
  const uid = useId().replace(/:/g, '');
  const gradId = `dl-coin-${uid}`;
  const decorative = title === '';

  return (
    <svg
      className={`coin-icon coin-icon--${size} ${className}`.trim()}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : title}
    >
      <defs>
        <linearGradient id={`${gradId}-bg`} x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ef5555" />
          <stop offset="55%" stopColor="#c62828" />
          <stop offset="100%" stopColor="#8b1212" />
        </linearGradient>
        <linearGradient id={`${gradId}-d`} x1="8" y1="5" x2="18" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff9ef" />
          <stop offset="45%" stopColor="#f5d998" />
          <stop offset="100%" stopColor="#d4a84a" />
        </linearGradient>
        <filter id={`${gradId}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0.5" stdDeviation="0.4" floodColor="#5a0808" floodOpacity="0.45" />
        </filter>
      </defs>

      <circle cx="12" cy="12" r="10.5" fill={`url(#${gradId}-bg)`} stroke="#6b0e0e" strokeWidth="1" />
      <circle cx="12" cy="12" r="8.25" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="0.75" />
      <ellipse cx="9.2" cy="8.8" rx="2.2" ry="1.1" fill="rgba(255,255,255,0.18)" transform="rotate(-28 9.2 8.8)" />

      <g filter={`url(#${gradId}-glow)`}>
        {/* D с «рогом» дракона и изогнутым хребтом */}
        <path
          d="M10.4 5.8 9.1 4.2l1.35-.45.75 1.35-.8-.3z"
          fill={`url(#${gradId}-d)`}
        />
        <path
          d="M10.15 6.4c-.25 1.1-.45 2.35-.7 3.85l-.95 5.9c-.12.95.45 1.75 1.55 1.75h2.85c3.05 0 5.15-2.35 5.15-5.95C18.15 8.35 16.05 6 13 6H10.15z"
          fill={`url(#${gradId}-d)`}
        />
        <path
          d="M10.55 8.6H13c2.05 0 3.4 1.7 3.4 4.35S15.05 17.3 13 17.3h-2.35l.9-8.7z"
          fill="#9b1515"
          opacity="0.22"
        />
      </g>
    </svg>
  );
}

export default CoinIcon;
