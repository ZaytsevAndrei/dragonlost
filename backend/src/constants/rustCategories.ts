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

export function isRustCategoryId(value: string): value is RustCategoryId {
  return (RUST_CATEGORY_IDS as readonly string[]).includes(value);
}
