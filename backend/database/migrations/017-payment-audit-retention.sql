-- Миграция: журнал оплат и хранение 5 лет (договор Robokassa п. 3.4)
-- Дата: 2026-08-14
-- Запуск: mysql -u ... -p dragonlost_web < backend/database/migrations/017-payment-audit-retention.sql

USE dragonlost_web;

-- Журнал электронных документов по оплатам. Без FK: записи не пропадают при удалении пользователя/заказа.
CREATE TABLE IF NOT EXISTS payment_audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NULL,
  steamid VARCHAR(32) NULL,
  event VARCHAR(64) NOT NULL,
  ip VARCHAR(45) NULL,
  http_method VARCHAR(8) NULL,
  payload JSON NULL,
  note VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_payment_audit_order (order_id),
  INDEX idx_payment_audit_steamid (steamid),
  INDEX idx_payment_audit_event (event),
  INDEX idx_payment_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Заказы пополнения не удаляются вместе с аккаунтом
SET @fk_name = (
  SELECT CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'payment_orders'
    AND COLUMN_NAME = 'steamid'
    AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1
);

SET @drop_sql = IF(
  @fk_name IS NOT NULL,
  CONCAT('ALTER TABLE payment_orders DROP FOREIGN KEY `', @fk_name, '`'),
  'SELECT 1'
);
PREPARE stmt FROM @drop_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'payment_orders'
    AND CONSTRAINT_NAME = 'fk_payment_orders_steamid'
);

SET @add_sql = IF(
  @fk_exists = 0,
  'ALTER TABLE payment_orders ADD CONSTRAINT fk_payment_orders_steamid FOREIGN KEY (steamid) REFERENCES users(steamid) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt2 FROM @add_sql;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
