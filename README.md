# DragonLost - Сайт статистики Rust сервера

Веб-сайт для отображения статистики игроков Rust сервера DragonLost с авторизацией через Steam.

> **⚡ Быстрый старт**: См. [START_HERE.md](./START_HERE.md) для начала работы

## 🚀 Технологии

### Frontend
- React 18
- TypeScript
- Vite
- React Router
- Zustand (state management)
- Axios

### Backend
- Node.js
- Express
- TypeScript
- MySQL
- Passport (Steam authentication)
- PM2 (process manager)

## 📁 Структура проекта

```
dragonlost/
├── backend/                 # Backend API
│   ├── src/
│   │   ├── config/         # Конфигурации (база данных, passport)
│   │   ├── middleware/     # Middleware (авторизация, обработка ошибок)
│   │   ├── routes/         # API маршруты
│   │   └── index.ts        # Точка входа
│   ├── database/           # SQL скрипты
│   └── package.json
├── frontend/               # Frontend приложение
│   ├── src/
│   │   ├── components/    # React компоненты
│   │   ├── pages/         # Страницы
│   │   ├── services/      # API сервисы
│   │   ├── store/         # Zustand stores
│   │   └── main.tsx       # Точка входа
│   └── package.json
├── ecosystem.config.js     # PM2 конфигурация
└── package.json            # Root package.json
```

## ⚙️ Установка и запуск

### Локальная разработка

1. **Клонируйте репозиторий**
```bash
git clone <repository-url>
cd dragonlost
```

2. **Установите зависимости**
```bash
npm run install:all
```

3. **Настройте переменные окружения**

Создайте файл `.env` в корне проекта:
```env
# Backend Configuration
NODE_ENV=development
PORT=5000

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=dragonlost_user
DB_PASSWORD=your_password
DB_NAME=dragonlost_web

# Rust Database Configuration (read-only)
RUST_DB_HOST=localhost
RUST_DB_PORT=3306
RUST_DB_USER=rust_user
RUST_DB_PASSWORD=rust_password
RUST_DB_NAME=rust

# Steam API Configuration
STEAM_API_KEY=your_steam_api_key
STEAM_RETURN_URL=http://localhost:5000/api/auth/steam/return
STEAM_REALM=http://localhost:5000

# Session Configuration
SESSION_SECRET=your_random_secret

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
```

Создайте файл `frontend/.env`:
```env
VITE_API_URL=http://localhost:5000/api
```

4. **Инициализируйте базу данных**
```bash
mysql -u root -p < backend/database/init.sql
```

5. **Запустите приложение в режиме разработки**
```bash
# Запустить backend и frontend одновременно
npm run dev

# Или отдельно:
npm run dev:backend
npm run dev:frontend
```

### Production сборка и запуск

1. **Соберите проект**
```bash
npm run build
```

2. **Установите PM2 глобально (если не установлен)**
```bash
npm install -g pm2
npm install -g serve
```

3. **Запустите через PM2**
```bash
npm start

# Или напрямую:
pm2 start ecosystem.config.js --env production
```

4. **Управление PM2**
```bash
# Просмотр статуса
pm2 status

# Просмотр логов
pm2 logs

# Остановить приложения
pm2 stop all

# Перезапустить приложения
pm2 restart all

# Удалить из PM2
pm2 delete all
```

## 🔑 Получение Steam API ключа

1. Перейдите на https://steamcommunity.com/dev/apikey
2. Войдите через Steam
3. Заполните форму и получите ваш API ключ
4. Добавьте ключ в `.env` файл в переменную `STEAM_API_KEY`

## 📊 API Endpoints

### Авторизация
- `GET /api/auth/steam` - Перенаправление на Steam авторизацию
- `GET /api/auth/steam/return` - Callback URL для Steam
- `GET /api/auth/me` - Получить текущего пользователя
- `POST /api/auth/logout` - Выход из системы

### Статистика
- `GET /api/stats` - Получить статистику всех игроков
- `GET /api/stats/:steamid` - Получить статистику конкретного игрока

### Сервера
- `GET /api/servers` - Получить список серверов

### Health Check
- `GET /api/health` - Проверка работоспособности API

## 🗄️ База данных

Проект использует две базы данных:
1. **dragonlost_web** - Основная БД сайта (пользователи, сессии)
2. **rust** - БД игрового сервера Rust (статистика игроков, read-only)

## 🌐 Настройка Production

См. подробную инструкцию в файле [DEPLOYMENT.md](./DEPLOYMENT.md)

## 📝 Разработка

### Добавление новых страниц

1. Создайте компонент в `frontend/src/pages/`
2. Добавьте маршрут в `frontend/src/App.tsx`
3. Добавьте ссылку в `frontend/src/components/Header.tsx`

### Добавление новых API endpoints

1. Создайте файл маршрута в `backend/src/routes/`
2. Импортируйте и используйте в `backend/src/index.ts`

## 🤝 Вклад в проект

1. Создайте fork проекта
2. Создайте ветку для новой функции (`git checkout -b feature/AmazingFeature`)
3. Закоммитьте изменения (`git commit -m 'Add some AmazingFeature'`)
4. Отправьте в ветку (`git push origin feature/AmazingFeature`)
5. Откройте Pull Request

## 📄 Лицензия

Proprietary - Все права защищены

## 👨‍💻 Автор

DragonLost Team

## 🔗 Ссылки

- Сайт: https://dragonlost.ru
- Steam Community: [Добавьте ссылку]
- Discord: [Добавьте ссылку]
