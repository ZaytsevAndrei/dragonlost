-- Create database for DragonLost website
CREATE DATABASE IF NOT EXISTS dragonlost_web CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE dragonlost_web;

-- Users table for Steam authentication
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  steamid VARCHAR(32) UNIQUE NOT NULL,
  username VARCHAR(255) NOT NULL,
  avatar TEXT,
  role VARCHAR(32) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_steamid (steamid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Session storage for express-mysql-session
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  expires INT UNSIGNED NOT NULL,
  data MEDIUMTEXT COLLATE utf8mb4_bin,
  PRIMARY KEY (session_id),
  INDEX idx_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- Таблица для предметов магазина
CREATE TABLE IF NOT EXISTS shop_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category ENUM('weapon', 'armor', 'tool', 'resource', 'medical', 'kit') NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  rust_item_code VARCHAR(255) NOT NULL COMMENT 'Код предмета в Rust для выдачи через RCON',
  quantity INT DEFAULT 1 COMMENT 'Количество предметов в наборе',
  image_url VARCHAR(512),
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_available (is_available)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Таблица для инвентаря игроков (купленные предметы)
CREATE TABLE IF NOT EXISTS player_inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  shop_item_id INT NOT NULL,
  quantity INT DEFAULT 1,
  status ENUM('pending', 'delivered', 'expired') DEFAULT 'pending',
  purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shop_item_id) REFERENCES shop_items(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Таблица для баланса игроков (виртуальная валюта)
CREATE TABLE IF NOT EXISTS player_balance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  balance DECIMAL(10, 2) DEFAULT 0.00,
  total_earned DECIMAL(10, 2) DEFAULT 0.00,
  total_spent DECIMAL(10, 2) DEFAULT 0.00,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Таблица для истории транзакций
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('purchase', 'earn', 'refund') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  description VARCHAR(512),
  reference_id INT NULL COMMENT 'ID связанной записи (например, player_inventory.id)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_transactions (user_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Таблица заказов пополнения (платёжный шлюз)
CREATE TABLE IF NOT EXISTS payment_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'RUB',
  external_id VARCHAR(255) NULL,
  status ENUM('pending', 'success', 'failed', 'refunded') DEFAULT 'pending',
  payload JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_external_id (external_id),
  INDEX idx_user_status (user_id, status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Промокоды для пополнения
CREATE TABLE IF NOT EXISTS voucher_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  amount DECIMAL(10, 2) NOT NULL,
  used_by INT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Вставка тестовых предметов для магазина (только если таблица пуста)
INSERT IGNORE INTO shop_items (id, name, description, category, price, rust_item_code, quantity, image_url) VALUES
(1, 'AK-47', 'Автомат Калашникова - мощное автоматическое оружие', 'weapon', 150.00, 'rifle.ak', 1, 'https://rustlabs.com/img/items180/rifle.ak.png'),
(2, 'LR-300', 'Штурмовая винтовка с высокой точностью', 'weapon', 200.00, 'rifle.lr300', 1, 'https://rustlabs.com/img/items180/rifle.lr300.png'),
(3, 'Bolt Action Rifle', 'Снайперская винтовка для дальних дистанций', 'weapon', 180.00, 'rifle.bolt', 1, 'https://rustlabs.com/img/items180/rifle.bolt.png'),
(4, 'Python Revolver', 'Мощный револьвер калибра .357', 'weapon', 100.00, 'pistol.python', 1, 'https://rustlabs.com/img/items180/pistol.python.png'),
(5, 'Custom SMG', 'Автоматический пистолет-пулемет', 'weapon', 120.00, 'smg.2', 1, 'https://rustlabs.com/img/items180/smg.2.png'),
(6, 'Hazmat Suit', 'Полный костюм химической защиты', 'armor', 80.00, 'hazmatsuit', 1, 'https://rustlabs.com/img/items180/hazmatsuit.png'),
(7, 'Metal Facemask', 'Металлическая маска для защиты головы', 'armor', 60.00, 'metal.facemask', 1, 'https://rustlabs.com/img/items180/metal.facemask.png'),
(8, 'Metal Chest Plate', 'Металлическая нагрудная броня', 'armor', 70.00, 'metal.plate.torso', 1, 'https://rustlabs.com/img/items180/metal.plate.torso.png'),
(9, 'Heavy Plate Armor', 'Тяжелая броня - максимальная защита', 'armor', 250.00, 'heavy.plate.helmet', 1, 'https://rustlabs.com/img/items180/heavy.plate.helmet.png'),
(10, 'Jackhammer', 'Отбойный молоток для быстрой добычи', 'tool', 90.00, 'jackhammer', 1, 'https://rustlabs.com/img/items180/jackhammer.png'),
(11, 'Chainsaw', 'Бензопила для быстрой рубки деревьев', 'tool', 100.00, 'chainsaw', 1, 'https://rustlabs.com/img/items180/chainsaw.png'),
(12, 'Metal Fragments x1000', '1000 металлических фрагментов', 'resource', 50.00, 'metal.fragments', 1000, 'https://rustlabs.com/img/items180/metal.fragments.png'),
(13, 'High Quality Metal x100', '100 единиц высококачественного металла', 'resource', 80.00, 'metal.refined', 100, 'https://rustlabs.com/img/items180/metal.refined.png'),
(14, 'Sulfur x1000', '1000 единиц серы', 'resource', 60.00, 'sulfur', 1000, 'https://rustlabs.com/img/items180/sulfur.png'),
(15, 'C4 x5', '5 зарядов C4 взрывчатки', 'resource', 300.00, 'explosive.timed', 5, 'https://rustlabs.com/img/items180/explosive.timed.png'),
(16, 'Rocket x10', '10 ракет для рейдов', 'resource', 400.00, 'ammo.rocket.basic', 10, 'https://rustlabs.com/img/items180/ammo.rocket.basic.png'),
(17, 'Medical Syringe x5', '5 медицинских шприцев', 'medical', 40.00, 'syringe.medical', 5, 'https://rustlabs.com/img/items180/syringe.medical.png'),
(18, 'Large Medkit x3', '3 большие аптечки', 'medical', 35.00, 'largemedkit', 3, 'https://rustlabs.com/img/items180/largemedkit.png'),
(19, 'Starter Kit', 'Стартовый набор: AK-47, Metal Armor, 500 Metal Fragments', 'kit', 250.00, 'starter_kit', 1, NULL),
(20, 'Raider Kit', 'Набор рейдера: C4 x10, Explosives, Satchels', 'kit', 500.00, 'raider_kit', 1, NULL),
(21, 'Builder Kit', 'Набор строителя: 5000 Wood, 5000 Stone, 2000 Metal', 'kit', 300.00, 'builder_kit', 1, NULL);
