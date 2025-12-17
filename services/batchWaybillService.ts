
import { parseAndPreviewRouteFile, RouteSegment } from './routeParserService';
import { isWorkingDayStandard, getHolidayName, getWorkingWeekRange } from './productionCalendarService';
import { Waybill, WaybillStatus, Vehicle, Employee, WaybillBlank, SeasonSettings, CalendarEvent, WaybillCalculationMethod } from '../types';
import { addWaybill, reserveBlank, getBlanks } from './mockApi';
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
  fuelFilled?: number;
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
  calculationMethod: WaybillCalculationMethod; // Added
}

const normalizeDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('.');
  if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
};

const timeToMinutes = (time: string | undefined): number | null => {
    if (!time) return null;
    const [h, m] = time.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
};

const minutesToTime = (totalMinutes: number): string => {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const toLocalISO = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

export const generateBatchPreview = async (
  file: File,
  periodStart?: string,
  periodEnd?: string,
  calendarEvents?: CalendarEvent[]
): Promise<BatchPreviewItem[]> => {
  const buffer = await file.arrayBuffer();
  
  const { routeSegments } = await parseAndPreviewRouteFile(buffer, file.name, file.type, {
    autoRemoveEmpty: true 
  });

  const segmentsByDate = new Map<string, RouteSegment[]>();
  const normalizedDates: string[] = [];

  routeSegments.forEach(seg => {
    if (seg.date) {
       const isoDate = normalizeDate(seg.date);
       
       if (!segmentsByDate.has(isoDate)) {
         segmentsByDate.set(isoDate, []);
         normalizedDates.push(isoDate);
       }
       segmentsByDate.get(isoDate)!.push(seg);
    }
  });

  let start: Date;
  let end: Date;

  if (periodStart && periodEnd) {
      start = new Date(periodStart);
      end = new Date(periodEnd);
  } else {
      normalizedDates.sort(); 
      if (normalizedDates.length > 0) {
          start = new Date(normalizedDates[0]);
          end = new Date(normalizedDates[normalizedDates.length - 1]);
      } else {
          start = new Date();
          end = new Date();
      }
  }

  const current = new Date(start);
  current.setHours(0,0,0,0);
  const endDate = new Date(end);
  endDate.setHours(0,0,0,0);

  const items: BatchPreviewItem[] = [];

  while (current <= endDate) {
    const dateKey = toLocalISO(current);

    const routes = segmentsByDate.get(dateKey) || [];
    const dist = calculateDistance(routes as any[]);
    
    // Pass events to service functions
    const isStandardWorking = isWorkingDayStandard(current, calendarEvents);
    const holiday = getHolidayName(current, calendarEvents);

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
        warnings,
        fuelFilled: 0 
    });

    current.setDate(current.getDate() + 1);
  }

  return items;
};

const calculateGroupConsumption = (group: BatchPreviewItem[], vehicle: Vehicle, seasonSettings: SeasonSettings | null) => {
    let totalDist = 0;
    let totalConsumption = 0;

    for (const item of group) {
        totalDist += item.totalDistance;
        const isWinter = isWinterDate(item.dateStr, seasonSettings);
        const rate = isWinter ? vehicle.fuelConsumptionRates.winterRate : vehicle.fuelConsumptionRates.summerRate;
        totalConsumption += (item.totalDistance / 100) * rate;
    }
    return { distance: totalDist, consumption: totalConsumption };
};

const getISOWeek = (date: Date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
};

const createWaybillFromGroup = async (
    group: BatchPreviewItem[], 
    config: BatchConfig, 
    vehicle: Vehicle, 
    blank: WaybillBlank | undefined, 
    startOdo: number, 
    startFuel: number,
    actorId?: string,
    fuelFilledSum: number = 0,
    seasonSettings?: SeasonSettings,
    calendarEvents?: CalendarEvent[]
) => {
    const first = group[0];
    const last = group[group.length - 1];
    
    let validFromStr = first.dateStr;
    let validToStr = last.dateStr;

    if (config.groupingDuration === 'week') {
        const { start, end } = getWorkingWeekRange(first.dateObj, calendarEvents);
        
        let finalStart = start;
        let finalEnd = end;

        if (seasonSettings) {
             const targetSeasonIsWinter = isWinterDate(first.dateStr, seasonSettings);
             
             const startStr = toLocalISO(finalStart);
             if (isWinterDate(startStr, seasonSettings) !== targetSeasonIsWinter) {
                 let d = new Date(finalStart);
                 while (d < finalEnd) {
                     const dStr = toLocalISO(d);
                     if (isWinterDate(dStr, seasonSettings) === targetSeasonIsWinter) {
                         finalStart = d;
                         break;
                     }
                     d.setDate(d.getDate() + 1);
                 }
             }

             const endStr = toLocalISO(finalEnd);
             if (isWinterDate(endStr, seasonSettings) !== targetSeasonIsWinter) {
                 let d = new Date(finalEnd);
                 while (d > finalStart) {
                     const dStr = toLocalISO(d);
                     if (isWinterDate(dStr, seasonSettings) === targetSeasonIsWinter) {
                         finalEnd = d;
                         break;
                     }
                     d.setDate(d.getDate() - 1);
                 }
             }
        }

        validFromStr = toLocalISO(finalStart);
        validToStr = toLocalISO(finalEnd);
    } 

    const { distance, consumption } = calculateGroupConsumption(group, vehicle, seasonSettings || null);
    const endOdo = startOdo + distance;
    const endFuel = startFuel + fuelFilledSum - consumption; 

    const waybillRoutes = [];
    let minMinutes = 24 * 60;
    let maxMinutes = 0;       
    let hasTimes = false;

    for (const item of group) {
        for (const r of item.routes) {
            if (r.departureTime) {
                const mins = timeToMinutes(r.departureTime);
                if (mins !== null) {
                    if (mins < minMinutes) minMinutes = mins;
                    hasTimes = true;
                }
            }
            if (r.arrivalTime) {
                const mins = timeToMinutes(r.arrivalTime);
                if (mins !== null) {
                    if (mins > maxMinutes) maxMinutes = mins;
                    hasTimes = true;
                }
            }

            waybillRoutes.push({
                id: r.id,
                from: r.from,
                to: r.to,
                distanceKm: r.distanceKm,
                isCityDriving: false,
                isWarming: false,
                date: item.dateStr,
                departureTime: r.departureTime,
                arrivalTime: r.arrivalTime
            });
        }
    }

    const startTimeStr = hasTimes ? minutesToTime(minMinutes) : '08:00';
    const endTimeStr = hasTimes ? minutesToTime(maxMinutes) : '17:00';

    const payload: Omit<Waybill, 'id'> = {
        number: blank ? `${blank.series}${String(blank.number).padStart(6, '0')}` : 'Б/Н',
        blankId: blank?.id,
        blankSeries: blank?.series,
        blankNumber: blank?.number,
        date: validFromStr,
        validFrom: `${validFromStr}T${startTimeStr}`,
        validTo: `${validToStr}T${endTimeStr}`,
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
        fuelFilled: fuelFilledSum,
        routes: waybillRoutes,
        notes: 'Пакетная генерация',
        calculationMethod: config.calculationMethod, // Pass the method
    };

    const wb = await addWaybill(payload, { userId: actorId });
    if (blank) {
        await reserveBlank(blank.id, wb.id);
    }
};

