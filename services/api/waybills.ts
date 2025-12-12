
import { Waybill, WaybillStatus, Vehicle, Tire, Employee, WaybillBlank } from '../../types';
import { createRepo, ListQuery } from '../repo';
import { DB_KEYS } from '../dbKeys';
import { auditBusiness } from '../auditBusiness';
import { useBlankForWaybill, releaseBlank, markBlankAsSpoiled, reserveBlank } from './blanks';
import { adjustFuelCardBalance } from './employees';
import { getSeasonSettings, getAppSettings, isWinterDate } from './settings';
import { calculateStats } from '../../utils/waybillCalculations';
import { broadcast } from '../bus';
import { TransactionManager } from '../transactionService';
import { generateNextNumber } from '../sequenceService';
import { withResourceLock } from '../../utils/concurrency';
import { checkPeriodLock } from './integrity';

const waybillRepo = createRepo<Waybill>(DB_KEYS.WAYBILLS);
const vehicleRepo = createRepo<Vehicle>(DB_KEYS.VEHICLES);
const tireRepo = createRepo<Tire>(DB_KEYS.TIRES);
const employeeRepo = createRepo<Employee>(DB_KEYS.EMPLOYEES);
const blankRepo = createRepo<WaybillBlank>(DB_KEYS.WAYBILL_BLANKS);

export interface RecalculationChange {
    field: string;
    oldVal: string | number;
    newVal: string | number;
}

export interface RecalculationLogEntry {
    id: string;
    number: string;
    date: string;
    changes: RecalculationChange[];
    warnings: string[];
}

export const getWaybills = async () => (await waybillRepo.list({ pageSize: 1000, sortBy: 'date', sortDir: 'desc' })).data;
export const fetchWaybills = async (q: ListQuery) => waybillRepo.list(q);
export const fetchWaybillById = (id: string) => waybillRepo.getById(id);

export interface WaybillFilters {
    dateFrom?: string;
    dateTo?: string;
    status?: WaybillStatus | '';
    vehicleId?: string;
    driverId?: string;
}

export const fetchWaybillsInfinite = async (params: { 
    page: number; 
    pageSize: number; 
    filters?: WaybillFilters;
    sort?: { key: string; direction: 'asc' | 'desc' } 
}) => {
    return waybillRepo.list({
        page: params.page,
        pageSize: params.pageSize,
        sortBy: params.sort?.key || 'date',
        sortDir: params.sort?.direction || 'desc',
        predicate: (w: Waybill) => {
            if (!params.filters) return true;
            const { dateFrom, dateTo, status, vehicleId, driverId } = params.filters;
            
            const wDate = w.date ? w.date.split('T')[0] : '';

            if (dateFrom && wDate < dateFrom) return false;
            if (dateTo && wDate > dateTo) return false;
            if (status && w.status !== status) return false;
            if (vehicleId && w.vehicleId !== vehicleId) return false;
            if (driverId && w.driverId !== driverId) return false;
            
            return true;
        }
    });
};

// --- Chain Recalculation Logic ---
const recalculateWaybillChain = async (modifiedWaybill: Waybill) => {
    try {
        const allResult = await waybillRepo.list({ 
            filters: { vehicleId: modifiedWaybill.vehicleId },
            pageSize: 10000 
        });
        
        const sortedChain = allResult.data.sort((a, b) => {
            const timeA = new Date(a.validFrom).getTime();
            const timeB = new Date(b.validFrom).getTime();
            if (timeA !== timeB) return timeA - timeB;
            return a.number.localeCompare(b.number);
        });

        const currentIndex = sortedChain.findIndex(w => w.id === modifiedWaybill.id);
        if (currentIndex === -1 || currentIndex === sortedChain.length - 1) return;

        const vehicle = await vehicleRepo.getById(modifiedWaybill.vehicleId);
        if (!vehicle) return;
        const seasonSettings = await getSeasonSettings();

        let previousWaybill = modifiedWaybill;
        const updates: Waybill[] = [];

        for (let i = currentIndex + 1; i < sortedChain.length; i++) {
            const current = { ...sortedChain[i] };

            if (current.status !== WaybillStatus.DRAFT) {
                break;
            }

            current.odometerStart = previousWaybill.odometerEnd ?? previousWaybill.odometerStart;
            current.fuelAtStart = previousWaybill.fuelAtEnd ?? 0;

            const dayMode = current.date === current.validTo.split('T')[0] ? 'single' : 'multi';
            const method = current.calculationMethod || 'by_total';

            const stats = calculateStats(
                current.routes,
                vehicle,
                seasonSettings,
                current.date,
                dayMode,
                method
            );

            current.odometerEnd = current.odometerStart + stats.distance;
            current.fuelPlanned = stats.consumption;
            
            const fuelFilled = current.fuelFilled || 0;
            current.fuelAtEnd = Math.round(((current.fuelAtStart + fuelFilled) - stats.consumption) * 100) / 100;

            updates.push(current);
            previousWaybill = current;
        }

        if (updates.length > 0) {
            console.log(`[Chain] Updating ${updates.length} waybills in bulk...`);
            await waybillRepo.updateBulk(updates);
            broadcast('waybills');
        }

    } catch (e) {
        console.error('Critical error in chain recalculation:', e);
    }
};

