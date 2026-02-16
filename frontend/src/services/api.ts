import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

/** Базовый URL бэкенда (без /api) — для статики в т.ч. /uploads/shop */
export const getBackendOrigin = () => (API_URL || '').replace(/\/api\/?$/, '') || '';

/** URL картинки: относительные пути (/uploads/...) отдаются с бэкенда */
export const getImageUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  if (url.startsWith('/')) return getBackendOrigin() + url;
  return url;
};

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- CSRF-токен (Synchronizer Token Pattern) ---
let csrfToken: string | null = null;
let csrfFetchPromise: Promise<void> | null = null;

/** Загружает CSRF-токен с сервера (один раз, с дедупликацией параллельных вызовов) */
async function fetchCsrfToken(): Promise<void> {
  if (csrfToken) return;
  if (csrfFetchPromise) return csrfFetchPromise;

  csrfFetchPromise = api
    .get('/csrf-token')
    .then((res) => {
      csrfToken = res.data.csrfToken;
    })
    .catch(() => {
      csrfToken = null;
    })
    .finally(() => {
      csrfFetchPromise = null;
    });

  return csrfFetchPromise;
}

const MUTATING_METHODS = ['post', 'put', 'delete', 'patch'];

// Request interceptor — добавляет CSRF-токен к мутирующим запросам
api.interceptors.request.use(async (config) => {
  if (MUTATING_METHODS.includes(config.method || '')) {
    if (!csrfToken) {
      await fetchCsrfToken();
    }
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return config;
});

// Response interceptor — при 403 с невалидным CSRF сбрасываем токен и повторяем запрос
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 403 &&
      error.response?.data?.error?.includes('CSRF') &&
      !original._csrfRetry
    ) {
      original._csrfRetry = true;
      csrfToken = null;
      await fetchCsrfToken();
      if (csrfToken) {
        original.headers['X-CSRF-Token'] = csrfToken;
      }
      return api(original);
    }
    return Promise.reject(error);
  }
);
