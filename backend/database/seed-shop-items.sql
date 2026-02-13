-- Расширенный каталог товаров магазина (Rust).
-- Запуск: mysql ... dragonlost_web < backend/database/seed-shop-items.sql
-- Повторный запуск не создаёт дубликаты (проверка по rust_item_code).

USE dragonlost_web;

-- Оружие: M249, Thompson, SAR, MP5, патроны, гранаты
INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'M249' AS name,
  'Ручной пулемёт, высокая скорострельность' AS description,
  'weapon' AS category,
  250.00 AS price,
  'lmg.m249' AS rust_item_code,
  1 AS quantity,
  'https://rustlabs.com/img/items180/lmg.m249.png' AS image_url
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'lmg.m249' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Thompson', 'Пистолет-пулемёт Томпсон', 'weapon', 130.00, 'smg.thompson', 1, 'https://rustlabs.com/img/items180/smg.thompson.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'smg.thompson' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Semi-Automatic Rifle', 'Полуавтоматическая винтовка', 'weapon', 160.00, 'rifle.semiauto', 1, 'https://rustlabs.com/img/items180/rifle.semiauto.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'rifle.semiauto' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'MP5A4', 'Пистолет-пулемёт MP5', 'weapon', 125.00, 'smg.mp5', 1, 'https://rustlabs.com/img/items180/smg.mp5.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'smg.mp5' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  '5.56 Ammo x128', 'Патроны 5.56 для винтовок', 'weapon', 45.00, 'ammo.rifle', 128, 'https://rustlabs.com/img/items180/ammo.rifle.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'ammo.rifle' AND quantity = 128 LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Beancan Grenade x5', '5 гранат Beancan', 'weapon', 55.00, 'grenade.beancan', 5, 'https://rustlabs.com/img/items180/grenade.beancan.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'grenade.beancan' AND quantity = 5 LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'F1 Grenade x3', '3 гранаты F1', 'weapon', 50.00, 'grenade.f1', 3, 'https://rustlabs.com/img/items180/grenade.f1.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'grenade.f1' AND quantity = 3 LIMIT 1);

-- Броня: одежда, ноги, голова
INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Metal Helmet', 'Металлический шлем', 'armor', 65.00, 'metal.plate.helmet', 1, 'https://rustlabs.com/img/items180/metal.plate.helmet.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'metal.plate.helmet' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Metal Pants', 'Металлические поножи', 'armor', 65.00, 'metal.plate.pants', 1, 'https://rustlabs.com/img/items180/metal.plate.pants.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'metal.plate.pants' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Hoodie', 'Толстовка с капюшоном', 'armor', 25.00, 'hoodie', 1, 'https://rustlabs.com/img/items180/hoodie.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'hoodie' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Pants', 'Штаны', 'armor', 20.00, 'pants', 1, 'https://rustlabs.com/img/items180/pants.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'pants' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Boots', 'Ботинки', 'armor', 15.00, 'shoes.boots', 1, 'https://rustlabs.com/img/items180/shoes.boots.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'shoes.boots' LIMIT 1);

-- Инструменты: кирка, топор, фонарик
INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Pickaxe', 'Кирка для добычи руды', 'tool', 35.00, 'pickaxe', 1, 'https://rustlabs.com/img/items180/pickaxe.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'pickaxe' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Hatchet', 'Топор для рубки дерева', 'tool', 30.00, 'hatchet', 1, 'https://rustlabs.com/img/items180/hatchet.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'hatchet' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Flashlight', 'Ручной фонарик', 'tool', 15.00, 'flashlight.held', 1, 'https://rustlabs.com/img/items180/flashlight.held.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'flashlight.held' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Salvaged Icepick', 'Ледоруб, быстрая добыча', 'tool', 55.00, 'icepick.salvaged', 1, 'https://rustlabs.com/img/items180/icepick.salvaged.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'icepick.salvaged' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Metal Hatchet', 'Металлический топор', 'tool', 45.00, 'hatchet.metal', 1, 'https://rustlabs.com/img/items180/hatchet.metal.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'hatchet.metal' LIMIT 1);

-- Ресурсы: дерево, камень, металл, сера, HQM в разных объёмах; взрывчатка
INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Wood x5000', '5000 древесины', 'resource', 40.00, 'wood', 5000, 'https://rustlabs.com/img/items180/wood.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'wood' AND quantity = 5000 LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Stone x5000', '5000 камня', 'resource', 45.00, 'stones', 5000, 'https://rustlabs.com/img/items180/stones.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'stones' AND quantity = 5000 LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Metal Fragments x500', '500 металлических фрагментов', 'resource', 28.00, 'metal.fragments', 500, 'https://rustlabs.com/img/items180/metal.fragments.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'metal.fragments' AND quantity = 500 LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'High Quality Metal x50', '50 высококачественного металла', 'resource', 45.00, 'metal.refined', 50, 'https://rustlabs.com/img/items180/metal.refined.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'metal.refined' AND quantity = 50 LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Sulfur x500', '500 серы', 'resource', 35.00, 'sulfur', 500, 'https://rustlabs.com/img/items180/sulfur.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'sulfur' AND quantity = 500 LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Explosive Ammo x20', '20 взрывных патронов', 'resource', 80.00, 'ammo.rifle.explosive', 20, 'https://rustlabs.com/img/items180/ammo.rifle.explosive.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'ammo.rifle.explosive' AND quantity = 20 LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Satchel Charge x4', '4 сатчеловых заряда', 'resource', 180.00, 'explosive.satchel', 4, 'https://rustlabs.com/img/items180/explosive.satchel.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'explosive.satchel' AND quantity = 4 LIMIT 1);

-- Медикаменты: шприцы, аптечки, бинты, антирад
INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Medical Syringe x10', '10 медицинских шприцев', 'medical', 70.00, 'syringe.medical', 10, 'https://rustlabs.com/img/items180/syringe.medical.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'syringe.medical' AND quantity = 10 LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Large Medkit x5', '5 больших аптечек', 'medical', 55.00, 'largemedkit', 5, 'https://rustlabs.com/img/items180/largemedkit.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'largemedkit' AND quantity = 5 LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Bandage x10', '10 бинтов', 'medical', 25.00, 'bandage', 10, 'https://rustlabs.com/img/items180/bandage.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'bandage' AND quantity = 10 LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Anti-Radiation Pills x5', '5 антирадиационных таблеток', 'medical', 30.00, 'antidote.radiation', 5, 'https://rustlabs.com/img/items180/antidote.radiation.png'
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'antidote.radiation' AND quantity = 5 LIMIT 1);

-- Наборы (дополнительные)
INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Fighter Kit', 'Набор бойца: LR-300, броня, патроны, медикаменты', 'kit', 350.00, 'fighter_kit', 1, NULL
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'fighter_kit' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, image_url)
SELECT * FROM (SELECT
  'Sniper Kit', 'Снайперский набор: Bolt, патроны, броня', 'kit', 320.00, 'sniper_kit', 1, NULL
) AS t WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'sniper_kit' LIMIT 1);
