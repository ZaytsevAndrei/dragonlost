-- Миграция: замена user_id → steamid в таблицах payment_orders, player_balance, player_inventory, transactions
-- Дата: 2026-02-17
--
-- ВАЖНО: перед запуском убедитесь, что есть бэкап БД.
-- Запуск: mysql -u ... -p dragonlost_web < backend/database/migrations/003-user-id-to-steamid.sql

USE dragonlost_web;

-- ═══════════════════════════════════════════════
-- 1. payment_orders: user_id (INT) → steamid (VARCHAR)
-- ═══════════════════════════════════════════════

ALTER TABLE payment_orders
  ADD COLUMN steamid VARCHAR(32) NULL AFTER id;

UPDATE payment_orders po
  JOIN users u ON po.user_id = u.id
  SET po.steamid = u.steamid;

ALTER TABLE payment_orders
  DROP FOREIGN KEY payment_orders_ibfk_1;

ALTER TABLE payment_orders
  DROP INDEX idx_user_status;

ALTER TABLE payment_orders
  MODIFY COLUMN steamid VARCHAR(32) NOT NULL,
  DROP COLUMN user_id,
  ADD CONSTRAINT fk_payment_orders_steamid FOREIGN KEY (steamid) REFERENCES users(steamid) ON DELETE CASCADE,
  ADD INDEX idx_steamid_status (steamid, status);

-- ═══════════════════════════════════════════════
-- 2. player_balance: user_id (INT) → steamid (VARCHAR)
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
-- 3. player_inventory: user_id (INT) → steamid (VARCHAR)
-- ═══════════════════════════════════════════════

ALTER TABLE player_inventory
  ADD COLUMN steamid VARCHAR(32) NULL AFTER id;

UPDATE player_inventory pi
  JOIN users u ON pi.user_id = u.id
  SET pi.steamid = u.steamid;

ALTER TABLE player_inventory
  DROP FOREIGN KEY player_inventory_ibfk_1;

ALTER TABLE player_inventory
  MODIFY COLUMN steamid VARCHAR(32) NOT NULL,
  DROP COLUMN user_id,
  ADD CONSTRAINT fk_player_inventory_steamid FOREIGN KEY (steamid) REFERENCES users(steamid) ON DELETE CASCADE,
  ADD INDEX idx_steamid (steamid);

-- ═══════════════════════════════════════════════
-- 4. transactions: user_id (INT) → steamid (VARCHAR)
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
