#!/bin/bash

# Скрипт для резервного копирования базы данных

# Загрузка переменных окружения
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Настройки
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="${DB_NAME:-dragonlost_web}"
DB_USER="${DB_USER:-root}"
DB_HOST="${DB_HOST:-localhost}"

# Создание директории для бэкапов
mkdir -p $BACKUP_DIR

echo "🔄 Создание резервной копии базы данных..."
echo "База данных: $DB_NAME"
echo "Пользователь: $DB_USER"
echo ""

# Бэкап базы данных
mysqldump -h $DB_HOST -u $DB_USER -p $DB_NAME | gzip > $BACKUP_DIR/db_backup_$DATE.sql.gz

if [ $? -eq 0 ]; then
    echo "✅ Резервная копия создана: $BACKUP_DIR/db_backup_$DATE.sql.gz"
    
    # Размер файла
    SIZE=$(du -h "$BACKUP_DIR/db_backup_$DATE.sql.gz" | cut -f1)
    echo "📦 Размер: $SIZE"
    
    # Удаление старых бэкапов (старше 7 дней)
    echo ""
    echo "🧹 Удаление старых резервных копий (старше 7 дней)..."
    find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +7 -delete
    echo "✅ Очистка завершена"
else
    echo "❌ Ошибка при создании резервной копии"
    exit 1
fi

echo ""
echo "📋 Список резервных копий:"
ls -lh $BACKUP_DIR/db_backup_*.sql.gz 2>/dev/null || echo "Нет резервных копий"
