
import { createRepo } from './repo';
import { DB_KEYS } from './dbKeys';
import { GarageStockItem, StockTransaction, Employee, Waybill, Vehicle, WaybillStatus, BalanceSnapshot } from '../types';
import { calculateDriverBalance } from './api/employees';
import { generateId } from './api/core';

// Repositories
const stockItemRepo = createRepo<GarageStockItem>(DB_KEYS.GARAGE_STOCK_ITEMS);
const stockTxRepo = createRepo<StockTransaction>(DB_KEYS.STOCK_TRANSACTIONS);
const employeeRepo = createRepo<Employee>(DB_KEYS.EMPLOYEES);
const waybillRepo = createRepo<Waybill>(DB_KEYS.WAYBILLS);
const vehicleRepo = createRepo<Vehicle>(DB_KEYS.VEHICLES);
const snapshotRepo = createRepo<BalanceSnapshot>(DB_KEYS.BALANCE_SNAPSHOTS);

/**
 * Полный пересчет всех учетных данных системы.
 * Используется после импорта или для исправления расхождений.
 */
export const runFullRecalculation = async (
    onProgress?: (stage: string) => void
) => {
    try {
        // 1. Recalculate Warehouse Stock
        if (onProgress) onProgress('Пересчет склада...');
        await recalculateStockBalances();

        // 2. Recalculate Driver Fuel Balances
        if (onProgress) onProgress('Пересчет топливных карт...');
        await recalculateDriverBalances();

        // 3. Sync Vehicles with Waybills
        if (onProgress) onProgress('Синхронизация транспорта...');
        await recalculateVehicleStats();

        if (onProgress) onProgress('Готово');
        return { success: true };
    } catch (error) {
        console.error("Recalculation failed:", error);
        throw error;
    }
};

/**
 * Генерирует снимки балансов топливных карт на конец каждого месяца.
 * Позволяет ускорить расчет текущего баланса (calculateDriverBalance).
 */
export const generateBalanceSnapshots = async (
    onProgress?: (msg: string) => void
) => {
    try {
        if (onProgress) onProgress('Очистка старых снимков...');
        // 1. Clear existing snapshots
        const existing = await snapshotRepo.list({ pageSize: 10000 });
        if (existing.data.length > 0) {
            await snapshotRepo.removeBulk(existing.data.map(s => s.id));
        }

        // 2. Get all relevant dates (from TXs and Waybills)
        const [allTxs, allWbs] = await Promise.all([
            stockTxRepo.list({ pageSize: 50000 }),
            waybillRepo.list({ pageSize: 50000 })
        ]);

        const drivers = await employeeRepo.list({ pageSize: 10000 });
        const driverIds = drivers.data.filter(e => e.employeeType === 'driver').map(d => d.id);

        const dates = new Set<string>();
        allTxs.data.forEach(t => dates.add(t.date));
        allWbs.data.forEach(w => dates.add(w.date.split('T')[0]));
        
        const sortedDates = Array.from(dates).sort();
        if (sortedDates.length === 0) return { success: true };

        const minDate = new Date(sortedDates[0]);
        const maxDate = new Date(); // Up to now

        // 3. Determine Month Ends
        const monthEnds: string[] = [];
        const iter = new Date(minDate.getFullYear(), minDate.getMonth() + 1, 0); // End of start month
        
        while (iter < maxDate) {
            monthEnds.push(iter.toISOString().split('T')[0]);
            // Move to end of next month
            // Add 1 day to get 1st of next month, then add 1 month, then set to 0 day (end of that month)
            iter.setDate(iter.getDate() + 1); 
            iter.setMonth(iter.getMonth() + 1);
            iter.setDate(0); 
        }

        // 4. Calculate for each driver at each month end
        if (onProgress) onProgress(`Генерация снимков для ${driverIds.length} водителей...`);
        
        for (const driverId of driverIds) {
            let runningBalance = 0;
            let txIndex = 0;
            let wbIndex = 0;
            
            // Pre-filter and sort for this driver
            const driverTxs = allTxs.data
                .filter(t => t.driverId === driverId && (t.expenseReason === 'fuelCardTopUp' || t.expenseReason === 'inventoryAdjustment') && (!t.status || t.status === 'Posted'))
                .sort((a,b) => a.date.localeCompare(b.date));
                
            const driverWbs = allWbs.data
                .filter(w => w.driverId === driverId && w.status === WaybillStatus.POSTED)
                .sort((a,b) => a.date.localeCompare(b.date));

            const snapshots: BalanceSnapshot[] = [];

            for (const monthEndDate of monthEnds) {
                // Add Income up to this date
                while (txIndex < driverTxs.length && driverTxs[txIndex].date <= monthEndDate) {
                    const tx = driverTxs[txIndex];
                    const qty = tx.items.reduce((acc, item) => acc + item.quantity, 0);
                    runningBalance += qty;
                    txIndex++;
                }

                // Subtract Expenses up to this date
                while (wbIndex < driverWbs.length && driverWbs[wbIndex].date.split('T')[0] <= monthEndDate) {
                    const wb = driverWbs[wbIndex];
                    runningBalance -= (wb.fuelFilled || 0);
                    wbIndex++;
                }

                // Save Snapshot
                snapshots.push({
                    id: generateId(),
                    driverId,
                    date: monthEndDate,
                    balance: Math.round(runningBalance * 100) / 100,
                    createdAt: new Date().toISOString()
                });
            }
            
            if (snapshots.length > 0) {
                await snapshotRepo.updateBulk(snapshots as any);
            }
        }

        if (onProgress) onProgress('Готово');
        return { success: true };

    } catch (error) {
        console.error("Snapshot generation failed:", error);
        throw error;
    }
};

