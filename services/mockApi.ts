
import { createRepo } from './repo';
import { DB_KEYS } from './dbKeys';
import { addStockTransaction, getGarageStockItems, postStockTransaction } from './api/inventory';
import { getEmployees, updateEmployee } from './api/employees';
import { auditBusiness } from './auditBusiness';
import { FuelCardSchedule, CalendarEvent } from '../types';

// Re-exports for backward compatibility and centralized access
export { DB_KEYS };
export { invalidateRepoCache } from './repo';
export * from './api/core';
export * from './api/settings';
export * from './api/dictionaries';
export * from './api/vehicles';
export * from './api/employees';
export * from './api/users';
export * from './api/inventory';
export * from './api/blanks';
export * from './api/waybills';
export * from './api/dashboard';
export * from './api/system';
export * from './api/tires';
export * from './api/integrity'; // NEW Export
export { generateNextNumber } from './sequenceService';

const scheduleRepo = createRepo<FuelCardSchedule>(DB_KEYS.FUEL_CARD_SCHEDULES);
const calendarRepo = createRepo<CalendarEvent>(DB_KEYS.CALENDAR_EVENTS);

export const getFuelCardSchedules = async () => (await scheduleRepo.list({ pageSize: 1000 })).data;
export const addFuelCardSchedule = (item: Omit<FuelCardSchedule, 'id'>) => scheduleRepo.create(item);
export const updateFuelCardSchedule = (item: FuelCardSchedule) => scheduleRepo.update(item.id, item);
export const deleteFuelCardSchedule = (id: string) => scheduleRepo.remove(id);

export const processAutoTopUps = async () => {
    const schedules = (await scheduleRepo.list({ pageSize: 1000 })).data;
    const activeSchedules = schedules.filter(s => s.isActive);
    const employees = await getEmployees();
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentQuarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    
    const processed: string[] = [];
    const deficits: string[] = [];

    for (const schedule of activeSchedules) {
        let shouldExecute = false;
        // Convert last executed to Date object
        const lastExec = schedule.lastExecutedAt ? new Date(schedule.lastExecutedAt) : null;
        // Determine the target start date based on frequency
        const targetStartDate = schedule.frequency === 'quarterly' ? currentQuarterStart : currentMonthStart;
        // Check if we haven't executed in this period yet
        if (!lastExec || lastExec < targetStartDate) {
            shouldExecute = true;
        }
        if (shouldExecute) {
            try {
                const driver = employees.find(e => e.id === schedule.driverId);
                if (!driver || !driver.organizationId) {
                    console.warn(`[AutoTopUp] Driver ${schedule.driverId} not found or missing org, skipping.`);
                    continue;
                }
                // 1. Reset Balance if needed (Quarterly/Monthly reset policy)
                // We reset balance to 0 BEFORE adding new funds
                if ((driver.fuelCardBalance || 0) > 0) {
                    const oldBalance = driver.fuelCardBalance || 0;
                    // Reset locally and in DB
                    driver.fuelCardBalance = 0;
                    await updateEmployee(driver);
                    // Log the reset event
                    await auditBusiness('employee.fuelReset', {
                        employeeId: driver.id,
                        oldBalance: oldBalance,
                        actorId: 'system-auto-scheduler'
                    });
                }
                
                // 2. Create Transaction (Draft)
                const tx = await addStockTransaction({
                    docNumber: '', // will be auto-generated
                    date: now.toISOString().split('T')[0], // Today
                    type: 'expense',
                    expenseReason: 'fuelCardTopUp',
                    driverId: schedule.driverId,
                    organizationId: driver.organizationId,
                    items: [{ stockItemId: schedule.stockItemId, quantity: schedule.quantity }],
                    notes: `Автопополнение (${schedule.frequency === 'quarterly' ? 'Квартальное' : 'Ежемесячное'})`
                });

                // 3. Post Transaction (Execute movements)
                await postStockTransaction(tx.id);

                // 4. Check for deficit
                const stockItems = await getGarageStockItems();
                const stockItem = stockItems.find(i => i.id === schedule.stockItemId);
                if (stockItem && stockItem.balance < 0) {
                    if (!deficits.includes(stockItem.name)) {
                        deficits.push(stockItem.name);
                    }
                }

                // 5. Update Schedule
                const updatedSchedule = { ...schedule, lastExecutedAt: now.toISOString() };
                await scheduleRepo.update(schedule.id, updatedSchedule);
                processed.push(driver.shortName);
            }
            catch (e) {
                console.error(`[AutoTopUp] Failed for schedule ${schedule.id}:`, e);
            }
        }
    }
    return { processed, deficits };
};
// --- Calendar API ---
export const getCalendarEvents = async () => (await calendarRepo.list({ pageSize: 2000 })).data;
export const updateCalendarEvent = async (event: CalendarEvent) => {
    // Check if event exists
    const existing = await calendarRepo.list({ filters: { date: event.date } });
    if (existing.data.length > 0) {
        return calendarRepo.update(existing.data[0].id, event);
    }
    else {
        return calendarRepo.create(event); // id will be generated
    }
};

