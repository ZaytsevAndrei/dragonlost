import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const CSRF_HEADER = 'x-csrf-token';
const CSRF_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

/** Пути, освобождённые от CSRF-проверки (server-to-server вебхуки) */
const CSRF_EXEMPT_PREFIXES = ['/api/webhooks/'];

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Гарантирует наличие CSRF-токена в сессии и возвращает его */
export function ensureCsrfToken(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateToken();
  }
  return req.session.csrfToken;
}

/**
 * Middleware: проверяет CSRF-токен для мутирующих HTTP-методов.
 * Пропускает запросы к вебхукам (они приходят от внешних сервисов, а не из браузера).
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (!CSRF_METHODS.has(req.method)) {
    return next();
  }

  if (CSRF_EXEMPT_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
    return next();
  }

  const sessionToken = req.session.csrfToken;
  const headerToken = req.headers[CSRF_HEADER] as string | undefined;

  if (!sessionToken || !headerToken || sessionToken !== headerToken) {
    res.status(403).json({ error: 'Invalid or missing CSRF token' });
    return;
  }

  next();
}
