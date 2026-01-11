// IMPORTANT: Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Verify critical environment variables are loaded
if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
  console.error('❌ ОШИБКА: Переменные окружения не загружены!');
  console.error('Проверьте наличие файла .env в корне проекта');
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
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MySQL Session Store configuration
const MySQLSessionStore = MySQLStore(session);
const sessionStore = new MySQLSessionStore({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dragonlost_web',
  createDatabaseTable: true, // Automatically create sessions table
  schema: {
    tableName: 'sessions',
    columnNames: {
      session_id: 'session_id',
      expires: 'expires',
      data: 'data',
    },
  },
});

// Session configuration with MySQL store
app.use(
  session({
    key: 'dragonlost_session',
    secret: process.env.SESSION_SECRET || 'dragonlost-secret-key',
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

// Log session store connection
sessionStore.onReady().then(() => {
  console.log('✅ MySQL Session Store готов');
}).catch((error: Error) => {
  console.error('❌ Ошибка MySQL Session Store:', error);
});

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

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});
