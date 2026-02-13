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

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      console.log('Unauthorized access');
    }
    return Promise.reject(error);
  }
);