export const recalculateDraftsChain = async (vehicleId: string, fromDate: string): Promise<{ count: number; logs: RecalculationLogEntry[] }> => {
    const allResult = await waybillRepo.list({ 
        filters: { vehicleId },
        pageSize: 10000 
    });
    
    // 1. Находим "якорь" - последний проведенный ПЛ до начала пересчета
    const postedBefore = allResult.data
        .filter(w => w.status === WaybillStatus.POSTED && w.date < fromDate)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    const anchor = postedBefore[0];
    
    const vehicle = await vehicleRepo.getById(vehicleId);
    if (!vehicle) throw new Error('Vehicle not found');

    // 2. Определяем список черновиков для пересчета
    const draftsToProcess = allResult.data
        .filter(w => w.status === WaybillStatus.DRAFT && w.date >= fromDate)
        .sort((a, b) => {
            const timeA = new Date(a.validFrom).getTime();
            const timeB = new Date(b.validFrom).getTime();
            if (timeA !== timeB) return timeA - timeB;
            return a.number.localeCompare(b.number);
        });

    if (draftsToProcess.length === 0) return { count: 0, logs: [] };

    // 3. Инициализируем стартовые значения
    // FIX: Если якоря нет, берем стартовые значения из ПЕРВОГО черновика в цепочке, 
    // а не текущий пробег авто. Текущий пробег авто - это "будущее" для первого черновика 
    // в случае полной отмены проводки.
    let startOdometer = anchor ? (anchor.odometerEnd ?? 0) : (draftsToProcess[0].odometerStart ?? vehicle.mileage);
    let startFuel = anchor ? (anchor.fuelAtEnd ?? 0) : (draftsToProcess[0].fuelAtStart ?? vehicle.currentFuel);

    const seasonSettings = await getSeasonSettings();
    const logs: RecalculationLogEntry[] = [];
    const updates: Waybill[] = [];

    for (const current of draftsToProcess) {
        const wb = { ...current };
        const changes: RecalculationChange[] = [];
        const warnings: string[] = [];

        const prevOdoStart = wb.odometerStart;
        const prevFuelStart = wb.fuelAtStart;
        const prevOdoEnd = wb.odometerEnd;
        const prevFuelEnd = wb.fuelAtEnd;
        const prevFuelPlanned = wb.fuelPlanned;

        wb.odometerStart = startOdometer;
        wb.fuelAtStart = startFuel;

        if (wb.odometerStart !== prevOdoStart) {
            changes.push({ field: 'Одометр (нач)', oldVal: prevOdoStart, newVal: wb.odometerStart });
        }
        if (Math.abs(wb.fuelAtStart - prevFuelStart) > 0.01) {
            changes.push({ field: 'Топливо (нач)', oldVal: prevFuelStart.toFixed(2), newVal: wb.fuelAtStart.toFixed(2) });
        }

        const dayMode = wb.date === wb.validTo.split('T')[0] ? 'single' : 'multi';
        const method = wb.calculationMethod || 'by_total';

        const stats = calculateStats(
            wb.routes,
            vehicle,
            seasonSettings,
            wb.date,
            dayMode,
            method
        );

        wb.odometerEnd = wb.odometerStart + stats.distance;
        wb.fuelPlanned = stats.consumption;
        
        const fuelFilled = wb.fuelFilled || 0;
        wb.fuelAtEnd = Math.round(((wb.fuelAtStart + fuelFilled) - stats.consumption) * 100) / 100;

        if (wb.odometerEnd !== prevOdoEnd) {
            changes.push({ field: 'Одометр (кон)', oldVal: prevOdoEnd ?? '-', newVal: wb.odometerEnd });
        }
        if (Math.abs((wb.fuelPlanned ?? 0) - (prevFuelPlanned ?? 0)) > 0.01) {
            changes.push({ field: 'Норма', oldVal: (prevFuelPlanned ?? 0).toFixed(2), newVal: (wb.fuelPlanned ?? 0).toFixed(2) });
        }
        if (Math.abs((wb.fuelAtEnd ?? 0) - (prevFuelEnd ?? 0)) > 0.01) {
            changes.push({ field: 'Топливо (кон)', oldVal: (prevFuelEnd ?? 0).toFixed(2), newVal: (wb.fuelAtEnd ?? 0).toFixed(2) });
        }

        if ((wb.fuelAtEnd ?? 0) < 0) {
            warnings.push(`Отрицательный остаток топлива: ${wb.fuelAtEnd} л.`);
        }

        updates.push(wb);

        if (changes.length > 0 || warnings.length > 0) {
            logs.push({
                id: wb.id,
                number: wb.number,
                date: wb.date,
                changes,
                warnings
            });
        }

        startOdometer = wb.odometerEnd;
        startFuel = wb.fuelAtEnd ?? 0;
    }

    if (updates.length > 0) {
        await waybillRepo.updateBulk(updates);
        broadcast('waybills');
    }
    
    return { count: logs.length, logs };
};

