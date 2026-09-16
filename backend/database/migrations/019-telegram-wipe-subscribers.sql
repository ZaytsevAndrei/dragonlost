-- Миграция: подписки на уведомления о вайпах в Telegram-боте
-- Дата: 2026-09-16
--
-- Запуск (из папки backend/):
--   npm run migrate:019
--
-- Альтернатива: mysql -u ... -p dragonlost_web < backend/database/migrations/019-telegram-wipe-subscribers.sql

CREATE TABLE IF NOT EXISTS telegram_wipe_subscribers (
  telegram_id BIGINT NOT NULL PRIMARY KEY,
  telegram_username VARCHAR(255) NULL,
  subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Журнал отправленных уведомлений: защита от дублей после рестарта backend.
-- Ключи вида '24h:<wipe-ms>', '1h:<wipe-ms>', 'done:<wipe-ms>'.
CREATE TABLE IF NOT EXISTS telegram_wipe_notify_log (
  notify_key VARCHAR(64) NOT NULL PRIMARY KEY,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
