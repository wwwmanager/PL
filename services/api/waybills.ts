
import { Waybill, WaybillStatus, Vehicle, Tire } from '../../types';
import { createRepo, ListQuery } from '../repo';
import { DB_KEYS } from '../dbKeys';
import { auditBusiness } from '../auditBusiness';
import { useBlankForWaybill, releaseBlank, markBlankAsSpoiled } from './blanks';
import { adjustFuelCardBalance } from './employees';
import { getSeasonSettings, getAppSettings, isWinterDate } from './settings';
import { calculateStats } from '../../utils/waybillCalculations';
import { broadcast } from '../bus';

const waybillRepo = createRepo<Waybill>(DB_KEYS.WAYBILLS);
// Needed to update vehicle stats upon posting waybill
const vehicleRepo = createRepo<Vehicle>(DB_KEYS.VEHICLES);
const tireRepo = createRepo<Tire>(DB_KEYS.TIRES);

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
            
            // Нормализация даты ПЛ до YYYY-MM-DD для корректного сравнения
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
    // 1. Get ALL waybills for this vehicle to ensure we have the full context
    const allResult = await waybillRepo.list({ 
        filters: { vehicleId: modifiedWaybill.vehicleId },
        pageSize: 10000 
    });
    
    // 2. Robust Sort: ValidFrom ASC, then Number ASC (to handle same-time batch generated docs)
    const sortedChain = allResult.data.sort((a, b) => {
        const timeA = new Date(a.validFrom).getTime();
        const timeB = new Date(b.validFrom).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return a.number.localeCompare(b.number);
    });

    // 3. Find the index of the currently modified waybill
    const currentIndex = sortedChain.findIndex(w => w.id === modifiedWaybill.id);
    // If not found (e.g. newly created and not yet in list, though unlikely with repo flow), or it's the last one
    if (currentIndex === -1 || currentIndex === sortedChain.length - 1) return;

    // 4. Prepare dependencies ONCE
    const vehicle = await vehicleRepo.getById(modifiedWaybill.vehicleId);
    if (!vehicle) return;
    const seasonSettings = await getSeasonSettings();

    // 5. Iterate starting from the NEXT waybill
    let previousWaybill = modifiedWaybill; // Start with the user-modified state

    for (let i = currentIndex + 1; i < sortedChain.length; i++) {
        const current = sortedChain[i];

        // Break chain if we hit a non-draft (frozen history)
        if (current.status !== WaybillStatus.DRAFT) {
            break;
        }

        // --- LINKING LOGIC ---
        // Carry over End values from previous to Start values of current
        current.odometerStart = previousWaybill.odometerEnd ?? previousWaybill.odometerStart;
        current.fuelAtStart = previousWaybill.fuelAtEnd ?? 0;

        // --- RECALCULATION LOGIC ---
        // Recalculate this draft's consumption based on its own routes and new start values
        const dayMode = current.date === current.validTo.split('T')[0] ? 'single' : 'multi';
        
        const stats = calculateStats(
            current.routes,
            vehicle,
            seasonSettings,
            current.date,
            dayMode
        );

        // Apply calculated values
        current.odometerEnd = current.odometerStart + stats.distance;
        current.fuelPlanned = stats.consumption;
        
        // Recalculate fuel at end: Start + Filled - Consumption
        const fuelFilled = current.fuelFilled || 0;
        current.fuelAtEnd = Math.round(((current.fuelAtStart + fuelFilled) - stats.consumption) * 100) / 100;

        // Persist update
        await waybillRepo.update(current.id, current);

        // Update pointer for next iteration
        previousWaybill = current;
    }

    // 6. Notify UI to refresh the list (numbers changed in background)
    broadcast('waybills');
};

export const addWaybill = async (item: Omit<Waybill, 'id'>) => {
    const wb = await waybillRepo.create(item);
    await auditBusiness('waybill.created', { waybillId: wb.id });
    
    // Attempt chain recalculation (e.g. if inserted back in time)
    await recalculateWaybillChain(wb);
    
    return wb;
};

