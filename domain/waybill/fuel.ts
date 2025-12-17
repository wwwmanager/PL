
/**
 * Чистая доменная логика расчетов топлива.
 * Не зависит от внешних сервисов, React или базы данных.
 */

/**
 * Рассчитывает нормативный расход топлива на заданное расстояние.
 * 
 * @param distanceKm Пробег в километрах
 * @param baseNormRate Базовая норма расхода (л/100км)
 * @param coefficients Объект с коэффициентами (0.1 = 10%, 0.05 = 5%)
 * @returns Нормативный расход в литрах (округленный до сотых)
 */
export const calculateNormConsumption = (
  distanceKm: number,
  baseNormRate: number,
  coefficients: {
    winter?: number;      // Зимняя надбавка (напр. 0.1)
    city?: number;        // Городской цикл (напр. 0.1)
    warming?: number;     // Прогрев (напр. 0.05)
    other?: number;
  } = {}
): number => {
  // Защита от некорректных данных
  if (distanceKm < 0 || baseNormRate < 0) return 0;

  // 1. Суммируем все надбавки
  // Пример: Зима (10%) + Город (5%) = 15% (0.15)
  // В некоторых методиках коэффициенты перемножаются, но в ПЛ обычно суммируются к базе.
  const totalCoeff = (coefficients.winter || 0) + 
                     (coefficients.city || 0) + 
                     (coefficients.warming || 0) + 
                     (coefficients.other || 0);

  // 2. Считаем расход: (Км / 100) * База * (1 + Коэф)
  const totalConsumption = (distanceKm / 100) * baseNormRate * (1 + totalCoeff);

  // 3. Округляем до 2 знаков (стандартная практика для ГСМ)
  return Math.round(totalConsumption * 100) / 100;
};

/**
 * Рассчитывает остаток топлива на конец периода (математический баланс).
 * Formula: Нач + Заправка - Расход = Кон
 */
export const calculateFuelEnd = (
  start: number,
  filled: number,
  consumed: number
): number => {
  const result = (start || 0) + (filled || 0) - (consumed || 0);
  // Технически остаток не может быть меньше 0, но возвращаем как есть,
  // чтобы валидатор мог обнаружить ошибку "Отрицательный остаток".
  return Math.round(result * 100) / 100;
};