export const addWaybill = async (item: Omit<Waybill, 'id'>, context?: { userId?: string }) => {
    // 1. ЗАЩИТА: Проверяем, не закрыт ли период для новой даты
    if (await checkPeriodLock(item.date)) {
        throw new Error(`Период для даты ${item.date} закрыт. Создание документа невозможно.`);
    }

    if (!item.calculationMethod) {
        item.calculationMethod = 'by_total';
    }
    if (!item.number || item.number.trim() === '' || item.number === 'БЛАНКОВ НЕТ') {
        item.number = await generateNextNumber('waybill', item.date);
    }

    const wb = await waybillRepo.create(item);
    await auditBusiness('waybill.created', { waybillId: wb.id, actorId: context?.userId });
    await recalculateWaybillChain(wb);
    
    return wb;
};

export const recalculateVehicleStats = async (vehicleId: string) => {
    const vehicle = await vehicleRepo.getById(vehicleId);
    if (!vehicle) return null;

    const allWaybills = await waybillRepo.list({ 
        filters: { vehicleId }, 
        pageSize: 1000 
    });
    
    const postedWaybills = allWaybills.data.filter(w => w.status === WaybillStatus.POSTED);
    
    if (postedWaybills.length === 0) {
        return vehicle;
    }

    postedWaybills.sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        const validToDiff = new Date(b.validTo).getTime() - new Date(a.validTo).getTime();
        if (validToDiff !== 0) return validToDiff;
        return b.number.localeCompare(a.number);
    });

    const latest = postedWaybills[0];

    if (latest.odometerEnd !== undefined && latest.fuelAtEnd !== undefined) {
        vehicle.mileage = latest.odometerEnd;
        vehicle.currentFuel = latest.fuelAtEnd;
        
        await vehicleRepo.update(vehicleId, vehicle);
    }
    
    return vehicle;
};

