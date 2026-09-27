-- Раздел "Наборы": пятый набор "Боец" (обложка kit.fighter.png).
-- rust_item_code в формате набора: "shortname:кол-во,shortname:кол-во"

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url, is_available)
SELECT * FROM (
  SELECT
    'Набор «Боец»' AS name,
    'Экипировка бойца: антирадиационный костюм, полуавтоматическая винтовка, 100 патронов 5.56 мм, 10 медицинских шприцев и 10 бинтов.' AS description,
    'kit' AS category,
    199 AS price,
    'hazmatsuit:1,rifle.semiauto:1,ammo.rifle:100,syringe.medical:10,bandage:10' AS rust_item_code,
    1 AS quantity,
    '/uploads/shop/kit.fighter.png' AS image_url,
    1 AS is_available
) AS new_items
WHERE NOT EXISTS (
  SELECT 1 FROM shop_items WHERE name = 'Набор «Боец»'
);
