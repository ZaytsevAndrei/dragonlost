-- Скрипт для создания базы данных и пользователя
-- Выполните: mysql -u root -p < setup-database.sql

-- Создание базы данных для сайта
CREATE DATABASE IF NOT EXISTS dragonlost_web CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Создание пользователя (если не существует)
CREATE USER IF NOT EXISTS 'dragonlost_user'@'localhost' IDENTIFIED BY 'Zz123456!';

-- Выдача всех прав на базу данных сайта
GRANT ALL PRIVILEGES ON dragonlost_web.* TO 'dragonlost_user'@'localhost';

-- Применение изменений
FLUSH PRIVILEGES;

-- Вывод информации
SELECT 'База данных dragonlost_web создана!' as Status;
SELECT 'Пользователь dragonlost_user настроен!' as Status;
