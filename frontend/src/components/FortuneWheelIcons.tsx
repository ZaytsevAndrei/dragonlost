/** SVG-иконки для страницы колеса удачи — вместо эмодзи, в стиле пиксель-арт предметов. */

interface IconProps {
  className?: string;
}

/** Пиксельный ящик — заглушка для приза без картинки. */
export function PixelCrateIcon({
  className,
  width = 48,
  height = 48,
}: IconProps & { width?: number; height?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={width}
      height={height}
      className={className}
      aria-hidden
      shapeRendering="crispEdges"
    >
      <rect x="3" y="4" width="18" height="16" fill="#7c4f23" />
      <rect x="3" y="4" width="18" height="2" fill="#a1713a" />
      <rect x="3" y="9" width="18" height="2" fill="#8c5c2b" />
      <rect x="3" y="14" width="18" height="2" fill="#8c5c2b" />
      <rect x="3" y="18" width="18" height="2" fill="#5e3a17" />
      <rect x="3" y="4" width="2" height="16" fill="#5e3a17" />
      <rect x="19" y="4" width="2" height="16" fill="#5e3a17" />
      <rect x="10" y="10" width="4" height="4" fill="#39220e" />
      <rect x="11" y="11" width="2" height="2" fill="#c9973f" />
    </svg>
  );
}

/** Копирование — для чипа метки. */
export function CopyIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      className={className}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

/** Галочка — чип метки после копирования. */
export function CheckIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      className={className}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
