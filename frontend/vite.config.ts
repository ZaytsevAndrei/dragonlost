import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    server: {
      port: 3000,
      host: true, // Слушать на всех сетевых интерфейсах
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'dragonlost.ru',
        'www.dragonlost.ru',
      ],
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 3000,
      host: true, // Слушать на всех сетевых интерфейсах
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: mode === 'development',
    },
  };
});