/**
 * Сбрасывает остатки на складе и пересчитывает их по истории транзакций.
 */
const recalculateStockBalances = async () => {
    // Parallel fetch
    const [itemsResult, txResult] = await Promise.all([
        stockItemRepo.list({ pageSize: 50000 }),
        stockTxRepo.list({ pageSize: 50000 })
    ]);

    const items = itemsResult.data;
    const transactions = txResult.data;

    // 1. Init Map
    const balanceMap = new Map<string, number>();
    items.forEach(item => balanceMap.set(item.id, 0));

    // 2. Sort Transactions
    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 3. Process
    for (const tx of transactions) {
        if (tx.status && tx.status !== 'Posted') continue;

        const isIncome = tx.type === 'income';

        for (const lineItem of tx.items) {
            const current = balanceMap.get(lineItem.stockItemId) || 0;
            const quantity = lineItem.quantity || 0;
            const newBalance = isIncome ? current + quantity : current - quantity;
            balanceMap.set(lineItem.stockItemId, newBalance);
        }
    }

    // 4. Collect Updates
    const updates: GarageStockItem[] = [];
    for (const item of items) {
        const calculated = balanceMap.get(item.id) ?? 0;
        if (Math.abs(item.balance - calculated) > 0.0001) {
            updates.push({ ...item, balance: calculated });
        }
    }

    // 5. Bulk Update
    if (updates.length > 0) {
        await stockItemRepo.updateBulk(updates);
    }
};

/**
 * Пересчитывает баланс топливных карт водителей.
 * Формула: Сумма(Пополнения) - Сумма(Заправки в проведенных ПЛ)
 */
const recalculateDriverBalances = async () => {
    const [employeesResult, txResult, wbResult] = await Promise.all([
        employeeRepo.list({ pageSize: 10000 }),
        stockTxRepo.list({ pageSize: 50000 }),
        waybillRepo.list({ pageSize: 50000 })
    ]);

    const drivers = employeesResult.data.filter(e => e.employeeType === 'driver');
    const balanceMap = new Map<string, number>();

    drivers.forEach(d => balanceMap.set(d.id, 0));

    // 1. Income (TopUps)
    for (const tx of txResult.data) {
        if ((!tx.status || tx.status === 'Posted') && 
            (tx.expenseReason === 'fuelCardTopUp' || tx.expenseReason === 'inventoryAdjustment') && 
            tx.driverId) {
            
            const current = balanceMap.get(tx.driverId) || 0;
            const qty = tx.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
            balanceMap.set(tx.driverId, current + qty);
        }
    }

    // 2. Expense (Waybills)
    for (const wb of wbResult.data) {
        if (wb.status === WaybillStatus.POSTED && wb.driverId && wb.fuelFilled) {
            const current = balanceMap.get(wb.driverId) || 0;
            balanceMap.set(wb.driverId, current - wb.fuelFilled);
        }
    }

    // 3. Updates
    const updates: Employee[] = [];
    for (const driver of drivers) {
        const calculated = balanceMap.get(driver.id) ?? 0;
        const currentStored = driver.fuelCardBalance || 0;
        
        if (Math.abs(currentStored - calculated) > 0.01) {
            updates.push({ ...driver, fuelCardBalance: calculated });
        }
    }

    if (updates.length > 0) {
        await employeeRepo.updateBulk(updates);
    }
};

/**
 * Helper to compare waybill dates
 */
const isLater = (a: Waybill, b: Waybill): boolean => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateA !== dateB) return dateA > dateB;
    
    const validToA = new Date(a.validTo).getTime();
    const validToB = new Date(b.validTo).getTime();
    return validToA > validToB;
};

/**
 * Обновляет пробег и топливо в ТС по последнему проведенному путевому листу.
 */
const recalculateVehicleStats = async () => {
    const [vehiclesResult, waybillsResult] = await Promise.all([
        vehicleRepo.list({ pageSize: 1000 }),
        waybillRepo.list({ pageSize: 50000 })
    ]);

    const vehicles = vehiclesResult.data;
    // Map: VehicleID -> Latest Waybill
    const latestWbMap = new Map<string, Waybill>();

    // 1. One pass to find latest for each vehicle
    for (const wb of waybillsResult.data) {
        if (wb.status !== WaybillStatus.POSTED) continue;
        if (!wb.vehicleId) continue;

        const existingBest = latestWbMap.get(wb.vehicleId);

        if (!existingBest || isLater(wb, existingBest)) {
            latestWbMap.set(wb.vehicleId, wb);
        }
    }

    // 2. Form updates
    const updates: Vehicle[] = [];
    for (const vehicle of vehicles) {
        const latest = latestWbMap.get(vehicle.id);
        
        if (!latest) continue;

        let isModified = false;
        const newVehicle = { ...vehicle };

        if (latest.odometerEnd !== undefined && vehicle.mileage !== latest.odometerEnd) {
            newVehicle.mileage = latest.odometerEnd;
            isModified = true;
        }

        if (latest.fuelAtEnd !== undefined && vehicle.currentFuel !== latest.fuelAtEnd) {
            newVehicle.currentFuel = latest.fuelAtEnd;
            isModified = true;
        }

        if (isModified) {
            updates.push(newVehicle);
        }
    }

    if (updates.length > 0) {
        await vehicleRepo.updateBulk(updates);
    }
};
