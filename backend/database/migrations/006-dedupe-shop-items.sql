-- Миграция: удаление дублей в shop_items и защита от повторов
-- Дата: 2026-03-03
-- Запуск: mysql -u ... -p dragonlost_web < backend/database/migrations/006-dedupe-shop-items.sql

USE dragonlost_web;

-- 1) Определяем "основной" ID для каждой группы идентичных товаров
CREATE TEMPORARY TABLE tmp_shop_item_keep AS
SELECT
  rust_item_code,
  quantity,
  category,
  MIN(id) AS keep_id
FROM shop_items
GROUP BY rust_item_code, quantity, category;

-- 2) Строим карту дублей -> keep_id
CREATE TEMPORARY TABLE tmp_shop_item_dupes AS
SELECT
  s.id AS duplicate_id,
  k.keep_id
FROM shop_items s
JOIN tmp_shop_item_keep k
  ON s.rust_item_code = k.rust_item_code
 AND s.quantity = k.quantity
 AND s.category = k.category
WHERE s.id <> k.keep_id;

-- 3) Переносим ссылки инвентаря со старых ID на keep_id
UPDATE player_inventory pi
JOIN tmp_shop_item_dupes d
  ON pi.shop_item_id = d.duplicate_id
SET pi.shop_item_id = d.keep_id;

-- 4) Удаляем дубли
DELETE s
FROM shop_items s
JOIN tmp_shop_item_dupes d
  ON s.id = d.duplicate_id;

-- 5) Добавляем уникальный индекс (если его ещё нет)
SET @has_index := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'shop_items'
    AND index_name = 'uk_shop_items_identity'
);

SET @sql := IF(
  @has_index = 0,
  'ALTER TABLE shop_items ADD UNIQUE KEY uk_shop_items_identity (rust_item_code, quantity, category)',
  'SELECT ''uk_shop_items_identity already exists'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

DROP TEMPORARY TABLE IF EXISTS tmp_shop_item_dupes;
DROP TEMPORARY TABLE IF EXISTS tmp_shop_item_keep;
