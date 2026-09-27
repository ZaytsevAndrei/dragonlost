-- Миграция: редкость «Мифический» (mythic) для колеса удачи — уровень выше легендарной
-- Дата: 2026-09-27
--
-- Запуск (из папки backend/):
--   npm run migrate:027
--
-- Что делает:
--   Расширяет ENUM редкости в wheel_prizes и wheel_spins значением 'mythic'.
--   Существующие строки не меняются; сами призы с редкостью mythic добавляются
--   отдельными миграциями, когда понадобятся.

ALTER TABLE wheel_prizes
  MODIFY COLUMN rarity ENUM('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic') NOT NULL DEFAULT 'common';

ALTER TABLE wheel_spins
  MODIFY COLUMN prize_rarity ENUM('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic') NOT NULL DEFAULT 'common';
