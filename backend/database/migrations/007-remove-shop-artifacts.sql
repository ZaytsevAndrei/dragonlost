-- Миграция: глубокая зачистка артефактов магазина и оплаты
-- Дата: 2026-03-18
-- Запуск: mysql -u ... -p dragonlost_web < backend/database/migrations/007-remove-shop-artifacts.sql

USE dragonlost_web;

START TRANSACTION;

-- Удаляем магазинные таблицы (дочерние -> родительские)
DROP TABLE IF EXISTS player_inventory;
DROP TABLE IF EXISTS shop_items;
DROP TABLE IF EXISTS voucher_codes;
DROP TABLE IF EXISTS payment_orders;

-- Удаляем следы магазинных транзакций
DELETE FROM transactions
WHERE type IN ('purchase', 'refund');

-- Нормализуем enum транзакций под текущую бизнес-логику (только награды)
ALTER TABLE transactions
  MODIFY COLUMN type ENUM('earn') NOT NULL;

COMMIT;
