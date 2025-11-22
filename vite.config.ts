import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'url';

// https://vitejs.dev/config/
export default defineConfig({
  // Базовый URL для развертывания на GitHub Pages.
  // Замените 'PL' на имя вашего репозитория, если оно отличается.
  base: '/PL/',

  // --- Плагины ---
  plugins: [
    // Основной плагин для поддержки React
    // Обеспечивает HMR (Hot Module Replacement) и преобразование JSX/TSX
    react(),
  ],

  // --- Настройки сервера разработки (npm run dev) ---
  server: {
    port: 3000,       // Указываем порт (по умолчанию 5173, но 3000 привычнее)
    open: true,         // Автоматически открывать браузер при запуске
    host: true,         // (Опционально) Делает сервер доступным по вашему IP в локальной сети
  },

  // --- Настройка абсолютных импортов (Path Aliases) ---
  // Позволяет использовать импорты вида: import App from '@/App'
  resolve: {
    alias: {
      // Настраиваем алиас '@/' чтобы он указывал на корень проекта
      // FIX: `__dirname` is not available in ES modules. Using `import.meta.url` is the modern and correct way.
      '@/': fileURLToPath(new URL('./', import.meta.url)),
    },
  },

  // --- Настройки сборки (npm run build) ---
  build: {
    outDir: 'dist',     // Куда будет собираться production-сборка
    sourcemap: true,    // Генерировать source maps для отладки в production
  },
});
