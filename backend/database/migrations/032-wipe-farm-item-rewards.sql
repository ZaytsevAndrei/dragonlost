-- Миграция: награды за ТОП фарма перед вайпом — случайные призы вместо монет
-- Дата: 2026-09-28
--
-- Запуск (из папки backend/):
--   npm run migrate:032
--
-- Что делает:
--   1. Первые мифические призы колеса (редкость mythic добавлена миграцией 027):
--      M249, прибор ночного видения и сигнальный дым. Это джекпот-сектора колеса
--      и пул мифических наград для 1-го места ТОП фарма.
--   2. wipe_farm_rewards.reward_rarities — качества награды за место
--      (mythic+legendary и т.д.). Старые циклы не трогаем: у них prize_amount > 0,
--      монеты уже начислены или доначислятся скриптом creditPendingWipeFarmRewards.
--   3. wipe_farm_reward_items — предметы, выданные как награды за место
--      (ложатся в player_inventory со статусом pending, как выигрыши колеса).

INSERT INTO wheel_prizes (name, wheel_label, description, category, rarity, rust_item_code, quantity, quantity_max, image_url, weight, is_active, sort_order) VALUES
  ('M249', 'M249', 'M249 — ручной пулемёт с лентой на 100 патронов. Вершина пищевой цепи.', 'wheel', 'mythic', 'lmg.m249:1', 1, NULL, '/uploads/shop/lmg.m249.png', 1, 1, 26),
  ('Прибор ночного видения', 'ПНВ', 'ПНВ — ночь становится днём. Охота на тех, кто сидит без света.', 'wheel', 'mythic', 'nightvisiongoggles:1', 1, NULL, '/uploads/shop/nightvisiongoggles.png', 1, 1, 27),
  ('Сигнальный дым', 'Сигнальный дым', 'Сигнальный дым — грузовой самолёт сбросит целый ящик лута.', 'wheel', 'mythic', 'supply.signal:1', 1, NULL, '/uploads/shop/supply.signal.png', 1, 1, 28);

ALTER TABLE wipe_farm_rewards
  ADD COLUMN reward_rarities VARCHAR(60) NULL AFTER prize_amount;

CREATE TABLE IF NOT EXISTS wipe_farm_reward_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reward_id INT NOT NULL COMMENT 'wipe_farm_rewards.id',
  rarity_requested ENUM('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic') NOT NULL COMMENT 'Качество из награды за место',
  wheel_prize_id INT UNSIGNED NOT NULL,
  prize_name VARCHAR(120) NOT NULL,
  prize_rarity ENUM('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic') NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wipe_farm_reward_items_reward (reward_id),
  INDEX idx_wipe_farm_reward_items_prize (wheel_prize_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
