
import { Waybill, WaybillStatus } from '../../types';

/**
 * Доменные правила путевого листа.
 * Отвечают на вопросы: "Можно ли?", "Валидно ли?".
 */
export const WaybillRules = {
  /**
   * Проверка корректности показаний одометра.
   * Конечный пробег не может быть меньше начального.
   */
  isValidOdometer: (start: number, end: number): boolean => {
    return end >= start;
  },

  /**
   * Проверяет, можно ли редактировать/удалять путевой лист.
   * 
   * @param waybill Путевой лист
   * @param isPeriodClosed Флаг, закрыт ли период для даты этого ПЛ
   */
  canEdit: (waybill: Waybill, isPeriodClosed: boolean): { allowed: boolean; reason?: string } => {
    if (isPeriodClosed) {
      return { allowed: false, reason: `Период для даты ${waybill.date} закрыт.` };
    }
    
    // Нельзя редактировать "Проведенный" или "Отмененный" документ напрямую.
    // Его нужно сначала вернуть в статус черновика (Корректировка).
    if (waybill.status === WaybillStatus.POSTED) {
      return { allowed: false, reason: 'Документ проведен. Сначала выполните корректировку или отмену проведения.' };
    }

    if (waybill.status === WaybillStatus.CANCELLED) {
        return { allowed: false, reason: 'Документ аннулирован.' };
    }

    return { allowed: true };
  },

  /**
   * Проверяет, можно ли провести путевой лист (Draft -> Posted).
   */
  canPost: (waybill: Partial<Waybill>): { allowed: boolean; reason?: string } => {
    if (!waybill.driverId) return { allowed: false, reason: 'Не указан водитель.' };
    if (!waybill.vehicleId) return { allowed: false, reason: 'Не указан автомобиль.' };
    
    if ((waybill.odometerEnd ?? 0) < (waybill.odometerStart ?? 0)) {
        return { allowed: false, reason: 'Конечный пробег меньше начального.' };
    }

    if ((waybill.fuelAtEnd ?? 0) < 0) {
        return { allowed: false, reason: 'Отрицательный остаток топлива.' };
    }

    return { allowed: true };
  }
};
