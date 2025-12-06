
// services/productionCalendarService.ts

// Основные нерабочие праздничные дни в РФ (фиксированные даты MM-DD)
const HOLIDAYS_RU_FIXED: Record<string, string> = {
  '01-01': 'Новый год',
  '01-02': 'Новый год',
  '01-03': 'Новый год',
  '01-04': 'Новый год',
  '01-05': 'Новый год',
  '01-06': 'Новый год',
  '01-07': 'Рождество Христово',
  '01-08': 'Новый год',
  '02-23': 'День защитника Отечества',
  '03-08': 'Международный женский день',
  '05-01': 'Праздник Весны и Труда',
  '05-09': 'День Победы',
  '06-12': 'День России',
  '11-04': 'День народного единства',
};

/**
 * Проверяет, является ли дата выходным (Суббота, Воскресенье) или праздником РФ.
 * @param date объект Date
 * @returns true, если день рабочий по стандартному календарю 5/2
 */
export const isWorkingDayStandard = (date: Date): boolean => {
  const dayOfWeek = date.getDay(); // 0 = Sun, 6 = Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (isWeekend) return false;

  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const key = `${month}-${day}`;

  if (HOLIDAYS_RU_FIXED[key]) return false;

  return true;
};

/**
 * Возвращает название праздника или пустую строку
 */
export const getHolidayName = (date: Date): string => {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const key = `${month}-${day}`;
  return HOLIDAYS_RU_FIXED[key] || '';
};