// Helper function (now exported) to sync vehicle state with the latest POSTED waybill
export const recalculateVehicleStats = async (vehicleId: string) => {
    const vehicle = await vehicleRepo.getById(vehicleId);
    if (!vehicle) return null;

    // Find the chronologically latest POSTED waybill for this vehicle
    const allWaybills = await waybillRepo.list({ 
        filters: { vehicleId }, 
        pageSize: 1000 
    });
    
    const postedWaybills = allWaybills.data.filter(w => w.status === WaybillStatus.POSTED);
    
    if (postedWaybills.length === 0) {
        // No posted waybills, return current vehicle state as is
        return vehicle;
    }

    // Sort descending to get the latest
    postedWaybills.sort((a, b) => {
        // 1. By Date
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        // 2. By ValidTo (end time of the waybill)
        const validToDiff = new Date(b.validTo).getTime() - new Date(a.validTo).getTime();
        if (validToDiff !== 0) return validToDiff;
        // 3. Fallback to Number (assuming sequential numbering)
        return b.number.localeCompare(a.number);
    });

    const latest = postedWaybills[0];

    // Only update if we have valid end values
    if (latest.odometerEnd !== undefined && latest.fuelAtEnd !== undefined) {
        vehicle.mileage = latest.odometerEnd;
        vehicle.currentFuel = latest.fuelAtEnd;
        
        await vehicleRepo.update(vehicleId, vehicle);
    }
    
    return vehicle;
};

// --- Tire Mileage Update Logic ---
const updateTireMileage = async (waybill: Waybill, isRevert: boolean = false) => {
    if (!waybill.vehicleId) return;
    
    // 1. Get all mounted tires for this vehicle
    const allTires = await tireRepo.list({ pageSize: 1000 });
    let mountedTires = allTires.data.filter(t => 
        t.status === 'Mounted' && 
        t.currentVehicleId === waybill.vehicleId
    );
    
    if (mountedTires.length === 0) return;

    // 2. Calculate distance
    const distance = (waybill.odometerEnd ?? waybill.odometerStart) - waybill.odometerStart;
    if (distance <= 0) return;

    // 3. Determine season & method
    const seasonSettings = await getSeasonSettings();
    const appSettings = await getAppSettings();
    
    const isWinter = isWinterDate(waybill.date, seasonSettings);
    const method = appSettings?.tireDepreciationMethod || 'usage';

    // 4. Filter tires based on method
    if (method === 'seasonal') {
        mountedTires = mountedTires.filter(t => {
            if (t.season === 'AllSeason') return true;
            if (isWinter && t.season === 'Winter') return true;
            if (!isWinter && t.season === 'Summer') return true;
            return false;
        });
    }
    
    // 5. Update each tire
    const modifier = isRevert ? -1 : 1;
    
    for (const tire of mountedTires) {
        if (isWinter) {
            tire.winterMileage = (tire.winterMileage || 0) + (distance * modifier);
        } else {
            tire.summerMileage = (tire.summerMileage || 0) + (distance * modifier);
        }
        // Ensure non-negative
        if ((tire.winterMileage || 0) < 0) tire.winterMileage = 0;
        if ((tire.summerMileage || 0) < 0) tire.summerMileage = 0;
        
        await tireRepo.update(tire.id, tire);
    }
};

export const updateWaybill = async (item: Waybill) => {
    const updatedWb = await waybillRepo.update(item.id, item);
    
    // If we edit a POSTED waybill, we must ensure vehicle stats stay consistent
    if (updatedWb.status === WaybillStatus.POSTED) {
        await recalculateVehicleStats(updatedWb.vehicleId);
        // Note: For tire mileage, editing a posted waybill is tricky. 
        // Ideally, we should revert old mileage and apply new. 
        // For simplicity in this mock, we assume 'changeWaybillStatus' handles transitions, 
        // and direct edits to POSTED docs don't automatically adjust tire mileage unless status toggles.
    }

    // Trigger chain recalculation for subsequent drafts
    await recalculateWaybillChain(updatedWb);
    
    return updatedWb;
};

