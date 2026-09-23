-- Миграция: добаляем недостающие колонки voucher_codes (часть ALTER из 009, которая не применилась на проде)
-- Дата: 2026-09-24
-- Запуск: npm run migrate:022  (в backend/)
--
-- Контекст: на продакшене таблица voucher_redemptions из 009 создалась,
-- а ALTER TABLE voucher_codes с колонками правил промокодов — нет.
-- Перед запуском убедитесь, что перечисленных колонок нет: SHOW COLUMNS FROM voucher_codes;

USE dragonlost_web;

ALTER TABLE voucher_codes
  ADD COLUMN valid_from DATETIME NULL DEFAULT NULL,
  ADD COLUMN valid_until DATETIME NULL DEFAULT NULL,
  ADD COLUMN max_activations_total INT NULL DEFAULT NULL COMMENT 'NULL = без лимита по количеству',
  ADD COLUMN activations_count INT NOT NULL DEFAULT 0,
  ADD COLUMN max_activations_per_user INT NOT NULL DEFAULT 1,
  ADD COLUMN weekly_repeat TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = лимит max_activations_per_user на календарную ISO-неделю',
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Перенос старых одноразовых активаций в счётчик (безопасно при повторном запуске)
UPDATE voucher_codes SET activations_count = 1 WHERE used_by IS NOT NULL AND activations_count = 0;
