-- Миграция: таблица промокодов и код wipe (после 007 voucher_codes отсутствует)
-- Дата: 2026-03-29
-- Запуск: mysql -u ... -p dragonlost_web < backend/database/migrations/008-voucher-codes-wipe.sql

USE dragonlost_web;

CREATE TABLE IF NOT EXISTS voucher_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  used_by INT NULL,
  used_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uk_voucher_code (code),
  INDEX idx_voucher_used_by (used_by),
  CONSTRAINT fk_voucher_used_by FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Промокод вайпа; при необходимости измените amount перед применением
INSERT IGNORE INTO voucher_codes (code, amount) VALUES ('wipe', 100.00);
