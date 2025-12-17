
// src/utils/analytics.ts

// 1. Объявляем типы, чтобы TS знал, что такое window.ym
declare global {
  interface Window {
    ym: (id: number, method: string, ...args: any[]) => void;
  }
}

// Безопасное получение env для предотвращения ошибок доступа
const getEnv = () => (import.meta as any).env || {};

// Читаем ID из переменных окружения или используем жестко заданный как фоллбэк
const COUNTER_ID = Number(getEnv().VITE_YANDEX_METRIKA_ID) || 105781265;

/**
 * Функция для отправки Цели (Goal)
 * @param targetId - Строковый ID цели, который вы создадите в интерфейсе Яндекса (например, 'DB_CONNECTION')
 */
export const trackGoal = (targetId: string, params?: any) => {
  // Проверяем, загрузилась ли Метрика
  if (typeof window.ym !== 'function') {
    // Если у пользователя AdBlock или скрипт еще не загрузился, метрика может отсутствовать.
    return;
  }

  // Не отправляем события с localhost, чтобы не портить статистику
  if (window.location.hostname === 'localhost') {
     console.log(`[Dev Analytics] Goal reached: ${targetId}`, params);
     return;
  }

  // Отправляем событие
  window.ym(COUNTER_ID, 'reachGoal', targetId, params);
};
