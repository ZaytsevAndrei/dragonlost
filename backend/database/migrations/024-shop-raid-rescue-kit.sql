-- Раздел "Наборы": четвёртый набор "Спасатель рейдов" (иконка kit.raidrescue.png).
-- rust_item_code в формате набора: "shortname:кол-во,shortname:кол-во"

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url, is_available)
SELECT * FROM (
  SELECT
    'Набор «Спасатель рейдов»' AS name,
    'Быстрый рейд: 2 таймед-заряда C4, 2 кассетных заряда и 2 противопехотные мины для охраны входа.' AS description,
    'kit' AS category,
    299 AS price,
    'explosive.timed:2,explosive.satchel:2,trap.landmine:2' AS rust_item_code,
    1 AS quantity,
    '/uploads/shop/kit.raidrescue.png' AS image_url,
    1 AS is_available
) AS new_items
WHERE NOT EXISTS (
  SELECT 1 FROM shop_items WHERE name = 'Набор «Спасатель рейдов»'
);
