
import { Route, Vehicle, SeasonSettings, WaybillCalculationMethod } from '../types';
import { calculateNormConsumption } from '../domain/waybill';

// Helper function moved here to avoid circular dependency with services/mockApi
export const isWinterDate = (dateStr: string, settings: SeasonSettings | null) => {
    if (!settings) return false;
    const date = new Date(dateStr);
    if (settings.type === 'manual') {
        const start = new Date(settings.winterStartDate);
        const end = new Date(settings.winterEndDate);
        return date >= start && date <= end;
    } else {
        const m = date.getMonth() + 1;
        // Logic: if current month is >= winter start month OR < summer start month
        // Example: Winter starts Nov (11), Summer starts Apr (4).
        // Months 11, 12, 1, 2, 3 are winter.
        if (m >= settings.winterMonth || m < settings.summerMonth) return true;
        return false;
    }
};

export const calculateDistance = (routes: Route[]): number => {
    return Math.round(routes.reduce((sum, r) => sum + (Number(r.distanceKm) || 0), 0));
};

export const calculateFuelConsumption = (
    routes: Route[],
    vehicle: Vehicle,
    seasonSettings: SeasonSettings,
    baseDate: string,
    dayMode: 'single' | 'multi' = 'multi'
): number => {
    const { summerRate, winterRate, cityIncreasePercent = 0, warmingIncreasePercent = 0 } = vehicle.fuelConsumptionRates;
    let totalConsumption = 0;

    for (const route of routes) {
        if (!route.distanceKm || route.distanceKm === 0) continue;

        const routeDate = dayMode === 'multi' && route.date ? route.date : baseDate;
        const isWinter = isWinterDate(routeDate, seasonSettings);
        
        // Определяем базовую ставку для этого отрезка (Зима/Лето)
        const baseNormRate = isWinter ? winterRate : summerRate;
        
        // Собираем коэффициенты для Доменной функции
        // Важно: в БД хранятся проценты (10), доменная функция ждет доли (0.10)
        const coefficients = {
            city: (route.isCityDriving && vehicle.useCityModifier) ? (cityIncreasePercent / 100) : 0,
            warming: (route.isWarming && vehicle.useWarmingModifier) ? (warmingIncreasePercent / 100) : 0
        };
        
        // Используем чистую функцию из Domain Layer
        const segmentConsumption = calculateNormConsumption(route.distanceKm, baseNormRate, coefficients);
        
        totalConsumption += segmentConsumption;
    }
    
    return totalConsumption;
};

export const calculateStats = (
    routes: Route[],
    vehicle: Vehicle | undefined,
    seasonSettings: SeasonSettings | null,
    baseDate: string,
    dayMode: 'single' | 'multi' = 'multi',
    method: WaybillCalculationMethod = 'by_total'
) => {
    let rawDistance = routes.reduce((sum, r) => sum + (Number(r.distanceKm) || 0), 0);
    
    // Fallback if no vehicle/settings available (just sum distance)
    if (!vehicle || !seasonSettings) {
        return {
            distance: Math.round(rawDistance),
            consumption: 0,
            averageRate: 0,
            baseRate: 0
        };
    }

    // Determine base rate for display only
    const isWinter = isWinterDate(baseDate, seasonSettings);
    const baseRate = isWinter ? vehicle.fuelConsumptionRates.winterRate : vehicle.fuelConsumptionRates.summerRate;

    if (method === 'by_segment') {
        // Method 2: By Segments (Precise)
        // Calculate consumption for each segment with modifiers, then sum up.
        // Uses Domain Logic inside calculateFuelConsumption
        const rawConsumption = calculateFuelConsumption(routes, vehicle, seasonSettings, baseDate, dayMode);
        
        return {
            distance: Math.round(rawDistance),
            consumption: Math.round(rawConsumption * 100) / 100,
            // Effective average rate for display purposes
            averageRate: rawDistance > 0 ? (rawConsumption / rawDistance) * 100 : baseRate,
            baseRate
        };
    } else {
        // Method 1: By Total Distance (Simple)
        // 1. Round the total distance first (Simulates Odometer)
        const roundedDistance = Math.round(rawDistance);
        
        // 2. Calculate using ONLY the base rate (ignoring city/warming modifiers from segments)
        // Formula: (TotalKm / 100) * BaseRate
        
        // Use Domain Function here too for consistency, even if coeffs are empty
        const finalConsumption = calculateNormConsumption(roundedDistance, baseRate, {});

        return {
            distance: roundedDistance,
            consumption: finalConsumption,
            averageRate: baseRate, // The rate used is exactly the base rate
            baseRate
        };
    }
};
