-- Миграция: Telegram-бот (привязка аккаунтов, бонус в инвентарь)
-- Дата: 2026-06-30
--
-- Рекомендуемый запуск (из папки backend/):
--   npm run migrate:014
--
-- Альтернатива: mysql -u ... -p dragonlost_web < backend/database/migrations/014-telegram-bot.sql
--
-- DBeaver: ошибка 1064 near 'CREATE TABLE' = несколько операторов в одном запросе.
--   Вариант A: Alt+X («Выполнить SQL-скрипт»), не Ctrl+Enter.
--   Вариант B: выделять и выполнять по одному CREATE TABLE / INSERT за раз.

CREATE TABLE IF NOT EXISTS telegram_links (
  telegram_id BIGINT NOT NULL PRIMARY KEY,
  steamid VARCHAR(32) NOT NULL UNIQUE,
  telegram_username VARCHAR(255) NULL,
  linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (steamid) REFERENCES users(steamid) ON DELETE CASCADE,
  INDEX idx_steamid (steamid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code VARCHAR(8) NOT NULL PRIMARY KEY,
  steamid VARCHAR(32) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (steamid) REFERENCES users(steamid) ON DELETE CASCADE,
  INDEX idx_steamid (steamid),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS telegram_bonus_claims (
  telegram_id BIGINT NOT NULL PRIMARY KEY,
  steamid VARCHAR(32) NOT NULL,
  last_claimed_at TIMESTAMP NOT NULL,
  total_claims INT NOT NULL DEFAULT 1,
  FOREIGN KEY (telegram_id) REFERENCES telegram_links(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (steamid) REFERENCES users(steamid) ON DELETE CASCADE,
  INDEX idx_steamid (steamid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Скрытые предметы для loot table (только если rust_item_code ещё нет в каталоге).
-- category — ENUM из shop_items; is_available = 0 скрывает из витрины магазина.
INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, is_available)
SELECT 'Камень', 'Бонус Telegram-бота DragonLost', 'resource', 0, 'stones', 1, 0
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'stones' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, is_available)
SELECT 'Дерево', 'Бонус Telegram-бота DragonLost', 'resource', 0, 'wood', 1, 0
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'wood' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, is_available)
SELECT 'Металлолом', 'Бонус Telegram-бота DragonLost', 'resource', 0, 'metal.fragments', 1, 0
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'metal.fragments' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, is_available)
SELECT 'Скрап', 'Бонус Telegram-бота DragonLost', 'resource', 0, 'scrap', 1, 0
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'scrap' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, is_available)
SELECT 'Ткань', 'Бонус Telegram-бота DragonLost', 'component', 0, 'cloth', 1, 0
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'cloth' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, is_available)
SELECT 'Низкосортное топливо', 'Бонус Telegram-бота DragonLost', 'resource', 0, 'lowgradefuel', 1, 0
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'lowgradefuel' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, is_available)
SELECT 'Уголь', 'Бонус Telegram-бота DragonLost', 'resource', 0, 'charcoal', 1, 0
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'charcoal' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, is_available)
SELECT 'Составной лук', 'Бонус Telegram-бота DragonLost', 'weapon', 0, 'bow.compound', 1, 0
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'bow.compound' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, is_available)
SELECT 'Шкаф', 'Бонус Telegram-бота DragonLost', 'construction', 0, 'cupboard.tool', 1, 0
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'cupboard.tool' LIMIT 1);