/**
 * Обрабатывает сырой JSON календарь (различные форматы xmlcalendar.ru)
 */
export const processCalendarJson = async (data: any, yearInput: number) => {
    try {
        const eventsToAdd: Omit<CalendarEvent, 'id'>[] = [];
        
        // Определяем год из данных или используем входной параметр
        const year = (data && data.year) ? Number(data.year) : yearInput;

        // Стратегия 1: Компактный формат (массив months со строкой days)
        // Пример: { months: [{ month: 1, days: "1,2,3+,4*" }] }
        if (data && Array.isArray(data.months)) {
            data.months.forEach((m: any) => {
                const month = Number(m.month); // 1-12
                const daysStr = m.days; // "1,2,3+,4*"
                
                if (typeof daysStr === 'string' && daysStr.trim()) {
                    const dayParts = daysStr.split(',');
                    dayParts.forEach(dStr => {
                        if (!dStr) return;
                        
                        let type: CalendarEvent['type'] = 'holiday'; // По умолчанию в списке - выходные
                        let dayVal = dStr;

                        // Обработка модификаторов
                        // * - сокращенный рабочий день
                        if (dStr.endsWith('*')) {
                            type = 'short';
                            dayVal = dStr.slice(0, -1);
                        } 
                        // + - перенесенный выходной (все равно выходной)
                        else if (dStr.endsWith('+')) {
                            type = 'holiday';
                            dayVal = dStr.slice(0, -1);
                        }

                        const day = Number(dayVal);
                        if (!isNaN(day) && !isNaN(month)) {
                            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            eventsToAdd.push({
                                date: dateStr,
                                type,
                                note: undefined
                            });
                        }
                    });
                }
            });
        }
        // Стратегия 2: Полный список дней (массив days объектов)
        // Пример: { days: [{ d: "01.01", t: 1 }] }
        else {
            let daysArray: any[] = [];
            if (Array.isArray(data)) {
                daysArray = data;
            } else if (data && Array.isArray(data.days)) {
                daysArray = data.days;
            }

            daysArray.forEach((d: any) => {
                if (!d) return;

                const rawDate = d.date || d.d;
                if (!rawDate || typeof rawDate !== 'string') return;

                const rawType = d.type !== undefined ? d.type : d.t;
                const note = d.note || d.n || d.holiday;

                const parts = rawDate.split('.');
                if (parts.length < 2) return;
                
                const [day, month] = parts;
                const dateStr = `${year}-${month}-${day}`;
                
                let type: CalendarEvent['type'] | null = null;
                const t = Number(rawType);

                // 1 - Праздник/Выходной, 2 - Сокращенный, 3 - Рабочий (перенос)
                if (t === 1) type = 'holiday';
                else if (t === 2) type = 'short';
                else if (t === 3) type = 'workday';
                
                if (type) {
                    eventsToAdd.push({
                        date: dateStr,
                        type,
                        note: note || undefined
                    });
                }
            });
        }
        
        if (eventsToAdd.length === 0) {
             return 0;
        }

        // Очищаем старые события только если нашли новые
        const allEvents = await getCalendarEvents();
        const eventsToDelete = allEvents.filter(e => e.date.startsWith(`${year}-`));
        if (eventsToDelete.length > 0) {
            await calendarRepo.removeBulk(eventsToDelete.map(e => e.id));
        }
        
        // Сохраняем новые
        for (const evt of eventsToAdd) {
            await calendarRepo.create(evt);
        }
        
        return eventsToAdd.length;
    }
    catch (error) {
        console.error('Failed to process calendar data:', error);
        throw error;
    }
};

export const fetchOfficialCalendar = async (year: number) => {
    // Список прокси для попытки обхода CORS
    const proxies = [
        (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        // Прямой запрос как фоллбэк (если CORS настроен на сервере, что вряд ли, но полезно для локалки)
        (url: string) => url 
    ];

    const targetUrl = `https://xmlcalendar.ru/data/ru/${year}/calendar.json`;
    let data: any = null;
    let lastError = null;

    for (const makeProxyUrl of proxies) {
        try {
            const url = makeProxyUrl(targetUrl);
            const response = await fetch(url);
            if (response.ok) {
                data = await response.json();
                // Если получили данные, прерываем цикл
                if (data) break; 
            }
        } catch (e) {
            lastError = e;
            console.warn(`Calendar fetch failed via proxy:`, e);
        }
    }

    if (!data) {
        console.error('All calendar fetch attempts failed', lastError);
        throw new Error('Не удалось загрузить календарь автоматически. Попробуйте ручную загрузку JSON.');
    }

    return processCalendarJson(data, year);
};
