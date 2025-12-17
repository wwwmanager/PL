
import { createRepo } from '../repo';
import { DB_KEYS } from '../dbKeys';
import { Waybill, WaybillStatus, Vehicle, Employee } from '../../types';
import { getIssues } from './vehicles';
import { getMedicalExamsCount } from './waybills';

// Создаем локальные инстансы репозиториев для чтения
const waybillRepo = createRepo<Waybill>(DB_KEYS.WAYBILLS);
const vehicleRepo = createRepo<Vehicle>(DB_KEYS.VEHICLES);
const employeeRepo = createRepo<Employee>(DB_KEYS.EMPLOYEES);

export const getDashboardData = async (filter: { vehicleId?: string; dateFrom?: string; dateTo?: string }) => {
    const allWaybills = (await waybillRepo.list({ pageSize: 10000 })).data;
    const allVehicles = (await vehicleRepo.list({ pageSize: 1000 })).data;
    const allEmployees = (await employeeRepo.list({ pageSize: 1000 })).data;

    // 0. Base Filter by Date ONLY (for comparative charts across fleet)
    const dateFilteredWaybills = allWaybills.filter(w => {
        if (w.status !== WaybillStatus.POSTED) return false;
        if (filter.dateFrom && w.date < filter.dateFrom) return false;
        if (filter.dateTo && w.date > filter.dateTo) return false;
        return true;
    });

    // 0.1 Filter specific waybills (for KPI and specific charts)
    const filteredWaybills = dateFilteredWaybills.filter(w => {
        if (filter.vehicleId && w.vehicleId !== filter.vehicleId) return false;
        return true;
    });

    // 1. Total Mileage (Removed logic in previous steps)

    // 2. Determine target vehicles and calculate Current Snapshot Logic
    const targetVehicles = filter.vehicleId 
        ? allVehicles.filter(v => v.id === filter.vehicleId) 
        : allVehicles.filter(v => v.status === 'Active');

    let currentOdometerSum = 0;
    let currentFuelSum = 0;

    for (const vehicle of targetVehicles) {
        const vehicleWaybills = allWaybills.filter(w => 
            w.vehicleId === vehicle.id && 
            w.status === WaybillStatus.POSTED
        );
        vehicleWaybills.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const lastWaybill = vehicleWaybills[0];

        if (filter.vehicleId) {
            if (lastWaybill) {
                currentOdometerSum = (lastWaybill.odometerEnd ?? lastWaybill.odometerStart);
            } else {
                currentOdometerSum = vehicle.mileage;
            }
        }

        if (lastWaybill) {
            currentFuelSum += (lastWaybill.fuelAtEnd ?? 0);
        } else {
            currentFuelSum += (vehicle.currentFuel ?? 0);
        }
    }

    // 2.1 Calculate Total Fuel Card Balance
    let totalFuelCardBalance = 0;
    if (filter.vehicleId) {
        const targetVehicle = allVehicles.find(v => v.id === filter.vehicleId);
        if (targetVehicle && targetVehicle.assignedDriverId) {
            const driver = allEmployees.find(e => e.id === targetVehicle.assignedDriverId);
            totalFuelCardBalance = driver?.fuelCardBalance || 0;
        }
    } else {
        totalFuelCardBalance = allEmployees
            .filter(e => e.employeeType === 'driver')
            .reduce((sum, e) => sum + (e.fuelCardBalance || 0), 0);
    }

    // 3. Issues
    const issuesData = await getIssues({ vehicleId: filter.vehicleId });
    const issuesCount = issuesData.expiringDocs.length;

    // 4. KPI Calculations
    const now = new Date();
    
    // Helper to get local date string YYYY-MM-DD
    const toLocalISO = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const currentMonthStart = toLocalISO(new Date(now.getFullYear(), now.getMonth(), 1));
    const currentQuarterStart = toLocalISO(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1));
    const currentYearStart = toLocalISO(new Date(now.getFullYear(), 0, 1));

    const calculateConsumption = (fromDate: string) => {
        return allWaybills
            .filter(w => w.status === WaybillStatus.POSTED && w.date >= fromDate)
            .filter(w => !filter.vehicleId || w.vehicleId === filter.vehicleId)
            .reduce((sum, w) => {
                const consumed = (w.fuelAtStart || 0) + (w.fuelFilled || 0) - (w.fuelAtEnd || 0);
                return sum + Math.max(0, consumed);
            }, 0);
    };

    const fuelMonth = calculateConsumption(currentMonthStart);
    const fuelQuarter = calculateConsumption(currentQuarterStart);
    const fuelYear = calculateConsumption(currentYearStart);

    // 5. Existing Charts Data (Filtered by Vehicle if selected)
    const fuelByMonthMap = new Map<string, number>();
    const examsByMonthMap = new Map<string, number>();

    filteredWaybills.sort((a, b) => a.date.localeCompare(b.date));

    for (const w of filteredWaybills) {
        const monthKey = w.date.substring(0, 7); 
        const consumed = (w.fuelAtStart || 0) + (w.fuelFilled || 0) - (w.fuelAtEnd || 0);
        
        fuelByMonthMap.set(monthKey, (fuelByMonthMap.get(monthKey) || 0) + Math.max(0, consumed));
        
        const examsCount = getMedicalExamsCount(w);
        examsByMonthMap.set(monthKey, (examsByMonthMap.get(monthKey) || 0) + examsCount);
    }

    const fuelConsumptionByMonth = Array.from(fuelByMonthMap.entries()).map(([month, val]) => ({
        month,
        fact: Math.round(val)
    }));

    const medicalExamsByMonth = Array.from(examsByMonthMap.entries()).map(([month, val]) => ({
        month,
        exams: val
    }));

    // 6. NEW Comparative Charts Data (Across ALL vehicles/drivers in date range)
    // 6.1 Fuel by Vehicle
    const fuelByVehicleMap = new Map<string, number>();
    for (const w of dateFilteredWaybills) {
        const consumed = (w.fuelAtStart || 0) + (w.fuelFilled || 0) - (w.fuelAtEnd || 0);
        fuelByVehicleMap.set(w.vehicleId, (fuelByVehicleMap.get(w.vehicleId) || 0) + Math.max(0, consumed));
    }
    
    const fuelByVehicle = Array.from(fuelByVehicleMap.entries())
        .map(([vehId, val]) => {
            const v = allVehicles.find(x => x.id === vehId);
            return {
                id: vehId, // Added ID
                name: v ? v.plateNumber : 'Неизвестно',
                value: Math.round(val)
            };
        })
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value);

    // 6.2 Exams by Driver
    const examsByDriverMap = new Map<string, number>();
    for (const w of dateFilteredWaybills) {
        const examsCount = getMedicalExamsCount(w);
        examsByDriverMap.set(w.driverId, (examsByDriverMap.get(w.driverId) || 0) + examsCount);
    }

    const examsByDriver = Array.from(examsByDriverMap.entries())
        .map(([driverId, val]) => {
            const d = allEmployees.find(x => x.id === driverId);
            return {
                name: d ? d.shortName : 'Неизвестно',
                value: val
            };
        })
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value);

    // --- NEW WIDGET DATA CALCULATIONS ---

    // 7. Status Counters
    // Drafts and Submitted are GLOBAL (not filtered by date), Posted/Cancelled are filtered by date
    const draftsCount = allWaybills.filter(w => w.status === WaybillStatus.DRAFT && (!filter.vehicleId || w.vehicleId === filter.vehicleId)).length;
    const submittedCount = allWaybills.filter(w => w.status === WaybillStatus.SUBMITTED && (!filter.vehicleId || w.vehicleId === filter.vehicleId)).length;
    // Posted count from filtered list (already applied date & vehicle filter)
    const postedCount = filteredWaybills.filter(w => w.status === WaybillStatus.POSTED).length;

    // 8. Top Overruns (Over consumption)
    // Group filtered (posted) waybills by driver, calculate economy/overrun sum
    const driverOverruns = new Map<string, number>();
    
    filteredWaybills.forEach(w => {
        const start = w.fuelAtStart || 0;
        const end = w.fuelAtEnd || 0;
        const filled = w.fuelFilled || 0;
        const planned = w.fuelPlanned || 0;
        // Logic: Consumption = Start + Filled - End.
        // Economy = Planned - Consumption.
        // Overrun is negative Economy.
        const consumption = start + filled - end;
        const diff = planned - consumption; // Positive = Economy, Negative = Overrun
        
        if (diff < 0) {
            driverOverruns.set(w.driverId, (driverOverruns.get(w.driverId) || 0) + diff);
        }
    });

    const topOverruns = Array.from(driverOverruns.entries())
        .map(([driverId, value]) => {
            const d = allEmployees.find(e => e.id === driverId);
            return {
                id: driverId,
                name: d ? d.shortName : 'Неизвестный',
                value: Math.round(value * 100) / 100 // Negative value
            };
        })
        .sort((a, b) => a.value - b.value) // Sort by most negative (biggest overrun)
        .slice(0, 5);

    // 9. Upcoming Maintenance
    const upcomingMaintenance = targetVehicles
        .map(v => {
            if (!v.maintenanceIntervalKm || v.lastMaintenanceMileage === undefined || v.lastMaintenanceMileage === null) return null;
            const nextService = v.lastMaintenanceMileage + v.maintenanceIntervalKm;
            const remaining = nextService - v.mileage;
            const totalInterval = v.maintenanceIntervalKm;
            
            // Calculate progress percentage (how much of the interval is used)
            // Used = Interval - Remaining. Percent = Used / Interval * 100
            const used = totalInterval - remaining;
            const progress = Math.min(100, Math.max(0, (used / totalInterval) * 100));

            return {
                id: v.id,
                plate: v.plateNumber,
                brand: v.brand,
                remaining,
                progress
            };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null && item.remaining < 2000) // Show if less than 2000km
        .sort((a, b) => a.remaining - b.remaining)
        .slice(0, 5);

    // 10. Birthdays (Current Month)
    const currentMonthIndex = now.getMonth(); // 0-11
    const birthdays = allEmployees
        .filter(e => e.status === 'Active' && e.dateOfBirth)
        .filter(e => {
            const dob = new Date(e.dateOfBirth!);
            return dob.getMonth() === currentMonthIndex;
        })
        .map(e => {
            const dob = new Date(e.dateOfBirth!);
            // Set year to current to sort by day correctly
            const birthdayThisYear = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
            return {
                id: e.id,
                name: e.shortName,
                date: dob.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }),
                dayOfMonth: dob.getDate(),
                isToday: dob.getDate() === now.getDate()
            };
        })
        .sort((a, b) => a.dayOfMonth - b.dayOfMonth);

    return {
        kpi: {
            totalMileage: currentOdometerSum,
            totalFuel: currentFuelSum,
            totalFuelCardBalance: totalFuelCardBalance,
            issues: issuesCount,
            fuelMonth: Math.round(fuelMonth),
            fuelQuarter: Math.round(fuelQuarter),
            fuelYear: Math.round(fuelYear)
        },
        statuses: {
            drafts: draftsCount,
            submitted: submittedCount,
            posted: postedCount,
            issues: issuesCount
        },
        topOverruns,
        upcomingMaintenance,
        birthdays,
        fuelConsumptionByMonth,
        medicalExamsByMonth,
        fuelByVehicle,
        examsByDriver
    };
};
