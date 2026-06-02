-- Итоги ТОП фарма и начисления призов (один раз за цикл вайпа)
-- Запуск: mysql -u ... -p dragonlost_web < backend/database/migrations/013-wipe-farm-rewards.sql

CREATE TABLE IF NOT EXISTS wipe_farm_rewards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  wipe_cycle_started_at DATETIME NOT NULL COMMENT 'Момент прошлого вайпа (stats_wipe_meta.wiped_at)',
  `rank` TINYINT NOT NULL,
  steamid VARCHAR(32) NOT NULL,
  player_name VARCHAR(255) NOT NULL,
  rating_score DECIMAL(14, 2) NOT NULL,
  sulfur_ore INT NOT NULL DEFAULT 0,
  metal_ore INT NOT NULL DEFAULT 0,
  stones INT NOT NULL DEFAULT 0,
  wood INT NOT NULL DEFAULT 0,
  prize_amount DECIMAL(10, 2) NOT NULL,
  credited TINYINT(1) NOT NULL DEFAULT 0,
  credit_note VARCHAR(255) NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_wipe_farm_cycle_rank (wipe_cycle_started_at, `rank`),
  UNIQUE KEY uk_wipe_farm_cycle_steamid (wipe_cycle_started_at, steamid),
  INDEX idx_steamid (steamid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
