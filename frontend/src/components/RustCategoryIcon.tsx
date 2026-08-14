import type { CSSProperties } from 'react';

const ICON_BY_TARGET: Record<number, string> = {
  0: 'Weapon',
  1: 'Construction',
  2: 'Items',
  3: 'Resources',
  4: 'Attire',
  5: 'Tool',
  6: 'Medical',
  7: 'Food',
  8: 'Ammunition',
  9: 'Traps',
  10: 'Misc',
  11: 'Component',
  12: 'Electrical',
  13: 'Fun',
};

interface RustCategoryIconProps {
  categoryId?: string | null;
  targetCategory?: number | null;
  className?: string;
  title?: string;
}

function path(d: string) {
  return <path d={d} fill="currentColor" />;
}

/** Силуэты категорий в стиле Industrial Conveyor / инвентаря Rust */
function CategoryGlyph({ id }: { id: string }) {
  switch (id) {
    case 'Weapon':
      return path(
        'M3 14.5l1.2-1.2 2.1.4 6.2-6.2 1.6 1.6-6.2 6.2.4 2.1L7.1 19 3 14.5zm11.2-9.4l1.5-1.5 2.2.2.2 2.2-1.5 1.5-2.4-2.4zM14 18.2l5.2-1.3.8.8-3.4 3.4-.8.2-1.8-3.1z'
      );
    case 'Construction':
      return path(
        'M4 19V9l6-5 6 5v10h-3.2v-5.2H7.2V19H4zm7-12.2L6.8 10v6.6h2.2V12h4V16.6h2.2V10L11 6.8z'
      );
    case 'Items':
      return path(
        'M4 7.2L12 3l8 4.2v9.6L12 21l-8-4.2V7.2zm2 1.5v6.8l6 3.1 6-3.1V8.7l-6-3.1-6 3.1zM12 9.2l4.2 2.2-4.2 2.2-4.2-2.2L12 9.2z'
      );
    case 'Resources':
      return path(
        'M5 17.5l3.2-8.2L12 5l3.8 4.3 3.2 8.2H5zm2.3-1.6h9.4L14.6 10 12 7.2 9.4 10 7.3 15.9zM8.2 14.2h7.6l-1.2-3H9.4l-1.2 3z'
      );
    case 'Attire':
      return path(
        'M9.2 4.5c.7-.9 1.6-1.4 2.8-1.4s2.1.5 2.8 1.4L16.5 7l3.5 1.5v2.2l-3.2-.9V19H7.2v-9.2L4 10.7V8.5L7.5 7l1.7-2.5zM12 5.4c-.5 0-.9.2-1.2.6L9.5 8.2h5L13.2 6c-.3-.4-.7-.6-1.2-.6z'
      );
    case 'Tool':
      // Скрещённые гаечный ключ и молоток — как в инвентаре Rust
      return (
        <>
          <path
            fill="currentColor"
            d="M7.2 4.2c1.8 0 3.3 1.2 3.7 2.9l-2.3 2.3c-.3-.2-.7-.3-1.1-.3-1.1 0-2 .9-2 2 0 .4.1.8.3 1.1L3.4 14.6l1.8 1.8 2.4-2.4c.3.2.7.3 1.1.3 1.1 0 2-.9 2-2 0-.4-.1-.8-.3-1.1l2.3-2.3c1.7.4 2.9 1.9 2.9 3.7 0 .5-.1 1-.3 1.5l1.7 1.7c.6-1 .9-2.1.9-3.2 0-3.5-2.8-6.3-6.3-6.3-1.1 0-2.2.3-3.1.8l1.7 1.7c.4-.2.9-.3 1.4-.3z"
          />
          <path
            fill="currentColor"
            d="M9.1 14.2L4.8 18.5l1.6 1.6 4.3-4.3-1.6-1.6zm5.3-2.4l-1.7 1.7 5.1 5.5 1.6-1.5-5-5.7zM16.2 6.5l1.2-2.4 1.9.4.9 1.9-1.5 1.5-2.5-1.4z"
          />
        </>
      );
    case 'Medical':
      return path(
        'M10.2 3.5h3.6v3.2h3.2v3.6h-3.2v6.7H10.2v-6.7H7V6.7h3.2V3.5zm-4.7 14.2h13v2.3h-13v-2.3z'
      );
    case 'Food':
      return path(
        'M12 3.2c2.4 0 4.4 1.7 4.9 4H16c-.4-1.4-1.6-2.4-3.1-2.4S9.9 5.8 9.5 7.2H7.1C7.6 4.9 9.6 3.2 12 3.2zM6.5 8.5h11v2.1H16v7.7c0 1.5-1.2 2.7-2.7 2.7h-2.6c-1.5 0-2.7-1.2-2.7-2.7v-7.7H6.5V8.5zm3.5 2.1v7.5c0 .4.3.7.7.7h2.6c.4 0 .7-.3.7-.7v-7.5H10z'
      );
    case 'Ammunition':
      return path(
        'M10.5 3.2h3v3.3l1.8.9v3.1l-1.5.6v6.4l-1.8 3.3-1.8-3.3v-6.4l-1.5-.6V7.4l1.8-.9V3.2zm1.2 1.8v1.8h.6V5h-.6zm0 3.2l-.9.4v.9l.9.4.9-.4v-.9l-.9-.4zm0 3.2v5.5l.6 1.1.6-1.1v-5.5h-1.2z'
      );
    case 'Traps':
      return path(
        'M7.2 6.5l2.1 2.1L12 5.9l2.7 2.7 2.1-2.1 1.4 1.4-2.1 2.1 2.7 2.7-1.4 1.4-2.7-2.7-2.7 2.7-2.7-2.7-2.7 2.7-1.4-1.4 2.7-2.7-2.1-2.1L7.2 6.5zM6 16.5h12v2H6v-2z'
      );
    case 'Misc':
      return path(
        'M11 4h2v2.1c.9.2 1.7.6 2.4 1.2l1.5-1.5 1.4 1.4-1.5 1.5c.6.7 1 1.5 1.2 2.4H20v2h-2.1c-.2.9-.6 1.7-1.2 2.4l1.5 1.5-1.4 1.4-1.5-1.5c-.7.6-1.5 1-2.4 1.2V20h-2v-2.1c-.9-.2-1.7-.6-2.4-1.2l-1.5 1.5-1.4-1.4 1.5-1.5c-.6-.7-1-1.5-1.2-2.4H4v-2h2.1c.2-.9.6-1.7 1.2-2.4L5.8 7.2l1.4-1.4 1.5 1.5c.7-.6 1.5-1 2.4-1.2V4zm1 5.2a2.8 2.8 0 100 5.6 2.8 2.8 0 000-5.6z'
      );
    case 'Component':
      return path(
        'M10.5 3.5h3v2.2h2.3v3h2.2v3h-2.2v3H13.5v2.8h-3v-2.8H7.5v-3H5.3v-3h2.2v-3h2.3V3.5zm1.2 2.2v2h-2v2.2H7.5v.8h2.2v2.2h2v2h.6v-2h2.2v-2.2H17v-.8h-2.3V7.7h-2.2v-2h-.6z'
      );
    case 'Electrical':
      return path('M13.2 2.8L6.5 13.2h4.2l-1.2 8 8.2-12.2h-4.5l2-6.2z');
    case 'Fun':
      return path(
        'M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zm0 1.8a6.7 6.7 0 110 13.4 6.7 6.7 0 010-13.4zM9.2 9.2a1.1 1.1 0 110 2.2 1.1 1.1 0 010-2.2zm5.6 0a1.1 1.1 0 110 2.2 1.1 1.1 0 010-2.2zM8.6 13.6c.7 1.5 2 2.5 3.4 2.5s2.7-1 3.4-2.5h-1.7c-.4.7-1 1.1-1.7 1.1s-1.3-.4-1.7-1.1H8.6z'
      );
    default:
      return path(
        'M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zm.9 4v5.2H8.8v-1.8h2.3V7.5h1.8zm-1.9 7.4a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z'
      );
  }
}

export function rustTargetCategoryKey(targetCategory: number | null | undefined): string | null {
  if (targetCategory === null || targetCategory === undefined || !Number.isFinite(targetCategory)) {
    return null;
  }
  return ICON_BY_TARGET[targetCategory] ?? null;
}

export default function RustCategoryIcon({
  categoryId,
  targetCategory,
  className,
  title,
}: RustCategoryIconProps) {
  const id = categoryId || rustTargetCategoryKey(targetCategory) || 'Misc';
  const style: CSSProperties = { color: 'currentColor' };

  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      width="40"
      height="40"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <CategoryGlyph id={id} />
    </svg>
  );
}
