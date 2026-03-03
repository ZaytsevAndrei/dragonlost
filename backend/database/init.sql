-- Create database for DragonLost website
CREATE DATABASE IF NOT EXISTS dragonlost_web CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE dragonlost_web;

-- Users table for Steam authentication
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  steamid VARCHAR(32) UNIQUE NOT NULL,
  username VARCHAR(255) NOT NULL,
  avatar TEXT,
  role VARCHAR(32) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_steamid (steamid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Session storage for express-mysql-session
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  expires INT UNSIGNED NOT NULL,
  data MEDIUMTEXT COLLATE utf8mb4_bin,
  PRIMARY KEY (session_id),
  INDEX idx_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- Таблица для предметов магазина
CREATE TABLE IF NOT EXISTS shop_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category ENUM(
    'weapon',
    'ammo',
    'module',
    'armor',
    'tool',
    'resource',
    'construction',
    'electricity',
    'component',
    'medical',
    'food',
    'services',
    'misc',
    'kit'
  ) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  rust_item_code VARCHAR(255) NOT NULL COMMENT 'Код предмета в Rust для выдачи через RCON',
  quantity INT DEFAULT 1 COMMENT 'Количество предметов в наборе',
  image_url VARCHAR(512),
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_available (is_available)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Таблица для инвентаря игроков (купленные предметы)
CREATE TABLE IF NOT EXISTS player_inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  shop_item_id INT NOT NULL,
  quantity INT DEFAULT 1,
  status ENUM('pending', 'delivered', 'expired') DEFAULT 'pending',
  purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shop_item_id) REFERENCES shop_items(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Таблица для баланса игроков (виртуальная валюта)
CREATE TABLE IF NOT EXISTS player_balance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  balance DECIMAL(10, 2) DEFAULT 0.00,
  total_earned DECIMAL(10, 2) DEFAULT 0.00,
  total_spent DECIMAL(10, 2) DEFAULT 0.00,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Таблица для истории транзакций
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('purchase', 'earn', 'refund') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  description VARCHAR(512),
  reference_id INT NULL COMMENT 'ID связанной записи (например, player_inventory.id)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_transactions (user_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Таблица заказов пополнения (платёжный шлюз)
CREATE TABLE IF NOT EXISTS payment_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'RUB',
  external_id VARCHAR(255) NULL,
  status ENUM('pending', 'success', 'failed', 'refunded') DEFAULT 'pending',
  payload JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_external_id (external_id),
  INDEX idx_user_status (user_id, status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Промокоды для пополнения
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

-- Сессии голосования за карту перед вайпом
CREATE TABLE IF NOT EXISTS map_vote_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL DEFAULT 'Голосование за карту',
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  status ENUM('active', 'closed', 'cancelled') DEFAULT 'active',
  winner_option_id INT NULL,
  created_by VARCHAR(32) NOT NULL COMMENT 'steamid администратора',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_ends (ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Варианты карт для голосования
CREATE TABLE IF NOT EXISTS map_vote_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  map_name VARCHAR(255) NOT NULL,
  map_seed INT NULL COMMENT 'Сид карты (если процедурная)',
  map_size INT NULL COMMENT 'Размер карты в метрах',
  image_url VARCHAR(512) NULL,
  description TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES map_vote_sessions(id) ON DELETE CASCADE,
  INDEX idx_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Голоса игроков (один голос на сессию)
CREATE TABLE IF NOT EXISTS map_votes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  option_id INT NOT NULL,
  steamid VARCHAR(32) NOT NULL,
  voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES map_vote_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES map_vote_options(id) ON DELETE CASCADE,
  UNIQUE KEY uk_session_user (session_id, steamid),
  INDEX idx_option (option_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE map_vote_sessions
  ADD CONSTRAINT fk_winner_option
  FOREIGN KEY (winner_option_id) REFERENCES map_vote_options(id)
  ON DELETE SET NULL;

-- Наполнение магазина вынесено в отдельные скрипты:
-- - backend/database/shop-inventory.sql
-- - backend/database/seed-shop-items.sql
