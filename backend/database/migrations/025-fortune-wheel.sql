-- Миграция: Колесо удачи (бесплатный кейс раз в 4 часа)
-- Дата: 2026-09-27
--
-- Запуск (из папки backend/):
--   npm run migrate:025
--
-- Состав:
--   wheel_prizes   — призы колеса (вес = шанс выпадения, rust_item_code как у shop_items)
--   wheel_players  — состояние игрока (проверка метки в нике Steam, последний спин)
--   wheel_spins    — лог спинов для ленты «Последние выигрыши» (имя/картинка — снапшот)
--   player_inventory + wheel_prize_id — выигранные призы ждут получения как покупки

CREATE TABLE IF NOT EXISTS wheel_prizes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  wheel_label VARCHAR(40) NOT NULL,
  description VARCHAR(500) NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'wheel',
  rarity ENUM('common', 'uncommon', 'rare', 'epic', 'legendary') NOT NULL DEFAULT 'common',
  rust_item_code VARCHAR(500) NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  image_url VARCHAR(500) NULL,
  weight INT UNSIGNED NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wheel_prizes_active (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wheel_players (
  steamid VARCHAR(17) NOT NULL PRIMARY KEY,
  tag_verified_at TIMESTAMP NULL,
  last_spin_at TIMESTAMP NULL,
  total_spins INT UNSIGNED NOT NULL DEFAULT 0,
  FOREIGN KEY (steamid) REFERENCES users(steamid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wheel_spins (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  steamid VARCHAR(17) NOT NULL,
  prize_id INT UNSIGNED NULL,
  prize_name VARCHAR(120) NOT NULL,
  prize_image_url VARCHAR(500) NULL,
  prize_rarity ENUM('common', 'uncommon', 'rare', 'epic', 'legendary') NOT NULL DEFAULT 'common',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wheel_spins_recent (id),
  INDEX idx_wheel_spins_steamid (steamid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Стартовый набор призов: 8 секторов, суммарный вес 100 (= проценты шанса).
-- rust_item_code — shortname:количество, формат набора shop_items (parseBundleCode в inventory.ts).
INSERT INTO wheel_prizes (name, wheel_label, description, category, rarity, rust_item_code, quantity, weight, is_active, sort_order)
SELECT * FROM (
  SELECT
    'Дерево ×1000' AS name,
    'Дерево' AS wheel_label,
    '1000 единиц дерева — на старт строительства или костёр.' AS description,
    'wheel' AS category,
    'common' AS rarity,
    'wood:1000' AS rust_item_code,
    1 AS quantity,
    24 AS weight,
    1 AS is_active,
    1 AS sort_order
  UNION ALL
  SELECT 'Камень ×1000', 'Камень', '1000 единиц камня — каменные стены и инструменты.', 'wheel', 'common', 'stones:1000', 1, 24, 1, 2
  UNION ALL
  SELECT 'Металлические фрагменты ×500', 'Металл', '500 металлических фрагментов на инструменты и броню.', 'wheel', 'common', 'metal.fragments:500', 1, 18, 1, 3
  UNION ALL
  SELECT 'Ткань ×200', 'Ткань', '200 ткани — одежда, спальник и бинты.', 'wheel', 'uncommon', 'cloth:200', 1, 12, 1, 4
  UNION ALL
  SELECT 'Медицинские шприцы ×5', 'Шприцы', '5 медицинских шприцев — быстрое лечение в бою.', 'wheel', 'uncommon', 'syringe.medical:5', 1, 9, 1, 5
  UNION ALL
  SELECT 'Гранаты F1 ×3', 'Гранаты', '3 осколочные гранаты F1 — зачистка комнат рейдеров.', 'wheel', 'rare', 'grenade.f1:3', 1, 7, 1, 6
  UNION ALL
  SELECT 'Заряд C4 ×1', 'C4', 'Взрывчатка C4 — вскрыть любую дверь или стену.', 'wheel', 'epic', 'explosive.timed:1', 1, 4, 1, 7
  UNION ALL
  SELECT 'Автоматическая турель', 'Турель', 'Автотурель — охрана базы, пока вас нет онлайн.', 'wheel', 'legendary', 'autoturret:1', 1, 2, 1, 8
) AS new_prizes
WHERE NOT EXISTS (SELECT 1 FROM wheel_prizes);

-- Инвентарь: колонка для выигранных призов + shop_item_id становится nullable
-- (приз колеса не является товаром магазина). Тип shop_item_id сохраняем из схемы.
ALTER TABLE player_inventory
  ADD COLUMN wheel_prize_id INT UNSIGNED NULL AFTER shop_item_id,
  ADD INDEX idx_player_inventory_wheel_prize (wheel_prize_id);

SET @col_type := (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'player_inventory' AND COLUMN_NAME = 'shop_item_id'
  LIMIT 1
);

SET @shop_item_not_null := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'player_inventory' AND COLUMN_NAME = 'shop_item_id' AND IS_NULLABLE = 'NO'
);

SET @make_nullable := IF(
  @shop_item_not_null > 0 AND @col_type IS NOT NULL,
  CONCAT('ALTER TABLE player_inventory MODIFY COLUMN shop_item_id ', @col_type, ' NULL'),
  'SELECT 1'
);

PREPARE make_nullable_stmt FROM @make_nullable;
EXECUTE make_nullable_stmt;
DEALLOCATE PREPARE make_nullable_stmt;
