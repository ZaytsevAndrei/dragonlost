-- Раздел "Наборы": три стартовых набора.
-- rust_item_code поддерживает формат набора: "shortname:кол-во,shortname:кол-во"
-- Выдача: каждый предмет набора посылается отдельной RCON-командой (см. inventory.ts, parseBundleCode).

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url, is_available)
SELECT * FROM (
  SELECT
    'Набор «Водолаз»' AS name,
    'Комплект для исследования морских глубин: подводная маска, баллон, гидрокостюм, ласты, подводное ружьё и 15 гарпунов.' AS description,
    'kit' AS category,
    149 AS price,
    'diving.mask:1,diving.tank:1,diving.wetsuit:1,diving.fins:1,speargun:1,speargun.spear:15' AS rust_item_code,
    1 AS quantity,
    NULL AS image_url,
    1 AS is_available
  UNION ALL
  SELECT
    'Набор «Теплохранитель»',
    'Электрификация базы: малый генератор, автоматическая турель, провод и 300 топлива низкого качества.',
    'kit',
    249,
    'electric.fuelgenerator.small:1,autoturret:1,wire:1,lowgradefuel:300',
    1,
    NULL,
    1
  UNION ALL
  SELECT
    'Набор «Ниндзя»',
    'Бесшумный старт: костюм ниндзя, полуавтоматический пистолет, 5 медицинских шприцев, 5 бинтов и 50 пистолетных патронов.',
    'kit',
    99,
    'attire.ninja.suit:1,pistol.semiauto:1,syringe.medical:5,bandage:5,ammo.pistol:50',
    1,
    NULL,
    1
) AS new_items
WHERE NOT EXISTS (
  SELECT 1 FROM shop_items WHERE name = 'Набор «Водолаз»' OR name = 'Набор «Теплохранитель»' OR name = 'Набор «Ниндзя»'
);
