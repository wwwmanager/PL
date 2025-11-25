
import { WaybillStatus } from '../types';

export const WAYBILL_TRANSITIONS: Record<WaybillStatus, WaybillStatus[]> = {
  [WaybillStatus.DRAFT]: [
    WaybillStatus.SUBMITTED,
    WaybillStatus.POSTED,
    WaybillStatus.CANCELLED,
  ],
  [WaybillStatus.SUBMITTED]: [
    WaybillStatus.POSTED,
    WaybillStatus.DRAFT, // Возврат на доработку
    WaybillStatus.CANCELLED, // Разрешено для Central mode
  ],
  [WaybillStatus.POSTED]: [
    WaybillStatus.DRAFT, // Корректировка
  ],
  [WaybillStatus.CANCELLED]: [
    // Терминальный статус, выходов нет
  ],
  // Для обратной совместимости, если статус COMPLETED где-то используется как POSTED
  // Но в enum WaybillStatus COMPLETED и POSTED — это разные ключи с одинаковым значением 'Posted'.
  // Здесь используем ключи enum.
};

export function canTransition(
  from: WaybillStatus,
  to: WaybillStatus,
): boolean {
  const allowed = WAYBILL_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}

export function formatTransitionError(
  from: WaybillStatus,
  to: WaybillStatus,
): string {
  return `Недопустимый переход статуса: ${from} → ${to}`;
}
