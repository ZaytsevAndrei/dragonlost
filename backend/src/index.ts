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
import webhooksRoutes from './routes/webhooks';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { EncryptedSessionStore } from './config/encryptedSessionStore';

const app = express();
const PORT = process.env.PORT || 5000;

// Доверять первому прокси (nginx и т.п.) для корректного req.ip
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
};
app.use(cors(corsOptions));

// Static files: картинки магазина (fallback на внешние URL в БД)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

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
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'lax',
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/servers', serversRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/webhooks', webhooksRoutes);

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});
