-- Migration: map voting (map_vote_sessions, map_vote_options, map_votes)

-- Сессии голосования (одна сессия = одно голосование перед вайпом)
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

-- FK для winner_option_id (добавляем после создания map_vote_options)
ALTER TABLE map_vote_sessions
  ADD CONSTRAINT fk_winner_option
  FOREIGN KEY (winner_option_id) REFERENCES map_vote_options(id)
  ON DELETE SET NULL;
