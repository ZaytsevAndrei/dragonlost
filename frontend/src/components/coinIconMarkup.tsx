/** Общая разметка знака монеты DragonLost (буква D без фона). */
export const COIN_VIEW_BOX = '0 0 24 24';

/** Сплошная D по центру viewBox 24×24 */
export const COIN_D_PATH =
  'M6.5 4.5h3.5c4.5 0 7.5 3 7.5 7.5s-3 7.5-7.5 7.5H6.5V4.5Z';

export function CoinSvgBody() {
  return <path fill="currentColor" d={COIN_D_PATH} />;
}
