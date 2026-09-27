-- Кит "Боец": обычный антирадиационный костюм заменён зимним Arctic Suit
-- (hazmatsuit.arcticsuit — отдельный предмет, не скин). Обложка тоже заменена
-- на рендер с зимним костюмом (kit.fighter.png).

UPDATE shop_items
SET rust_item_code = REPLACE(rust_item_code, 'hazmatsuit:1,', 'hazmatsuit.arcticsuit:1,'),
    description = REPLACE(description, 'антирадиационный костюм', 'зимний антирадиационный костюм')
WHERE category = 'kit'
  AND name = 'Набор «Боец»'
  AND rust_item_code LIKE '%hazmatsuit:1,%';
