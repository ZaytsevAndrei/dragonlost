-- Миграция: расширение категорий магазина под импорт с SicilianRust
-- Дата: 2026-03-03
-- Запуск: mysql -u ... -p dragonlost_web < backend/database/migrations/005-expand-shop-categories.sql

USE dragonlost_web;

ALTER TABLE shop_items
  MODIFY COLUMN category ENUM(
    'weapon',
    'ammo',
    'module',
    'armor',
    'tool',
    'resource',
    'construction',
    'electricity',
    'component',
    'medical',
    'food',
    'services',
    'misc',
    'kit'
  ) NOT NULL;
