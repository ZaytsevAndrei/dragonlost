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
