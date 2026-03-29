-- Расширение промокодов: сроки, лимиты активаций, недельный сброс на пользователя, журнал активаций
-- Дата: 2026-03-29
-- Запуск: mysql -u ... -p dragonlost_web < backend/database/migrations/009-voucher-redemptions-and-rules.sql
--
-- Не применять, если voucher_codes уже содержит колонки valid_from, weekly_repeat и т.д.
-- (например после полного init.sql с актуальной схемой).

USE dragonlost_web;

-- Новые поля (однократный запуск миграции)
ALTER TABLE voucher_codes
  ADD COLUMN valid_from DATETIME NULL DEFAULT NULL,
  ADD COLUMN valid_until DATETIME NULL DEFAULT NULL,
  ADD COLUMN max_activations_total INT NULL DEFAULT NULL COMMENT 'NULL = без лимита по количеству',
  ADD COLUMN activations_count INT NOT NULL DEFAULT 0,
  ADD COLUMN max_activations_per_user INT NOT NULL DEFAULT 1,
  ADD COLUMN weekly_repeat TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = лимит max_activations_per_user на календарную ISO-неделю',
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS voucher_redemptions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  voucher_id INT NOT NULL,
  user_id INT NOT NULL,
  steamid VARCHAR(32) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (voucher_id) REFERENCES voucher_codes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_vr_voucher_user (voucher_id, user_id),
  INDEX idx_vr_voucher_week (voucher_id, user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Старые одноразовые записи: перенос в журнал и счётчик
UPDATE voucher_codes SET activations_count = 1 WHERE used_by IS NOT NULL AND activations_count = 0;

INSERT INTO voucher_redemptions (voucher_id, user_id, steamid, amount, created_at)
SELECT v.id, v.used_by, u.steamid, v.amount, COALESCE(v.used_at, NOW())
FROM voucher_codes v
INNER JOIN users u ON u.id = v.used_by
WHERE v.used_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM voucher_redemptions x WHERE x.voucher_id = v.id LIMIT 1
  );

UPDATE voucher_codes v
SET activations_count = (SELECT COUNT(*) FROM voucher_redemptions r WHERE r.voucher_id = v.id);
