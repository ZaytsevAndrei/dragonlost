-- Кит "Зимний старт": добавляем зимнюю экипировку со скинами Arctic Protection
-- и малый рюкзак со скином No Mercy.
-- rust_item_code дополнен предметами с skin ID в формате "shortname:кол-во:skinid"
-- (каждый скин — официальный сторевой, выдаётся последним аргументом RCON-команды).

UPDATE shop_items
SET rust_item_code = CONCAT(
  rust_item_code,
  ',',
  'burlap.headwrap:1:2919008922,burlap.shirt:1:2911362787,burlap.trousers:1:2911361380,',
  'burlap.shoes:1:2919007475,attire.hide.poncho:1:2856159140,smallbackpack:1:3772772590'
)
WHERE category = 'kit'
  AND name LIKE '%Зимний старт%'
  AND rust_item_code NOT LIKE '%smallbackpack:1:3772772590%';

UPDATE shop_items
SET description = CONCAT(
  description,
  ' Плюс зимний сет Arctic Protection: повязка, рубашка, штаны и ботинки из мешковины, пончо и малый рюкзак No Mercy.'
)
WHERE category = 'kit'
  AND name LIKE '%Зимний старт%'
  AND description NOT LIKE '%Arctic Protection%';
