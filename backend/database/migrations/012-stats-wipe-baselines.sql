-- Базовые значения StatisticsDB на момент вайпа (для отображения статистики за текущий цикл)
-- Запуск: mysql -u ... -p dragonlost_web < backend/database/migrations/012-stats-wipe-baselines.sql

CREATE TABLE IF NOT EXISTS stats_wipe_meta (
  id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
  wiped_at DATETIME NOT NULL,
  map_vote_session_id INT NULL DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_stats_wipe_meta_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stats_wipe_baselines (
  steamid VARCHAR(32) NOT NULL,
  statistics_json JSON NOT NULL,
  PRIMARY KEY (steamid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