// --- Tire Mileage Update Logic (Single) ---
const updateTireMileage = async (waybill: Waybill, isRevert: boolean = false) => {
    if (!waybill.vehicleId) return;
    
    const allTires = await tireRepo.list({ pageSize: 1000 });
    let mountedTires = allTires.data.filter(t => 
        t.status === 'Mounted' && 
        t.currentVehicleId === waybill.vehicleId
    );
    
    if (mountedTires.length === 0) return;

    const distance = (waybill.odometerEnd ?? waybill.odometerStart) - waybill.odometerStart;
    if (distance <= 0) return;

    const seasonSettings = await getSeasonSettings();
    const appSettings = await getAppSettings();
    
    const isWinter = isWinterDate(waybill.date, seasonSettings);
    const method = appSettings?.tireDepreciationMethod || 'usage';

    if (method === 'seasonal') {
        mountedTires = mountedTires.filter(t => {
            if (t.season === 'AllSeason') return true;
            if (isWinter && t.season === 'Winter') return true;
            if (!isWinter && t.season === 'Summer') return true;
            return false;
        });
    }
    
    const modifier = isRevert ? -1 : 1;
    const tireUpdates: Tire[] = [];
    for (const tire of mountedTires) {
        if (isWinter) {
            tire.winterMileage = (tire.winterMileage || 0) + (distance * modifier);
        } else {
            tire.summerMileage = (tire.summerMileage || 0) + (distance * modifier);
        }
        if ((tire.winterMileage || 0) < 0) tire.winterMileage = 0;
        if ((tire.summerMileage || 0) < 0) tire.summerMileage = 0;
        
        tireUpdates.push(tire);
    }
    
    if (tireUpdates.length > 0) {
        await tireRepo.updateBulk(tireUpdates);
    }
};

export const updateWaybill = async (item: Waybill) => {
    const oldWb = await waybillRepo.getById(item.id);
    if (!oldWb) throw new Error('Путевой лист не найден.');

    // 1. ЗАЩИТА: Проверка СТАРОЙ даты
    if (await checkPeriodLock(oldWb.date)) {
        throw new Error(`Период ${oldWb.date} закрыт. Редактирование невозможно.`);
    }

    // 2. ЗАЩИТА: Проверка НОВОЙ даты (если изменилась)
    if (item.date !== oldWb.date) {
        if (await checkPeriodLock(item.date)) {
            throw new Error(`Период ${item.date} закрыт. Перенос документа невозможен.`);
        }
    }

    const updatedWb = await waybillRepo.update(item.id, item);
    if (updatedWb.status === WaybillStatus.POSTED) {
        await recalculateVehicleStats(updatedWb.vehicleId);
    }
    await recalculateWaybillChain(updatedWb);
    return updatedWb;
};

export const deleteWaybill = async (id: string, markAsSpoiled: boolean) => {
    const wb = await waybillRepo.getById(id);
    if (wb) {
        // 1. ЗАЩИТА: Проверка даты
        if (await checkPeriodLock(wb.date)) {
            throw new Error(`Период ${wb.date} закрыт. Удаление невозможно.`);
        }

        if (wb.blankId) {
            if (markAsSpoiled) {
                await markBlankAsSpoiled(wb.blankId, `Удаление черновика ПЛ №${wb.number}`);
            } else {
                await releaseBlank(wb.blankId); 
            }
        }
        if (wb.status === WaybillStatus.POSTED) {
             await updateTireMileage(wb, true); 
        }
        await waybillRepo.remove(id);
        await auditBusiness('waybill.cancelled', { waybillId: id });
        if (wb.status === WaybillStatus.POSTED) {
            await recalculateVehicleStats(wb.vehicleId);
        }
    }
};

export const getLatestWaybill = async () => {
    const res = await waybillRepo.list({ pageSize: 1, sortBy: 'date', sortDir: 'desc' });
    return res.data[0] || null;
};

export const getLastWaybillForVehicle = async (vehicleId: string) => {
    const res = await waybillRepo.list({ 
        filters: { vehicleId }, 
        pageSize: 100, 
        sortBy: 'date', 
        sortDir: 'desc' 
    });
    
    const lastPosted = res.data.find(w => w.status === WaybillStatus.POSTED);
    return lastPosted || null;
};

export const getMedicalExamsCount = (w: Waybill): number => {
    const uniqueDates = new Set<string>();
    if (w.routes && w.routes.length > 0) {
        w.routes.forEach(r => {
            const d = r.date ? r.date.split('T')[0] : w.date.split('T')[0];
            if (d) uniqueDates.add(d);
        });
    } else {
        uniqueDates.add(w.date.split('T')[0]);
    }
    return uniqueDates.size;
};

// --- SINGLE ITEM CHANGE STATUS (WRAPPER) ---
export const changeWaybillStatus = async (id: string, status: WaybillStatus, context?: any) => {
    return changeWaybillStatusBulk([id], status, context).then(res => {
        // Return single object to match old signature expectation if possible
        const wb = res.success ? (res as any).updatedWaybills[0] : null;
        if (!wb) throw new Error(res.errors[0] || 'Unknown error');
        return { data: wb };
    });
};

