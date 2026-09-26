-- Миграция: новый набор призов колеса удачи (25 секторов) и диапазоны количества
-- Дата: 2026-09-27
--
-- Запуск (из папки backend/):
--   npm run migrate:026
--
-- Что делает:
--   1. wheel_prizes.quantity_max — верхняя граница количества (NULL = фиксированное)
--   2. Деактивирует старый набор из 8 призов. Строки не удаляются: на них
--      ссылаются невыдаанные записи player_inventory (JOIN читает rust_item_code)
--   3. Загружает новый набор из 25 призов, суммарный вес 100 (= проценты шанса)
--
-- Схема количества у новых призов: rust_item_code = "shortname:1",
-- фактическое количество (или диапазон quantity..quantity_max) роллится при спине
-- и пишется в player_inventory.quantity (выдача = 1 x записанное количество).
-- Старые призы ("wood:1000", quantity=1) продолжают работать без изменений.

ALTER TABLE wheel_prizes
  ADD COLUMN quantity_max INT UNSIGNED NULL AFTER quantity;

UPDATE wheel_prizes SET is_active = 0 WHERE is_active = 1;

INSERT INTO wheel_prizes (name, wheel_label, description, category, rarity, rust_item_code, quantity, quantity_max, image_url, weight, is_active, sort_order) VALUES
  ('Дерево', 'Дерево', 'От 1000 до 3000 дерева — фундамент, стены и костёр.', 'wheel', 'common', 'wood:1', 1000, 3000, '/uploads/shop/wood.png', 8, 1, 1),
  ('Камень', 'Камень', 'От 1000 до 3000 камня — каменная коробка и инструменты.', 'wheel', 'common', 'stones:1', 1000, 3000, '/uploads/shop/stones.png', 8, 1, 2),
  ('Металлические фрагменты', 'Металл', 'От 500 до 2000 фрагментов — инструменты, броня, листы.', 'wheel', 'common', 'metal.fragments:1', 500, 2000, '/uploads/shop/metal.fragments.png', 7, 1, 3),
  ('Металл высокого качества', 'МВК', 'От 25 до 100 МВК — на броню и улучшение веток.', 'wheel', 'uncommon', 'metal.refined:1', 25, 100, '/uploads/shop/metal.refined.png', 5, 1, 4),
  ('Костюм химзащиты', 'Хазмат', 'Полный хазмат — радиация больше не проблема.', 'wheel', 'uncommon', 'hazmatsuit:1', 1, NULL, '/uploads/shop/hazmatsuit.png', 4, 1, 5),
  ('Верстак 1-го уровня', 'Верстак 1', 'Верстак первого уровня — базовые чертежи для крафта.', 'wheel', 'uncommon', 'workbench1:1', 1, NULL, '/uploads/shop/workbench1.png', 5, 1, 6),
  ('Верстак 2-го уровня', 'Верстак 2', 'Верстак второго уровня — почти весь крафт игры.', 'wheel', 'rare', 'workbench2:1', 1, NULL, '/uploads/shop/workbench2.png', 4, 1, 7),
  ('Кровать', 'Кровать', 'Кровать — точка возрождения на базе.', 'wheel', 'uncommon', 'bed:1', 1, NULL, '/uploads/shop/bed.png', 5, 1, 8),
  ('Армированная дверь', 'Арм. дверь', 'Армированная дверь — 800 HP, лучшая одиночная дверь.', 'wheel', 'rare', 'door.hinged.toptier:1', 1, NULL, '/uploads/shop/door.hinged.toptier.png', 3, 1, 9),
  ('Отбойный молоток', 'Бур', 'Бур — руда без кирки и скорость в карьере.', 'wheel', 'rare', 'jackhammer:1', 1, NULL, '/uploads/shop/jackhammer.png', 3, 1, 10),
  ('Бензопила', 'Пила', 'Бензопила — валить лес в разы быстрее.', 'wheel', 'rare', 'chainsaw:1', 1, NULL, '/uploads/shop/chainsaw.png', 3, 1, 11),
  ('Топор', 'Топор', 'Стальной топор — быстрый лес и уверенный ближний бой.', 'wheel', 'uncommon', 'axe:1', 1, NULL, NULL, 5, 1, 12),
  ('Кирка', 'Кирка', 'Стальная кирка — руда и снос каменных стен.', 'wheel', 'uncommon', 'pickaxe:1', 1, NULL, NULL, 5, 1, 13),
  ('Медицинские шприцы', 'Шприцы', '4 медицинских шприца — лечение в разгар боя.', 'wheel', 'rare', 'syringe.medical:1', 4, NULL, '/uploads/shop/syringe.medical.png', 4, 1, 14),
  ('Большая аптечка', 'Аптечка', '2 большие аптечки — быстрый отхил под огнём.', 'wheel', 'rare', 'largemedkit:1', 2, NULL, '/uploads/shop/largemedkit.png', 4, 1, 15),
  ('Дробовик-ловушка', 'Гантрап', 'Гантрап на пороге — сюрприз для непрошеных гостей.', 'wheel', 'rare', 'guntrap:1', 1, NULL, NULL, 3, 1, 16),
  ('Бумбокс', 'Бумбокс', 'Бумбокс — музыка на базе и вечеринка у вдовы.', 'wheel', 'epic', 'boombox:1', 1, NULL, NULL, 3, 1, 17),
  ('Двуствольный дробовик', 'Двушка', 'Двушка — два ствола и шквал урона в упор.', 'wheel', 'epic', 'shotgun.double:1', 1, NULL, '/uploads/shop/shotgun.double.png', 3, 1, 18),
  ('Томпсон', 'Томпсон', 'Томпсон — дешёвый, но злой ПП для ранних рейдов.', 'wheel', 'epic', 'smg.thompson:1', 1, NULL, '/uploads/shop/smg.thompson.png', 3, 1, 19),
  ('Питон', 'Питон', 'Питон — револьвер с мощным одиночным уроном.', 'wheel', 'epic', 'pistol.python:1', 1, NULL, '/uploads/shop/pistol.python.png', 3, 1, 20),
  ('Заряд сачела', 'Сачель', 'От 1 до 8 сачелов — вскрыть дверь без C4.', 'wheel', 'epic', 'explosive.satchel:1', 1, 8, '/uploads/shop/explosive.satchel.png', 3, 1, 21),
  ('Граната F1', 'F1', 'От 1 до 8 гранат F1 — зачистка комнат рейдеров.', 'wheel', 'epic', 'grenade.f1:1', 1, 8, '/uploads/shop/grenade.f1.png', 3, 1, 22),
  ('Граната «Бобочка»', 'Бобочка', 'От 1 до 8 бобочек — дешёвый бабах на каждый день.', 'wheel', 'epic', 'grenade.beancan:1', 1, 8, NULL, 3, 1, 23),
  ('MP5A4', 'MP5A4', 'MP5A4 — топовый ПП ближнего боя.', 'wheel', 'legendary', 'smg.mp5:1', 1, NULL, '/uploads/shop/smg.mp5.png', 2, 1, 24),
  ('Костюм курицы', 'Курица', 'Костюм курицы — самый громкий приз колеса. Кудах-тах-тах!', 'wheel', 'legendary', 'chicken.costume:1', 1, NULL, NULL, 1, 1, 25);
