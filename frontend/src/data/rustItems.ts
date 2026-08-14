import items from './rustItems.json';

export interface RustItem {
  shortname: string;
  name: string;
  category: string;
}

export const RUST_ITEMS: RustItem[] = items as RustItem[];

const byShortname = new Map(RUST_ITEMS.map((item) => [item.shortname, item]));

export function findRustItem(shortname: string): RustItem | undefined {
  return byShortname.get(shortname);
}

export function rustItemIconUrl(shortname: string): string {
  return `https://wiki.rustclash.com/img/items180/${encodeURIComponent(shortname)}.png`;
}

export function searchRustItems(query: string, limit = 40): RustItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return RUST_ITEMS.slice(0, limit);
  const results: RustItem[] = [];
  for (const item of RUST_ITEMS) {
    if (
      item.shortname.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    ) {
      results.push(item);
      if (results.length >= limit) break;
    }
  }
  return results;
}