// --- BULK CHANGE STATUS (OPTIMIZED) ---
export const changeWaybillStatusBulk = async (ids: string[], status: WaybillStatus, context?: any) => {
    if (ids.length === 0) return { success: true, updatedWaybills: [], errors: [] };

    // 1. Fetch ALL Data needed
    // Use list with large page size to fetch everything. Filtering happens in memory for speed.
    const [allWaybills, allEmployees, allBlanks, allTires, allVehicles, seasonSettings, appSettings] = await Promise.all([
        waybillRepo.list({ pageSize: 100000 }).then(r => r.data),
        employeeRepo.list({ pageSize: 100000 }).then(r => r.data),
        blankRepo.list({ pageSize: 100000 }).then(r => r.data),
        tireRepo.list({ pageSize: 100000 }).then(r => r.data),
        vehicleRepo.list({ pageSize: 10000 }).then(r => r.data),
        getSeasonSettings(),
        getAppSettings()
    ]);

    const waybillsMap = new Map(allWaybills.map(w => [w.id, w]));
    const employeesMap = new Map(allEmployees.map(e => [e.id, e]));
    const blanksMap = new Map(allBlanks.map(b => [b.id, b]));
    const vehiclesMap = new Map(allVehicles.map(v => [v.id, v]));
    
    // Arrays to hold bulk updates
    const updatesWaybills: Waybill[] = [];
    const updatesEmployees: Employee[] = []; // for fuel balance
    const updatesBlanks: WaybillBlank[] = [];
    const updatesTires: Tire[] = [];
    
    // Sets to track which vehicles need stats recalc or chain recalc
    const vehiclesToRecalcStats = new Set<string>();
    const vehiclesToRecalcChain = new Map<string, string>(); // vehicleId -> minDate

    // Errors
    const errors: string[] = [];

    // Helper map to aggregate employee balance changes during loop
    const employeeBalanceDeltas = new Map<string, number>();

    // 2. Logic Loop
    for (const id of ids) {
        const wb = waybillsMap.get(id);
        if (!wb) {
            errors.push(`Waybill ${id} not found`);
            continue;
        }

        // ЗАЩИТА: Проверка периода
        if (await checkPeriodLock(wb.date)) {
            errors.push(`ПЛ №${wb.number}: Период закрыт (${wb.date}). Операция отклонена.`);
            continue;
        }

        if (wb.status === status) continue;

        // Clone to modify
        const nextWb = { ...wb };
        const prevStatus = wb.status;

        // LOGIC: POSTING
        if (status === WaybillStatus.POSTED && prevStatus !== WaybillStatus.POSTED) {
            // Blanks
            if (nextWb.blankId) {
                const blank = blanksMap.get(nextWb.blankId);
                if (blank) {
                    blank.status = 'used';
                    blank.usedInWaybillId = nextWb.id;
                    updatesBlanks.push(blank);
                }
            }
            // Fuel Card
            if (nextWb.fuelFilled && nextWb.fuelFilled > 0 && nextWb.driverId) {
                const currentDelta = employeeBalanceDeltas.get(nextWb.driverId) || 0;
                employeeBalanceDeltas.set(nextWb.driverId, currentDelta - nextWb.fuelFilled);
            }
            // Status
            nextWb.postedAt = new Date().toISOString();
            nextWb.postedBy = context?.userId;
            nextWb.status = status;
            
            // Track vehicle
            if (nextWb.vehicleId) vehiclesToRecalcStats.add(nextWb.vehicleId);

            // Tires
            if (nextWb.vehicleId) {
                const distance = (nextWb.odometerEnd ?? nextWb.odometerStart) - nextWb.odometerStart;
                if (distance > 0) {
                    const isWinter = isWinterDate(nextWb.date, seasonSettings);
                    const method = appSettings?.tireDepreciationMethod || 'usage';
                    
                    const mountedTires = allTires.filter(t => t.status === 'Mounted' && t.currentVehicleId === nextWb.vehicleId);
                    
                    for (const tire of mountedTires) {
                        let shouldUpdate = true;
                        if (method === 'seasonal') {
                            if (isWinter && tire.season === 'Summer') shouldUpdate = false;
                            if (!isWinter && tire.season === 'Winter') shouldUpdate = false;
                        }
                        if (shouldUpdate) {
                            if (isWinter) tire.winterMileage = (tire.winterMileage || 0) + distance;
                            else tire.summerMileage = (tire.summerMileage || 0) + distance;
                            
                            // Check if tire already in update list, replace if so (simple linear search ok for small batch)
                            const idx = updatesTires.findIndex(t => t.id === tire.id);
                            if (idx >= 0) updatesTires[idx] = tire;
                            else updatesTires.push(tire);
                        }
                    }
                }
            }
        }
        // LOGIC: REVERT TO DRAFT
        else if (prevStatus === WaybillStatus.POSTED && status === WaybillStatus.DRAFT) {
            // Blanks
            if (nextWb.blankId) {
                const blank = blanksMap.get(nextWb.blankId);
                if (blank) {
                    blank.status = 'issued';
                    blank.usedInWaybillId = null;
                    blank.reservedByWaybillId = null;
                    updatesBlanks.push(blank);
                }
            }
            // Fuel Card (Refund)
            if (nextWb.fuelFilled && nextWb.fuelFilled > 0 && nextWb.driverId) {
                const currentDelta = employeeBalanceDeltas.get(nextWb.driverId) || 0;
                employeeBalanceDeltas.set(nextWb.driverId, currentDelta + nextWb.fuelFilled);
            }
            // Tires (Revert)
            if (nextWb.vehicleId) {
                const distance = (nextWb.odometerEnd ?? nextWb.odometerStart) - nextWb.odometerStart;
                if (distance > 0) {
                    const isWinter = isWinterDate(nextWb.date, seasonSettings);
                    const method = appSettings?.tireDepreciationMethod || 'usage';
                    const mountedTires = allTires.filter(t => t.status === 'Mounted' && t.currentVehicleId === nextWb.vehicleId);
                    
                    for (const tire of mountedTires) {
                        let shouldUpdate = true;
                        if (method === 'seasonal') {
                            if (isWinter && tire.season === 'Summer') shouldUpdate = false;
                            if (!isWinter && tire.season === 'Winter') shouldUpdate = false;
                        }
                        if (shouldUpdate) {
                            if (isWinter) tire.winterMileage = Math.max(0, (tire.winterMileage || 0) - distance);
                            else tire.summerMileage = Math.max(0, (tire.summerMileage || 0) - distance);
                            
                            const idx = updatesTires.findIndex(t => t.id === tire.id);
                            if (idx >= 0) updatesTires[idx] = tire;
                            else updatesTires.push(tire);
                        }
                    }
                }
            }
            // Status
            nextWb.status = status;
            if (context?.reason) {
                nextWb.notes = (nextWb.notes || '') + `\nCorrection: ${context.reason}`;
            }

            // Track for Stats and Chain Recalc
            if (nextWb.vehicleId) {
                vehiclesToRecalcStats.add(nextWb.vehicleId);
                const currentMin = vehiclesToRecalcChain.get(nextWb.vehicleId);
                if (!currentMin || nextWb.date < currentMin) {
                    vehiclesToRecalcChain.set(nextWb.vehicleId, nextWb.date);
                }
            }
        }
        // LOGIC: CANCEL (simplified for bulk)
        else if (status === WaybillStatus.CANCELLED) {
             if (nextWb.blankId) {
                const blank = blanksMap.get(nextWb.blankId);
                if (blank) {
                    blank.status = 'issued';
                    blank.usedInWaybillId = null;
                    blank.reservedByWaybillId = null; // Assuming released back to driver
                    updatesBlanks.push(blank);
                }
            }
            nextWb.status = status;
        } else {
            // Other transitions (Draft <-> Submitted)
            nextWb.status = status;
        }

        updatesWaybills.push(nextWb);
    }

    // 3. Prepare Employee Updates
    for (const [empId, delta] of employeeBalanceDeltas.entries()) {
        const emp = employeesMap.get(empId);
        if (emp && Math.abs(delta) > 0.001) {
            emp.fuelCardBalance = (emp.fuelCardBalance || 0) + delta;
            updatesEmployees.push(emp);
        }
    }

    // 4. Batch Writes
    // We execute these in parallel. This is safer than sequential loops.
    // If one fails, we might have inconsistency, but localforage is generally reliable for bulk ops.
    await Promise.all([
        updatesWaybills.length > 0 ? waybillRepo.updateBulk(updatesWaybills) : Promise.resolve(),
        updatesEmployees.length > 0 ? employeeRepo.updateBulk(updatesEmployees) : Promise.resolve(),
        updatesBlanks.length > 0 ? blankRepo.updateBulk(updatesBlanks) : Promise.resolve(),
        updatesTires.length > 0 ? tireRepo.updateBulk(updatesTires) : Promise.resolve(),
    ]);

    // 5. Post-Processing (Recalcs)
    
    // Vehicle Stats (Last Posted state)
    for (const vehicleId of vehiclesToRecalcStats) {
        await recalculateVehicleStats(vehicleId);
    }

    // Waybill Chain (Drafts)
    for (const [vehicleId, minDate] of vehiclesToRecalcChain.entries()) {
        await recalculateDraftsChain(vehicleId, minDate);
    }

    // 6. Audit (simplified bulk entry or individual?)
    // For bulk, creating one event per item might spam the log. 
    // Let's create a summary audit or individual if count is small.
    // Here we skip detailed individual audit for speed in this implementation, 
    // or we could add a bulk event type.
    if (updatesWaybills.length > 0) {
        // Just log the action type generically
        await auditBusiness(`waybill.${status.toLowerCase()}.bulk` as any, { 
            count: updatesWaybills.length, 
            actorId: context?.userId,
            ids: updatesWaybills.map(w => w.id) 
        });
    }

    // Notify UI
    broadcast('waybills');
    broadcast('stock'); // If fuel cards changed
    broadcast('blanks');

    return { success: true, updatedWaybills: updatesWaybills, errors };
};

