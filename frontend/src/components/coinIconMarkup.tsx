/** Общая разметка золотой монеты DragonLost. */
export const COIN_VIEW_BOX = '0 0 24 24';

/** Сплошная D по центру viewBox 24×24 */
export const COIN_D_PATH =
  'M6.5 4.5h3.5c4.5 0 7.5 3 7.5 7.5s-3 7.5-7.5 7.5H6.5V4.5Z';

export function coinBgGradientId(prefix: string): string {
  return `${prefix}-coin-bg`;
}

function CoinGoldDefs({ gradPrefix }: { gradPrefix: string }) {
  const bgId = coinBgGradientId(gradPrefix);

  return (
    <defs>
      <radialGradient id={bgId} cx="34%" cy="30%" r="72%">
        <stop offset="0%" stopColor="#fff8e1" />
        <stop offset="28%" stopColor="#ffd54f" />
        <stop offset="58%" stopColor="#f9a825" />
        <stop offset="100%" stopColor="#b8860b" />
      </radialGradient>
    </defs>
  );
}

export function CoinSvgLayers({ gradPrefix }: { gradPrefix: string }) {
  const bgId = coinBgGradientId(gradPrefix);

  return (
    <>
      <CoinGoldDefs gradPrefix={gradPrefix} />
      <circle cx="12" cy="12" r="11" fill={`url(#${bgId})`} stroke="#8b6914" strokeWidth="0.85" />
      <circle cx="12" cy="12" r="9.25" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.6" />
      <ellipse cx="9.2" cy="8.4" rx="3.1" ry="1.5" fill="rgba(255,255,255,0.38)" transform="rotate(-28 9.2 8.4)" />
      <path fill="#5c4210" d={COIN_D_PATH} />
    </>
  );
}

export function CoinSvgBody({ gradPrefix }: { gradPrefix: string }) {
  return <CoinSvgLayers gradPrefix={gradPrefix} />;
}
