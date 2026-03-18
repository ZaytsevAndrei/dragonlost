-- Нормализация shop_items.image_url к локальному формату:
--   /uploads/shop/<file>
-- Для пустых/некорректных значений: NULL
-- Для URL с query/hash: query/hash удаляются.
-- Для значения без расширения: добавляется .png

START TRANSACTION;

UPDATE shop_items
SET image_url = NULL
WHERE image_url IS NULL
   OR TRIM(image_url) = ''
   OR TRIM(image_url) IN ('/', '/uploads/', '/uploads/shop/');

UPDATE shop_items
SET image_url = CONCAT(
  '/uploads/shop/',
  CASE
    WHEN LOWER(SUBSTRING_INDEX(SUBSTRING_INDEX(SUBSTRING_INDEX(TRIM(image_url), '#', 1), '?', 1), '/', -1)) REGEXP '\\.(png|jpg|jpeg|webp|svg|gif)$'
      THEN LOWER(SUBSTRING_INDEX(SUBSTRING_INDEX(SUBSTRING_INDEX(TRIM(image_url), '#', 1), '?', 1), '/', -1))
    ELSE CONCAT(
      LOWER(SUBSTRING_INDEX(SUBSTRING_INDEX(SUBSTRING_INDEX(TRIM(image_url), '#', 1), '?', 1), '/', -1)),
      '.png'
    )
  END
)
WHERE image_url IS NOT NULL
  AND TRIM(image_url) <> ''
  AND TRIM(image_url) NOT IN ('/', '/uploads/', '/uploads/shop/');

UPDATE shop_items
SET image_url = NULL
WHERE image_url = '/uploads/shop/.png';

COMMIT;