export const validateBatchCorrection = async (waybillIds: string[]) => {
    // 1. Fetch full objects
    const allWaybills = (await waybillRepo.list({ pageSize: 10000 })).data;
    const selectedWaybills = allWaybills.filter(w => waybillIds.includes(w.id));
    
    // 2. Group by Vehicle
    const vehicleGroups = new Map<string, Waybill[]>();
    selectedWaybills.forEach(w => {
        if (!vehicleGroups.has(w.vehicleId)) {
            vehicleGroups.set(w.vehicleId, []);
        }
        vehicleGroups.get(w.vehicleId)!.push(w);
    });

    // 3. Validate each group
    for (const [vehicleId, selectedForVeh] of vehicleGroups) {
        // Get all POSTED waybills for this vehicle, sorted DESC by date (newest first)
        const allPostedForVeh = allWaybills
            .filter(w => w.vehicleId === vehicleId && w.status === WaybillStatus.POSTED)
            .sort((a, b) => {
                const timeA = new Date(a.date).getTime();
                const timeB = new Date(b.date).getTime();
                if (timeA !== timeB) return timeB - timeA; // Descending
                return b.number.localeCompare(a.number); // Descending
            });

        // The selected items MUST match the beginning of the `allPostedForVeh` list exactly.
        // We sort selectedForVeh desc as well to match the order.
        const selectedSorted = selectedForVeh.sort((a, b) => {
            const timeA = new Date(a.date).getTime();
            const timeB = new Date(b.date).getTime();
            if (timeA !== timeB) return timeB - timeA;
            return b.number.localeCompare(a.number);
        });

        for (let i = 0; i < selectedSorted.length; i++) {
            if (!allPostedForVeh[i]) {
                 return { valid: false, error: 'Ошибка данных: выбранный ПЛ не найден в списке проведенных.' };
            }
            if (selectedSorted[i].id !== allPostedForVeh[i].id) {
                const vehicle = await vehicleRepo.getById(vehicleId);
                const plate = vehicle ? vehicle.plateNumber : 'Unknown';
                return { 
                    valid: false, 
                    error: `Нарушена последовательность для ТС ${plate}. Вы должны корректировать (отменять проведение) строго от последнего ПЛ к более ранним без пропусков. Пропущен ПЛ №${allPostedForVeh[i].number} от ${allPostedForVeh[i].date}.` 
                };
            }
        }
    }

    return { valid: true };
};

export const getNextWaybillNumber = async () => {
    // This function is now deprecated in favor of sequenceService but kept for compatibility
    return "000001";
};
