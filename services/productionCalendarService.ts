
// services/productionCalendarService.ts
import { CalendarEvent } from '../types';

// Fallback constants if DB is empty
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

// Fallback exceptions
const CALENDAR_EXCEPTIONS: Record<string, Record<string, boolean>> = {
    '2025': {
        '05-02': false, 
        '05-08': false, 
        '06-13': false, 
        '11-01': true,  
        '11-03': false, 
    }
};

const toISODate = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

/**
 * Checks if a day is a working day.
 * Priority:
 * 1. DB Events (if present for the year): Strict lookup.
 * 2. Fallback (if no DB events): Hardcoded exceptions -> Weekends -> Fixed Holidays.
 */
export const isWorkingDayStandard = (date: Date, events?: CalendarEvent[]): boolean => {
  const isoDate = toISODate(date);
  const year = date.getFullYear();
  
  // 1. Check DB events availability for the specific year
  // Optimization: usually passed events are already filtered or full list. 
  // We check if ANY event exists for this year to decide mode.
  const hasEventsForYear = events && events.some(e => e.date.startsWith(`${year}-`));

  if (hasEventsForYear && events) {
      // --- DICTIONARY MODE ---
      const event = events.find(e => e.date === isoDate);
      
      if (event) {
          if (event.type === 'workday') return true; // Explicit working day (transfer)
          if (event.type === 'holiday') return false; // Explicit holiday
          if (event.type === 'short') return true; // Short day is working
      }
      
      // If no explicit event found, rely purely on standard weekends
      const dayOfWeek = date.getDay(); // 0 = Sun, 6 = Sat
      return dayOfWeek !== 0 && dayOfWeek !== 6;
  } 
  
  // --- FALLBACK MODE (Legacy/No Data) ---
  
  // 2.1. Check Hardcoded Exceptions
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const key = `${month}-${day}`;
  const yearStr = year.toString();
  
  if (CALENDAR_EXCEPTIONS[yearStr] && CALENDAR_EXCEPTIONS[yearStr][key] !== undefined) {
      return CALENDAR_EXCEPTIONS[yearStr][key];
  }

  // 2.2. Standard Weekend Check
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  // 2.3. Fixed Holidays
  const keyFixed = `${month}-${day}`;
  if (HOLIDAYS_RU_FIXED[keyFixed]) return false;

  return true;
};

export const getHolidayName = (date: Date, events?: CalendarEvent[]): string => {
  const isoDate = toISODate(date);
  const year = date.getFullYear();
  
  // DB Check
  if (events) {
      const event = events.find(e => e.date === isoDate);
      if (event && event.type === 'holiday') return event.note || 'Праздник';
  }

  // Fallback Check
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const key = `${month}-${day}`;
  
  if (HOLIDAYS_RU_FIXED[key]) return HOLIDAYS_RU_FIXED[key];
  
  const yearStr = year.toString();
  if (CALENDAR_EXCEPTIONS[yearStr] && CALENDAR_EXCEPTIONS[yearStr][key] === false) {
      return 'Выходной (перенос)';
  }
  
  return '';
};

export const getWorkingWeekRange = (date: Date, events?: CalendarEvent[]): { start: Date; end: Date } => {
  const current = new Date(date);
  const day = current.getDay(); 
  
  const diffToMon = day === 0 ? -6 : 1 - day;
  
  const monday = new Date(current);
  monday.setDate(current.getDate() + diffToMon);
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(0, 0, 0, 0);

  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  const rangeStart = monday < monthStart ? monthStart : monday;
  const rangeEnd = sunday > monthEnd ? monthEnd : sunday;
  
  const workingDays: Date[] = [];
  let iter = new Date(rangeStart);
  
  while (iter <= rangeEnd) {
      if (isWorkingDayStandard(iter, events)) {
          workingDays.push(new Date(iter));
      }
      iter.setDate(iter.getDate() + 1);
  }

  if (workingDays.length === 0) {
      return { start: rangeStart, end: rangeEnd };
  }

  return {
      start: workingDays[0],
      end: workingDays[workingDays.length - 1]
  };
};
