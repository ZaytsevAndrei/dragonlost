-- Картинки для наборов из миграции 020: ниндзя, водолаз, теплохранитель (турель).
-- Файлы лежат в uploads/shop/ и раздаются статикой как у остальных товаров.

UPDATE `shop_items` SET `image_url` = '/uploads/shop/kit.ninja.png'  WHERE `category` = 'kit' AND `name` = 'Набор «Ниндзя»';
UPDATE `shop_items` SET `image_url` = '/uploads/shop/kit.diver.png'  WHERE `category` = 'kit' AND `name` = 'Набор «Водолаз»';
UPDATE `shop_items` SET `image_url` = '/uploads/shop/kit.turret.png' WHERE `category` = 'kit' AND `name` = 'Набор «Теплохранитель»';
