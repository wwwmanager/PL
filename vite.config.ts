import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'url';

// https://vitejs.dev/config/
export default defineConfig({
  // Базовый URL для развертывания на GitHub Pages.
  base: '/PL/',

  // --- Плагины ---
  plugins: [
    react(),
  ],

  // --- Настройки сервера разработки (npm run dev) ---
  server: {
    port: 3000,
    open: true,
    host: true,
  },

  // --- Настройки сборки (npm run build) ---
  build: {
    outDir: 'dist',
    sourcemap: true,
  },

  // --- Настройка абсолютных импортов ---
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
});