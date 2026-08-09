-- Миграция: Conveyor Filters (создание, шаринг, избранное)
-- Дата: 2026-08-09
--
-- Рекомендуемый запуск (из папки backend/):
--   npm run migrate:015

CREATE TABLE IF NOT EXISTS conveyor_filters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  owner_steamid VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 0,
  items JSON NOT NULL,
  export_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_steamid) REFERENCES users(steamid) ON DELETE CASCADE,
  INDEX idx_owner (owner_steamid),
  INDEX idx_public (is_public),
  INDEX idx_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conveyor_filter_shares (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filter_id INT NOT NULL,
  shared_with_steamid VARCHAR(32) NOT NULL,
  can_edit TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (filter_id) REFERENCES conveyor_filters(id) ON DELETE CASCADE,
  FOREIGN KEY (shared_with_steamid) REFERENCES users(steamid) ON DELETE CASCADE,
  UNIQUE KEY uq_filter_share (filter_id, shared_with_steamid),
  INDEX idx_shared_with (shared_with_steamid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conveyor_filter_saves (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filter_id INT NOT NULL,
  steamid VARCHAR(32) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (filter_id) REFERENCES conveyor_filters(id) ON DELETE CASCADE,
  FOREIGN KEY (steamid) REFERENCES users(steamid) ON DELETE CASCADE,
  UNIQUE KEY uq_filter_save (filter_id, steamid),
  INDEX idx_steamid (steamid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
