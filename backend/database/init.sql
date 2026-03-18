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

-- Таблица для баланса игроков (виртуальная валюта)
CREATE TABLE IF NOT EXISTS player_balance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  steamid VARCHAR(32) NOT NULL UNIQUE,
  balance DECIMAL(10, 2) DEFAULT 0.00,
  total_earned DECIMAL(10, 2) DEFAULT 0.00,
  total_spent DECIMAL(10, 2) DEFAULT 0.00,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (steamid) REFERENCES users(steamid) ON DELETE CASCADE,
  INDEX idx_steamid (steamid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Таблица для истории транзакций
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  steamid VARCHAR(32) NOT NULL,
  type ENUM('earn') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  description VARCHAR(512),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (steamid) REFERENCES users(steamid) ON DELETE CASCADE,
  INDEX idx_steamid (steamid),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Таблица ежедневных наград
CREATE TABLE IF NOT EXISTS daily_rewards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  steamid VARCHAR(32) NOT NULL UNIQUE,
  last_claimed_at TIMESTAMP NULL COMMENT 'Время последнего получения награды (серверное)',
  current_streak INT DEFAULT 0 COMMENT 'Текущая серия дней подряд',
  longest_streak INT DEFAULT 0 COMMENT 'Рекордная серия (для статистики)',
  total_claims INT DEFAULT 0 COMMENT 'Всего раз получал награду',
  FOREIGN KEY (steamid) REFERENCES users(steamid) ON DELETE CASCADE,
  INDEX idx_steamid_daily_rewards (steamid)
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
