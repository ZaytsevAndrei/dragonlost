/** Общая разметка монеты DragonLost для CoinIcon и SVG-колеса. */
export const COIN_VIEW_BOX = '0 0 24 24';

export function coinBgGradientId(prefix: string): string {
  return `${prefix}-coin-bg`;
}

export function CoinSvgBody({ gradPrefix }: { gradPrefix: string }) {
  const bgId = coinBgGradientId(gradPrefix);

  return (
    <>
      <defs>
        <radialGradient id={bgId} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ef5350" />
          <stop offset="100%" stopColor="#b71c1c" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill={`url(#${bgId})`} stroke="#7a0c0c" strokeWidth="1" />
      <circle cx="9.5" cy="9" r="2.8" fill="rgba(255,255,255,0.22)" />
      <path
        fill="#fff"
        d="M8.25 6.75h2.85c3.55 0 5.9 2.35 5.9 5.85s-2.35 5.85-5.9 5.85H8.25V6.75Z"
      />
    </>
  );
}
