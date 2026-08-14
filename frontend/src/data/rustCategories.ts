export const RUST_CATEGORY_IDS = [
  'Weapon',
  'Construction',
  'Items',
  'Resources',
  'Attire',
  'Tool',
  'Medical',
  'Food',
  'Ammunition',
  'Traps',
  'Misc',
  'Component',
  'Electrical',
  'Fun',
] as const;

export type RustCategoryId = (typeof RUST_CATEGORY_IDS)[number];

export const RUST_CATEGORIES: { id: RustCategoryId; label: string }[] = [
  { id: 'Weapon', label: 'Оружие' },
  { id: 'Construction', label: 'Конструкции' },
  { id: 'Items', label: 'Предметы' },
  { id: 'Resources', label: 'Ресурсы' },
  { id: 'Attire', label: 'Одежда' },
  { id: 'Tool', label: 'Инструменты' },
  { id: 'Medical', label: 'Медицина' },
  { id: 'Food', label: 'Еда' },
  { id: 'Ammunition', label: 'Боеприпасы' },
  { id: 'Traps', label: 'Ловушки' },
  { id: 'Misc', label: 'Прочее' },
  { id: 'Component', label: 'Компоненты' },
  { id: 'Electrical', label: 'Электричество' },
  { id: 'Fun', label: 'Развлечения' },
];

export function rustCategoryLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return RUST_CATEGORIES.find((c) => c.id === id)?.label ?? null;
}

/** Числовые TargetCategory из экспорта Industrial Conveyor в игре */
export const RUST_TARGET_CATEGORY_LABELS: Record<number, string> = {
  0: 'Оружие',
  1: 'Конструкции',
  2: 'Предметы',
  3: 'Ресурсы',
  4: 'Одежда',
  5: 'Инструменты',
  6: 'Медицина',
  7: 'Еда',
  8: 'Боеприпасы',
  9: 'Ловушки',
  10: 'Прочее',
  11: 'Компоненты',
  12: 'Электричество',
  13: 'Развлечения',
};

export function rustTargetCategoryLabel(id: number | null | undefined): string | null {
  if (id === null || id === undefined || !Number.isFinite(id)) return null;
  return RUST_TARGET_CATEGORY_LABELS[id] ?? `Категория ${id}`;
}
