// IMPORTANT: Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const uploadsShopDir = path.join(__dirname, '..', 'uploads', 'shop');
if (!fs.existsSync(uploadsShopDir)) {
  fs.mkdirSync(uploadsShopDir, { recursive: true });
}

// Verify critical environment variables are loaded
if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
  console.error('❌ ОШИБКА: Переменные окружения не загружены!');
  console.error('Проверьте наличие файла .env в корне проекта');
  process.exit(1);
}

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'your_session_secret_here_min_32_characters') {
  console.error('❌ ОШИБКА: SESSION_SECRET не задан или используется значение по умолчанию!');
  console.error('Сгенерируйте секрет: openssl rand -base64 32');
  process.exit(1);
}

if (!process.env.SESSION_ENCRYPTION_KEY || process.env.SESSION_ENCRYPTION_KEY === 'your_encryption_key_here_min_32_characters') {
  console.error('❌ ОШИБКА: SESSION_ENCRYPTION_KEY не задан или используется значение по умолчанию!');
  console.error('Сгенерируйте ключ: openssl rand -base64 32');
  process.exit(1);
}

if (!process.env.STEAM_API_KEY) {
  console.error('❌ ОШИБКА: STEAM_API_KEY не задан!');
  console.error('Получите ключ: https://steamcommunity.com/dev/apikey');
  process.exit(1);
}

if (!process.env.CORS_ORIGIN) {
  console.error('❌ ОШИБКА: CORS_ORIGIN не задан!');
  console.error('Укажите допустимый origin, например: https://yourdomain.com');
  process.exit(1);
}

if (!process.env.STEAM_RETURN_URL || !process.env.STEAM_REALM) {
  console.error('❌ ОШИБКА: STEAM_RETURN_URL или STEAM_REALM не заданы!');
  console.error('Укажите URL-ы для Steam OpenID аутентификации');
  process.exit(1);
}

// Now import everything else
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import session from 'express-session';
import MySQLStore from 'express-mysql-session';
import passport from 'passport';
import { configurePassport } from './config/passport';
import authRoutes from './routes/auth';
import statsRoutes from './routes/stats';
import serversRoutes from './routes/servers';
import shopRoutes from './routes/shop';
import inventoryRoutes from './routes/inventory';
import rewardsRoutes from './routes/rewards';
import webhooksRoutes from './routes/webhooks';
import mapVoteRoutes from './routes/mapVote';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { csrfProtection, ensureCsrfToken } from './middleware/csrf';
import { EncryptedSessionStore } from './config/encryptedSessionStore';
import { scheduleDataCleanup } from './services/dataCleanup';
import { scheduleMapVoteTasks } from './services/mapVoteScheduler';
import { rconService } from './services/rconService';

const app = express();
const PORT = process.env.PORT || 5000;

// Доверять первому прокси (nginx и т.п.) для корректного req.ip
app.set('trust proxy', 1);

// Security middleware.
// Разрешаем использовать изображения/статику с backend-origin в frontend (другой origin в dev).
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(compression());

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN,
  credentials: true,
};
app.use(cors(corsOptions));

// Static files: картинки магазина.
// Дублируем раздачу по /api/uploads для окружений, где проксируется только /api.
const uploadsRoot = path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsRoot));
app.use('/api/uploads', express.static(uploadsRoot));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MySQL Session Store configuration (данные шифруются AES-256-GCM)
const MySQLSessionStore = MySQLStore(session);
const mysqlStore = new MySQLSessionStore({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dragonlost_web',
  createDatabaseTable: true,
  schema: {
    tableName: 'sessions',
    columnNames: {
      session_id: 'session_id',
      expires: 'expires',
      data: 'data',
    },
  },
});
const sessionStore = new EncryptedSessionStore(mysqlStore, process.env.SESSION_ENCRYPTION_KEY!);

// Session configuration with MySQL store
app.use(
  session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax',
    },
  })
);

// Log session store connection status
console.log('✅ MySQL Session Store настроен');

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());
configurePassport();

// Rate limiting
app.use('/api/', rateLimiter);

// CSRF token endpoint — клиент запрашивает токен перед мутирующими запросами
app.get('/api/csrf-token', (req, res) => {
  const token = ensureCsrfToken(req);
  res.json({ csrfToken: token });
});

// CSRF protection — проверяем токен для POST/PUT/DELETE/PATCH (кроме вебхуков)
app.use('/api/', csrfProtection);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
// Совместимость с прокси-конфигами, которые могут ошибочно добавлять /api дважды.
app.use('/api/api/auth', authRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/servers', serversRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/rewards', rewardsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/map-vote', mapVoteRoutes);

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);

  // Запуск cron-задачи очистки устаревших данных (сессии, транзакции, ордера)
  scheduleDataCleanup();

  // Запуск cron-задач голосования за карту (уведомление Пт 16:00 МСК, автозакрытие)
  scheduleMapVoteTasks();

  // Подключение к Rust RCON (для выдачи предметов из инвентаря)
  if (rconService.isConfigured()) {
    rconService.connect().catch((err) => {
      console.warn('⚠️ RCON: не удалось подключиться при старте:', err instanceof Error ? err.message : err);
      console.warn('   Выдача предметов будет пытаться подключиться при каждом запросе');
    });
  } else {
    console.warn('⚠️ RCON_PASSWORD не задан — выдача предметов из инвентаря отключена');
  }
});
