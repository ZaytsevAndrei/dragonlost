-- Откат миграции 028: убираем из кита "Зимний старт" предметы со скинами
-- (Arctic Protection, Poncho, No Mercy Small Backpack) и упоминание сета из описания.
-- Код сайта вернулся к формату "shortname:кол-во" без поддержки skin ID.

UPDATE shop_items
SET rust_item_code = REPLACE(
  rust_item_code,
  ',burlap.headwrap:1:2919008922,burlap.shirt:1:2911362787,burlap.trousers:1:2911361380,burlap.shoes:1:2919007475,attire.hide.poncho:1:2856159140,smallbackpack:1:3772772590',
  ''
)
WHERE category = 'kit'
  AND name LIKE '%Зимний старт%'
  AND rust_item_code LIKE '%smallbackpack:1:3772772590%';

UPDATE shop_items
SET description = REPLACE(
  description,
  ' Плюс зимний сет Arctic Protection: повязка, рубашка, штаны и ботинки из мешковины, пончо и малый рюкзак No Mercy.',
  ''
)
WHERE category = 'kit'
  AND name LIKE '%Зимний старт%'
  AND description LIKE '%Arctic Protection%';
