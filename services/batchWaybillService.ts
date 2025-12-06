
import { parseAndPreviewRouteFile, RouteSegment } from './routeParserService';
import { isWorkingDayStandard, getHolidayName } from './productionCalendarService';
import { Waybill, WaybillStatus, Vehicle, Employee, WaybillBlank } from '../types';
import { addWaybill, getBlanks, reserveBlank, getSeasonSettings } from './mockApi';
import { calculateDistance, isWinterDate } from '../utils/waybillCalculations';

export interface BatchPreviewItem {
  dateStr: string; // yyyy-mm-dd
  dateObj: Date;
  dayOfWeek: string;
  isWorking: boolean;
  holidayName?: string;
  routes: RouteSegment[];
  totalDistance: number;
  warnings: string[];
}

export type GroupingDuration = 'day' | '2days' | 'week' | 'month';

export interface BatchConfig {
  driverId: string;
  vehicleId: string;
  organizationId: string;
  dispatcherId: string;
  controllerId: string;
  createEmptyDays: boolean;
  groupingDuration: GroupingDuration;
}

// Хелпер для нормализации даты из формата парсера (ДД.ММ.ГГГГ) в ISO (ГГГГ-ММ-ДД)
const normalizeDate = (dateStr: string): string => {
  if (!dateStr) return '';
  // Ожидаем dd.mm.yyyy
  const parts = dateStr.split('.');
  if (parts.length === 3) {
      // return yyyy-mm-dd
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
};

export const generateBatchPreview = async (
  file: File,
  periodStart?: string,
  periodEnd?: string
): Promise<BatchPreviewItem[]> => {
  const buffer = await file.arrayBuffer();
  
  // 1. Используем существующий парсер
  const { routeSegments } = await parseAndPreviewRouteFile(buffer, file.name, file.type, {
    autoRemoveEmpty: true 
  });

  // 2. Группировка по датам с НОРМАЛИЗАЦИЕЙ ключа
  const segmentsByDate = new Map<string, RouteSegment[]>();
  const normalizedDates: string[] = [];

  routeSegments.forEach(seg => {
    if (seg.date) {
       const isoDate = normalizeDate(seg.date); // Превращаем 01.06.2025 в 2025-06-01 для ключа
       
       if (!segmentsByDate.has(isoDate)) {
         segmentsByDate.set(isoDate, []);
         normalizedDates.push(isoDate);
       }
       segmentsByDate.get(isoDate)!.push(seg);
    }
  });

  // 3. Определение диапазона дат
  let start: Date;
  let end: Date;

  if (periodStart && periodEnd) {
      start = new Date(periodStart);
      end = new Date(periodEnd);
  } else {
      // Сортируем ISO строки, чтобы найти мин/макс
      normalizedDates.sort(); 
      if (normalizedDates.length > 0) {
          start = new Date(normalizedDates[0]);
          end = new Date(normalizedDates[normalizedDates.length - 1]);
      } else {
          start = new Date();
          end = new Date();
      }
  }

  // Сброс времени для корректного цикла
  const current = new Date(start);
  current.setHours(0,0,0,0);
  const endDate = new Date(end);
  endDate.setHours(0,0,0,0);

  const items: BatchPreviewItem[] = [];

  // 4. Проход по календарю
  // Используем цикл while для надежного перебора дней
  while (current <= endDate) {
    // Формируем ключ yyyy-mm-dd
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;

    const routes = segmentsByDate.get(dateKey) || [];
    const dist = calculateDistance(routes as any[]);
    
    const isStandardWorking = isWorkingDayStandard(current);
    const holiday = getHolidayName(current);

    // Если есть поездки — считаем день рабочим принудительно
    const isWorking = isStandardWorking || routes.length > 0;

    const warnings: string[] = [];
    if (!isStandardWorking && routes.length > 0) {
        warnings.push('Поездки в выходной/праздник');
    }

    items.push({
        dateStr: dateKey,
        dateObj: new Date(current),
        dayOfWeek: current.toLocaleDateString('ru-RU', { weekday: 'short' }),
        isWorking,
        holidayName: holiday,
        routes,
        totalDistance: dist,
        warnings
    });

    // Переходим к следующему дню
    current.setDate(current.getDate() + 1);
  }

  return items;
};

// --- Helper for grouping logic ---
const calculateGroupConsumption = (group: BatchPreviewItem[], vehicle: Vehicle) => {
    let totalDist = 0;
    let totalConsumption = 0;

    for (const item of group) {
        totalDist += item.totalDistance;
        const isWinter = [0, 1, 2, 10, 11].includes(item.dateObj.getMonth());
        const rate = isWinter ? vehicle.fuelConsumptionRates.winterRate : vehicle.fuelConsumptionRates.summerRate;
        totalConsumption += (item.totalDistance / 100) * rate;
    }
    return { distance: totalDist, consumption: totalConsumption };
};

const createWaybillFromGroup = async (
    group: BatchPreviewItem[], 
    config: BatchConfig, 
    vehicle: Vehicle, 
    blank: WaybillBlank | undefined, 
    startOdo: number, 
    startFuel: number
) => {
    const first = group[0];
    const last = group[group.length - 1];
    
    const { distance, consumption } = calculateGroupConsumption(group, vehicle);
    const endOdo = startOdo + distance;
    const endFuel = startFuel - consumption;

    // Collect all routes
    const waybillRoutes = [];
    for (const item of group) {
        for (const r of item.routes) {
            waybillRoutes.push({
                id: r.id,
                from: r.from,
                to: r.to,
                distanceKm: r.distanceKm,
                isCityDriving: false,
                isWarming: false,
                date: item.dateStr
            });
        }
    }

    const payload: Omit<Waybill, 'id'> = {
        number: blank ? `${blank.series}${String(blank.number).padStart(6, '0')}` : 'Б/Н',
        blankId: blank?.id,
        blankSeries: blank?.series,
        blankNumber: blank?.number,
        
        date: first.dateStr,
        validFrom: `${first.dateStr}T08:00`,
        validTo: `${last.dateStr}T17:00`,
        
        vehicleId: config.vehicleId,
        driverId: config.driverId,
        organizationId: config.organizationId,
        dispatcherId: config.dispatcherId,
        controllerId: config.controllerId,
        
        status: WaybillStatus.DRAFT,
        
        odometerStart: Math.round(startOdo),
        odometerEnd: Math.round(endOdo),
        fuelAtStart: Math.round(startFuel * 100) / 100,
        fuelAtEnd: Math.round(endFuel * 100) / 100,
        fuelPlanned: Math.round(consumption * 100) / 100,
        fuelFilled: 0,
        
        routes: waybillRoutes,
        notes: 'Пакетная генерация',
    };

    const wb = await addWaybill(payload);
    
    // IMPORTANT: Reserve the blank immediately
    if (blank) {
        await reserveBlank(blank.id, wb.id);
    }
};

export const saveBatchWaybills = async (
    items: BatchPreviewItem[],
    config: BatchConfig,
    vehicle: Vehicle,
    driver: Employee,
    onProgress: (current: number, total: number) => void
): Promise<void> => {
    
    let runningOdometer = vehicle.mileage;
    let runningFuel = vehicle.currentFuel || 0;

    // 1. Fetch ALL blanks for the driver
    const allBlanks = await getBlanks();
    const availableBlanks = allBlanks
        .filter(b => b.ownerEmployeeId === config.driverId && b.status === 'issued')
        .sort((a, b) => a.series.localeCompare(b.series) || a.number - b.number);
    
    let blankIndex = 0;

    // 2. Fetch Season Settings for split logic
    const seasonSettings = await getSeasonSettings();

    // 3. Filter valid items and ENSURE CHRONOLOGICAL ORDER (Oldest First)
    const validItems = items
        .filter(i => i.isWorking)
        .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

    if (validItems.length === 0) return;

    // 4. Grouping Loop
    let currentGroup: BatchPreviewItem[] = [];
    let processedGroups = 0;
    
    const estimateTotal = validItems.length; // Approximate

    for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i];
        
        if (item.routes.length === 0 && !config.createEmptyDays) {
            continue; 
        }

        let startNewGroup = false;

        if (currentGroup.length === 0) {
            startNewGroup = false; 
        } else {
            const firstInGroup = currentGroup[0];
            const prevInGroup = currentGroup[currentGroup.length - 1]; // Last added item
            const diffTime = item.dateObj.getTime() - firstInGroup.dateObj.getTime();
            
            // --- Season Change Check ---
            // Если между предыдущим днем и текущим происходит смена сезона, принудительно разрываем группу.
            const wasWinter = isWinterDate(prevInGroup.dateStr, seasonSettings);
            const isWinter = isWinterDate(item.dateStr, seasonSettings);
            
            if (wasWinter !== isWinter) {
                startNewGroup = true;
            } 
            // --- End Season Check ---
            
            else if (config.groupingDuration === 'day') {
                startNewGroup = true;
            } else if (config.groupingDuration === '2days') {
                // If diff is > 1.5 days (i.e. more than consecutive), split
                const gapDays = diffTime / (1000 * 60 * 60 * 24);
                if (currentGroup.length >= 2 || gapDays > 1.5) {
                    startNewGroup = true;
                }
            } else if (config.groupingDuration === 'week') {
                const prevDate = currentGroup[currentGroup.length - 1].dateObj;
                const currentDate = item.dateObj;
                const isMonday = currentDate.getDay() === 1;
                // New group if Monday and not same day as prev, or gap > 6 days
                const dayDiff = (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
                
                // Check if month changed between previous item and current item
                const isMonthChanged = prevDate.getMonth() !== currentDate.getMonth();
                
                if ((isMonday && dayDiff > 0.5) || dayDiff > 6 || isMonthChanged) {
                    startNewGroup = true;
                }
            } else if (config.groupingDuration === 'month') {
                if (item.dateObj.getMonth() !== firstInGroup.dateObj.getMonth()) {
                    startNewGroup = true;
                }
            }
        }

        if (startNewGroup && currentGroup.length > 0) {
            await createWaybillFromGroup(currentGroup, config, vehicle, availableBlanks[blankIndex], runningOdometer, runningFuel);
            
            const groupDist = currentGroup.reduce((sum, it) => sum + it.totalDistance, 0);
            const { consumption } = calculateGroupConsumption(currentGroup, vehicle);
            
            runningOdometer += groupDist;
            runningFuel -= consumption;
            if (availableBlanks[blankIndex]) blankIndex++;
            processedGroups++;
            onProgress(i, estimateTotal);
            currentGroup = [];
        }

        currentGroup.push(item);
    }

    if (currentGroup.length > 0) {
        await createWaybillFromGroup(currentGroup, config, vehicle, availableBlanks[blankIndex], runningOdometer, runningFuel);
        processedGroups++;
        onProgress(estimateTotal, estimateTotal);
    }
};
