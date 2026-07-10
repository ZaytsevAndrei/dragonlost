/** Общая разметка монеты DragonLost для CoinIcon и SVG-колеса. */
export const COIN_VIEW_BOX = '0 0 24 24';

/** Сплошная D по центру viewBox 24×24 */
export const COIN_D_PATH =
  'M6.5 4.5h3.5c4.5 0 7.5 3 7.5 7.5s-3 7.5-7.5 7.5H6.5V4.5Z';

export function coinBgGradientId(prefix: string): string {
  return `${prefix}-coin-bg`;
}

export function CoinSvgBody({ gradPrefix }: { gradPrefix: string }) {
  const bgId = coinBgGradientId(gradPrefix);

  return (
    <>
      <defs>
        <linearGradient id={bgId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#d32f2f" />
          <stop offset="50%" stopColor="#607d8b" />
          <stop offset="100%" stopColor="#3949ab" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill={`url(#${bgId})`} stroke="#455a64" strokeWidth="0.75" />
      <path fill="#fff" d={COIN_D_PATH} />
    </>
  );
}