export const saveBatchWaybills = async (
    items: BatchPreviewItem[],
    config: BatchConfig,
    vehicle: Vehicle,
    driver: Employee,
    onProgress: (current: number, total: number) => void,
    actorId?: string,
    calendarEvents?: CalendarEvent[],
    seasonSettings?: SeasonSettings
): Promise<void> => {
    
    let runningOdometer = vehicle.mileage;
    let runningFuel = vehicle.currentFuel || 0;

    const allBlanks = await getBlanks();
    const availableBlanks = allBlanks
        .filter(b => b.ownerEmployeeId === config.driverId && b.status === 'issued')
        .sort((a, b) => a.series.localeCompare(b.series) || a.number - b.number);
    
    let blankIndex = 0;

    const validItems = items
        .filter(i => i.isWorking)
        .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

    if (validItems.length === 0) return;

    let currentGroup: BatchPreviewItem[] = [];
    let processedGroups = 0;
    const estimateTotal = validItems.length;

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
            const prevInGroup = currentGroup[currentGroup.length - 1]; 
            const diffTime = item.dateObj.getTime() - firstInGroup.dateObj.getTime();
            
            if (item.dateObj.getMonth() !== firstInGroup.dateObj.getMonth()) {
                startNewGroup = true;
            }
            else if (item.dateObj.getFullYear() !== firstInGroup.dateObj.getFullYear()) {
                startNewGroup = true;
            }
            else {
                const wasWinter = isWinterDate(prevInGroup.dateStr, seasonSettings || null);
                const isWinter = isWinterDate(item.dateStr, seasonSettings || null);
                
                if (wasWinter !== isWinter) {
                    startNewGroup = true;
                } else {
                    if (config.groupingDuration === 'day') {
                        startNewGroup = true;
                    } else if (config.groupingDuration === '2days') {
                        const gapDays = diffTime / (1000 * 60 * 60 * 24);
                        if (currentGroup.length >= 2 || gapDays > 1.5) {
                            startNewGroup = true;
                        }
                    } else if (config.groupingDuration === 'week') {
                        const currentWeek = getISOWeek(item.dateObj);
                        const firstWeek = getISOWeek(firstInGroup.dateObj);
                        if (currentWeek !== firstWeek) {
                            startNewGroup = true;
                        }
                    } 
                }
            }
        }

        if (startNewGroup && currentGroup.length > 0) {
            const groupFuelFilled = currentGroup.reduce((sum, it) => sum + (it.fuelFilled || 0), 0);
            
            await createWaybillFromGroup(
                currentGroup, 
                config, 
                vehicle, 
                availableBlanks[blankIndex], 
                runningOdometer, 
                runningFuel, 
                actorId, 
                groupFuelFilled,
                seasonSettings,
                calendarEvents
            );
            
            const groupDist = currentGroup.reduce((sum, it) => sum + it.totalDistance, 0);
            const { consumption } = calculateGroupConsumption(currentGroup, vehicle, seasonSettings || null);
            
            runningOdometer += groupDist;
            runningFuel = runningFuel + groupFuelFilled - consumption;
            
            if (availableBlanks[blankIndex]) blankIndex++;
            processedGroups++;
            onProgress(i, estimateTotal);
            currentGroup = [];
        }

        currentGroup.push(item);
    }

    if (currentGroup.length > 0) {
        const groupFuelFilled = currentGroup.reduce((sum, it) => sum + (it.fuelFilled || 0), 0);
        
        await createWaybillFromGroup(
            currentGroup, 
            config, 
            vehicle, 
            availableBlanks[blankIndex], 
            runningOdometer, 
            runningFuel, 
            actorId, 
            groupFuelFilled,
            seasonSettings,
            calendarEvents
        );
        processedGroups++;
        onProgress(estimateTotal, estimateTotal);
    }
};