export const deleteWaybill = async (id: string, markAsSpoiled: boolean) => {
    const wb = await waybillRepo.getById(id);
    if (wb) {
        if (wb.blankId) {
            if (markAsSpoiled) {
                await markBlankAsSpoiled(wb.blankId, `Удаление черновика ПЛ №${wb.number}`);
            } else {
                await releaseBlank(wb.blankId); 
            }
        }
        
        // If it was posted (rare for delete, but possible), revert tires
        if (wb.status === WaybillStatus.POSTED) {
             await updateTireMileage(wb, true); // Revert
        }

        await waybillRepo.remove(id);
        await auditBusiness('waybill.cancelled', { waybillId: id });

        // If we delete a POSTED waybill (though usually UI restricts this), 
        // we must revert vehicle stats to the previous one
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
    // FIX: We must only consider POSTED waybills for continuity.
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

export const changeWaybillStatus = async (id: string, status: WaybillStatus, context?: any) => {
    const wb = await waybillRepo.getById(id);
    if (!wb) throw new Error('Waybill not found');
    
    if (status === WaybillStatus.CANCELLED && wb.status === WaybillStatus.SUBMITTED && context?.appMode === 'driver') {
         throw new Error('Недопустимый переход статуса: Submitted → Cancelled (режим driver)');
    }

    if (status === WaybillStatus.POSTED && wb.status !== WaybillStatus.POSTED) {
        if (wb.blankId) {
            await useBlankForWaybill(wb.blankId, wb.id);
        }
        if (wb.fuelFilled && wb.fuelFilled > 0 && wb.driverId) {
            await adjustFuelCardBalance(wb.driverId, -wb.fuelFilled);
        }
        
        wb.postedAt = new Date().toISOString();
        wb.postedBy = context?.userId;
        wb.status = status; // Update status first so repo query sees it as POSTED
        await waybillRepo.update(id, wb); // Save waybill state first

        // Sync vehicle state
        if (wb.vehicleId) {
            await recalculateVehicleStats(wb.vehicleId);
        }
        // Sync Tire Mileage
        await updateTireMileage(wb, false); // Add

    } else if (wb.status === WaybillStatus.POSTED && status === WaybillStatus.DRAFT) {
        if (wb.blankId) {
            await releaseBlank(wb.blankId);
        }
        if (wb.fuelFilled && wb.fuelFilled > 0 && wb.driverId) {
            await adjustFuelCardBalance(wb.driverId, wb.fuelFilled);
        }

        // Revert Tire Mileage BEFORE updating status (using current posted state)
        await updateTireMileage(wb, true); // Revert

        // We are un-posting. Update status first.
        wb.status = status;
        await waybillRepo.update(id, wb);

        // Now re-sync vehicle. Since this waybill is no longer POSTED, 
        // recalculateVehicleStats will find the *previous* latest waybill and revert stats to that.
        if (wb.vehicleId) {
            await recalculateVehicleStats(wb.vehicleId);
        }

    } else if (status === WaybillStatus.CANCELLED && wb.status !== WaybillStatus.CANCELLED) {
        if (wb.blankId) {
            await releaseBlank(wb.blankId);
        }
        wb.status = status;
        await waybillRepo.update(id, wb);
    } else {
        // Simple status change (e.g. Draft -> Submitted)
        wb.status = status;
        await waybillRepo.update(id, wb);
    }

    if (context?.reason) {
        // Need to fetch again or update existing object because we might have saved it above
        const currentWb = await waybillRepo.getById(id);
        if(currentWb) {
            currentWb.notes = (currentWb.notes || '') + `\nCorrection: ${context.reason}`;
            await waybillRepo.update(id, currentWb);
        }
    }
    
    await auditBusiness(`waybill.${status.toLowerCase()}` as any, { waybillId: id, ...context });
    
    // If we reverted to DRAFT, trigger recalculation for subsequent drafts
    if (status === WaybillStatus.DRAFT) {
        // Fetch fresh state to be safe
        const refreshedWb = await waybillRepo.getById(id);
        if (refreshedWb) await recalculateWaybillChain(refreshedWb);
    }

    // Return updated object
    return { data: await waybillRepo.getById(id) };
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
    return "000001";
};
