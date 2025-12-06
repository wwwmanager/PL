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

  // --- Настройка абсолютных импортов ---
  resolve: {
    alias: {
      '@/': fileURLToPath(new URL('./', import.meta.url)),
    },
  },

  // --- Настройки сборки (npm run build) ---
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      // Исключаем библиотеки, которые загружаются через CDN (importmap)
      external: [
        'react',
        'react-dom',
        'react-dom/client',
        '@tanstack/react-query',
        '@tanstack/react-virtual',
        '@google/genai',
        'recharts',
        'localforage',
        'react-hook-form',
        'zod',
        '@hookform/resolvers/zod',
        'pdfjs-dist',
        'jschardet',
      ],
      output: {
        // Указываем глобальные переменные для внешних зависимостей (если требуется для UMD/IIFE, но для ES modules это опционально, но полезно для надежности)
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react-dom/client': 'ReactDOM',
          '@tanstack/react-query': 'ReactQuery',
          '@tanstack/react-virtual': 'ReactVirtual',
          '@google/genai': 'GoogleGenAI',
          recharts: 'Recharts',
          localforage: 'localforage',
          'react-hook-form': 'ReactHookForm',
          zod: 'Zod',
        },
      },
    },
  },
});