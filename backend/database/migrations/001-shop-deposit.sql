-- Migration: shop deposit (payment_orders, voucher_codes, users.role)
-- Run on existing DB: mysql ... dragonlost_web < backend/database/migrations/001-shop-deposit.sql

USE dragonlost_web;

-- Таблица заказов пополнения (идемпотентность и аудит)
CREATE TABLE IF NOT EXISTS payment_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'RUB',
  external_id VARCHAR(255) NULL COMMENT 'ID платежа в платёжной системе',
  status ENUM('pending', 'success', 'failed', 'refunded') DEFAULT 'pending',
  payload JSON NULL COMMENT 'Ответ платёжной системы',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_external_id (external_id),
  INDEX idx_user_status (user_id, status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Промокоды для пополнения без реальных платежей
CREATE TABLE IF NOT EXISTS voucher_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  amount DECIMAL(10, 2) NOT NULL,
  used_by INT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Роль пользователя (для админ-пополнения). При повторном запуске будет ошибка "Duplicate column" — можно игнорировать.
ALTER TABLE users ADD COLUMN role VARCHAR(32) DEFAULT 'user';
