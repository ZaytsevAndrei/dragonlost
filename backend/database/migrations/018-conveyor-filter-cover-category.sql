-- Миграция: превью-предмет и категория для conveyor-фильтров
-- Дата: 2026-08-14
--
-- Рекомендуемый запуск (из папки backend/):
--   npm run migrate:018

ALTER TABLE conveyor_filters
  ADD COLUMN cover_shortname VARCHAR(128) NULL AFTER description,
  ADD COLUMN category VARCHAR(32) NULL AFTER cover_shortname;

ALTER TABLE conveyor_filters
  ADD INDEX idx_category (category);
