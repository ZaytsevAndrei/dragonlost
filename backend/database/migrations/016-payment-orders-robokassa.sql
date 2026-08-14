-- Миграция: заказы пополнения для Robokassa (InvId = payment_orders.id)
-- Дата: 2026-08-13
-- Запуск: mysql -u ... -p dragonlost_web < backend/database/migrations/016-payment-orders-robokassa.sql

USE dragonlost_web;

CREATE TABLE IF NOT EXISTS payment_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  steamid VARCHAR(32) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'RUB',
  external_id VARCHAR(255) NULL,
  status ENUM('pending', 'success', 'failed', 'refunded') DEFAULT 'pending',
  payload JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_orders_steamid FOREIGN KEY (steamid) REFERENCES users(steamid) ON DELETE RESTRICT,
  UNIQUE KEY uk_external_id (external_id),
  INDEX idx_steamid_status (steamid, status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
