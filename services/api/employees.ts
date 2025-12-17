
import { Employee, StockTransaction, Waybill, BalanceSnapshot } from '../../types';
import { createRepo } from '../repo';
import { DB_KEYS } from '../dbKeys';
import { auditBusiness } from '../auditBusiness';
import { addBalanceCorrection } from './inventory';
import { generateNextNumber } from '../sequenceService';

const employeeRepo = createRepo<Employee>(DB_KEYS.EMPLOYEES);
const snapshotRepo = createRepo<BalanceSnapshot>(DB_KEYS.BALANCE_SNAPSHOTS);

export const getEmployees = async () => (await employeeRepo.list({ pageSize: 1000 })).data;

export const addEmployee = async (item: Omit<Employee, 'id'>) => {
    if (!item.personnelNumber || item.personnelNumber.trim() === '') {
        item.personnelNumber = await generateNextNumber('employee');
    }
    return employeeRepo.create(item);
};

export const updateEmployee = (item: Employee) => employeeRepo.update(item.id, item);
export const deleteEmployee = (id: string) => employeeRepo.remove(id);

export const adjustFuelCardBalance = async (employeeId: string, amountDelta: number) => {
    const emp = await employeeRepo.getById(employeeId);
    if (emp) {
        emp.fuelCardBalance = (emp.fuelCardBalance || 0) + amountDelta;
        await employeeRepo.update(emp.id, emp);
    }
};

export const resetFuelCardBalance = async (employeeId: string, context: any) => {
    // 1. Calculate REAL dynamic balance
    const currentBalance = await calculateDriverBalance(employeeId, new Date().toISOString());
    
    // 2. Create correction transaction if needed (to zero out history)
    if (Math.abs(currentBalance) > 0.001) {
        // Calculate delta needed to reach 0
        const delta = -currentBalance;
        
        const emp = await employeeRepo.getById(employeeId);
        // Note: We use the org ID for the record, even if emp not found (unlikely)
        const orgId = emp?.organizationId || 'unknown';

        // This creates a history record so dynamic calculation will result in 0
        await addBalanceCorrection(
            employeeId, 
            delta, 
            orgId,
            `Сброс баланса администратором (было: ${currentBalance})`
        );
    }

    // 3. FORCE static field to 0. 
    // This handles cases where static field drifted from dynamic calculation.
    // We re-fetch to ensure we don't overwrite changes made by addBalanceCorrection logic
    const empToUpdate = await employeeRepo.getById(employeeId);
    if (empToUpdate && empToUpdate.fuelCardBalance !== 0) {
        empToUpdate.fuelCardBalance = 0;
        await employeeRepo.update(empToUpdate.id, empToUpdate);
    }
    
    // 4. Audit
    await auditBusiness('employee.fuelReset', { 
        employeeId, 
        oldBalance: currentBalance, 
        actorId: context?.userId 
    });
};

/**
 * Calculates the fuel card balance for a driver at a specific point in time.
 * Logic: Snapshot + Sum(TopUps + Adjustments > snapshot) - Sum(WaybillUsage > snapshot)
 */
export const calculateDriverBalance = async (driverId: string, dateStr: string): Promise<number> => {
    const targetDate = new Date(dateStr);
    // Ensure we ignore time component for comparison if strict day string is passed
    const targetISODate = targetDate.toISOString().split('T')[0];
    const isDayOnly = dateStr.length === 10; 

    // 1. Get closest snapshot
    const snapshots = await snapshotRepo.list({ filters: { driverId }, pageSize: 1000 });
    let bestSnapshot: BalanceSnapshot | null = null;

    if (snapshots.data.length > 0) {
        // Find latest snapshot BEFORE or ON target date
        const validSnapshots = snapshots.data.filter(s => s.date <= targetISODate);
        validSnapshots.sort((a, b) => b.date.localeCompare(a.date)); // Descending
        if (validSnapshots.length > 0) {
            bestSnapshot = validSnapshots[0];
        }
    }

    let startBalance = 0;
    let cutoffDate = '1970-01-01';

    if (bestSnapshot) {
        startBalance = bestSnapshot.balance;
        cutoffDate = bestSnapshot.date;
    }

    // 2. Load transactions AFTER snapshot
    const txRepo = createRepo<StockTransaction>(DB_KEYS.STOCK_TRANSACTIONS);
    const wbRepo = createRepo<Waybill>(DB_KEYS.WAYBILLS);

    // Filter only what we need. 
    // Note: repo.list logic for 'filters' is usually simple equality. 
    // We load more and filter in memory for ranges.
    const [txResult, wbResult] = await Promise.all([
        txRepo.list({ filters: { driverId, type: 'expense' }, pageSize: 10000 }), 
        wbRepo.list({ filters: { driverId, status: 'Posted' }, pageSize: 10000 })
    ]);

    const isAfterCutoff = (itemDateStr: string) => {
        // Strict string comparison for dates YYYY-MM-DD
        const itemDay = itemDateStr.slice(0, 10);
        return itemDay > cutoffDate;
    };

    const isBeforeOrSameTarget = (itemDateStr: string) => {
        if (isDayOnly) {
            return itemDateStr.slice(0, 10) <= dateStr;
        }
        return new Date(itemDateStr).getTime() <= targetDate.getTime();
    };

    let totalIncome = 0;
    for (const tx of txResult.data) {
        // Check if tx is relevant (fuel card related)
        if (tx.expenseReason === 'fuelCardTopUp' || tx.expenseReason === 'inventoryAdjustment') {
            // Check Date Range: (Snapshot < Tx <= Target)
            if (isAfterCutoff(tx.date) && isBeforeOrSameTarget(tx.date)) {
                const sumQty = tx.items.reduce((acc, item) => acc + item.quantity, 0);
                totalIncome += sumQty;
            }
        }
    }

    let totalSpent = 0;
    for (const wb of wbResult.data) {
        // Check Date Range: (Snapshot < Waybill <= Target)
        if (isAfterCutoff(wb.date) && isBeforeOrSameTarget(wb.date)) {
            totalSpent += (wb.fuelFilled || 0);
        }
    }

    return startBalance + totalIncome - totalSpent;
};