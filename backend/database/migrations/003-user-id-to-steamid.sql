-- Миграция: замена user_id → steamid в таблицах player_balance и transactions
-- Дата: 2026-02-17
--
-- ВАЖНО: перед запуском убедитесь, что есть бэкап БД.
-- Запуск: mysql -u ... -p dragonlost_web < backend/database/migrations/003-user-id-to-steamid.sql

USE dragonlost_web;

-- ═══════════════════════════════════════════════
-- 1. player_balance: user_id (INT) → steamid (VARCHAR)
-- ═══════════════════════════════════════════════

ALTER TABLE player_balance
  ADD COLUMN steamid VARCHAR(32) NULL AFTER id;

UPDATE player_balance pb
  JOIN users u ON pb.user_id = u.id
  SET pb.steamid = u.steamid;

ALTER TABLE player_balance
  DROP FOREIGN KEY player_balance_ibfk_1;

ALTER TABLE player_balance
  MODIFY COLUMN steamid VARCHAR(32) NOT NULL,
  DROP COLUMN user_id,
  ADD CONSTRAINT fk_player_balance_steamid FOREIGN KEY (steamid) REFERENCES users(steamid) ON DELETE CASCADE,
  ADD UNIQUE INDEX uk_steamid (steamid);

-- ═══════════════════════════════════════════════
-- 2. transactions: user_id (INT) → steamid (VARCHAR)
-- ═══════════════════════════════════════════════

ALTER TABLE transactions
  ADD COLUMN steamid VARCHAR(32) NULL AFTER id;

UPDATE transactions t
  JOIN users u ON t.user_id = u.id
  SET t.steamid = u.steamid;

ALTER TABLE transactions
  DROP FOREIGN KEY transactions_ibfk_1;

ALTER TABLE transactions
  MODIFY COLUMN steamid VARCHAR(32) NOT NULL,
  DROP COLUMN user_id,
  ADD CONSTRAINT fk_transactions_steamid FOREIGN KEY (steamid) REFERENCES users(steamid) ON DELETE CASCADE,
  ADD INDEX idx_steamid (steamid);
