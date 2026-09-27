// Подсветка отдельных товаров магазина по названию (name из shop_items).
// «Мифический» — топ-редкость выше легендарной, красный цвет как в колесе удачи
// (FORTUNE_WHEEL_RARITY_COLORS.mythic) и в редкостях Rust.

const MYTHIC_SHOP_ITEM_NAMES = new Set([
  'Набор «Спасатель рейдов»',
]);

export function isMythicShopItem(item: { name?: unknown; title?: unknown }): boolean {
  const name = String(item.name ?? item.title ?? '').trim();
  return name !== '' && MYTHIC_SHOP_ITEM_NAMES.has(name);
}
