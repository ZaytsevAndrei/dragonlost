-- Миграция: система ежедневных наград
-- Дата: 2026-02-17

USE dragonlost_web;

-- Таблица ежедневных наград (одна строка на пользователя, ключ — steamid)
-- Хранит только steamid и технические метки — минимизация ПДн (152-ФЗ)
CREATE TABLE IF NOT EXISTS daily_rewards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  steamid VARCHAR(32) NOT NULL UNIQUE,
  last_claimed_at TIMESTAMP NULL COMMENT 'Время последнего получения награды (серверное)',
  current_streak INT DEFAULT 0 COMMENT 'Текущая серия дней подряд',
  longest_streak INT DEFAULT 0 COMMENT 'Рекордная серия (для статистики)',
  total_claims INT DEFAULT 0 COMMENT 'Всего раз получал награду',
  FOREIGN KEY (steamid) REFERENCES users(steamid) ON DELETE CASCADE,
  INDEX idx_steamid (steamid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
