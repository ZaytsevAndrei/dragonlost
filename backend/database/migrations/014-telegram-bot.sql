-- Миграция: Telegram-бот (привязка аккаунтов, бонус в инвентарь)
-- Дата: 2026-06-30
-- Запуск: mysql -u ... -p dragonlost_web < backend/database/migrations/014-telegram-bot.sql
-- В DBeaver: выберите БД dragonlost_web в подключении, затем «Выполнить SQL-скрипт» (Alt+X), не Ctrl+Enter.

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

-- Скрытые предметы для loot table (только если rust_item_code ещё нет в каталоге)
INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, is_available, sort_order)
SELECT 'Камень', 'Бонус Telegram-бота DragonLost', 'telegram_bonus', 0, 'stones', 1, 0, 9990
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'stones' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, is_available, sort_order)
SELECT 'Дерево', 'Бонус Telegram-бота DragonLost', 'telegram_bonus', 0, 'wood', 1, 0, 9991
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'wood' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, is_available, sort_order)
SELECT 'Металлолом', 'Бонус Telegram-бота DragonLost', 'telegram_bonus', 0, 'metal.fragments', 1, 0, 9992
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'metal.fragments' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, is_available, sort_order)
SELECT 'Скрап', 'Бонус Telegram-бота DragonLost', 'telegram_bonus', 0, 'scrap', 1, 0, 9993
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'scrap' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, is_available, sort_order)
SELECT 'Ткань', 'Бонус Telegram-бота DragonLost', 'telegram_bonus', 0, 'cloth', 1, 0, 9994
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'cloth' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, is_available, sort_order)
SELECT 'Низкосортное топливо', 'Бонус Telegram-бота DragonLost', 'telegram_bonus', 0, 'lowgradefuel', 1, 0, 9995
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'lowgradefuel' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, is_available, sort_order)
SELECT 'Уголь', 'Бонус Telegram-бота DragonLost', 'telegram_bonus', 0, 'charcoal', 1, 0, 9996
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'charcoal' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, is_available, sort_order)
SELECT 'Составной лук', 'Бонус Telegram-бота DragonLost', 'telegram_bonus', 0, 'bow.compound', 1, 0, 9997
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'bow.compound' LIMIT 1);

INSERT INTO shop_items (name, description, category, price, rust_item_code, quantity, is_available, sort_order)
SELECT 'Шкаф', 'Бонус Telegram-бота DragonLost', 'telegram_bonus', 0, 'cupboard.tool', 1, 0, 9998
WHERE NOT EXISTS (SELECT 1 FROM shop_items WHERE rust_item_code = 'cupboard.tool' LIMIT 1);
