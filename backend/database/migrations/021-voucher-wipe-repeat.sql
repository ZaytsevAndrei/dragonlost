-- Миграция: режим «раз в вайп» для промокодов
-- Дата: 2026-09-24
-- Запуск: mysql -u ... -p dragonlost_web < backend/database/migrations/021-voucher-wipe-repeat.sql

USE dragonlost_web;

ALTER TABLE voucher_codes
  ADD COLUMN wipe_repeat TINYINT(1) NOT NULL DEFAULT 0 AFTER weekly_repeat;

-- Промокод WIPE работает повторно после каждого вайпа
UPDATE voucher_codes SET wipe_repeat = 1 WHERE LOWER(code) = 'wipe';
