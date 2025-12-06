
import { Route, Vehicle, SeasonSettings } from '../types';

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
        const baseRate = isWinter ? winterRate : summerRate;
        
        let effectiveRate = baseRate;
        if (route.isCityDriving && vehicle.useCityModifier) {
            effectiveRate *= (1 + cityIncreasePercent / 100);
        }
        if (route.isWarming && vehicle.useWarmingModifier) {
            effectiveRate *= (1 + warmingIncreasePercent / 100);
        }
        
        totalConsumption += (route.distanceKm / 100) * effectiveRate;
    }
    
    return totalConsumption;
};

export const calculateStats = (
    routes: Route[],
    vehicle: Vehicle | undefined,
    seasonSettings: SeasonSettings | null,
    baseDate: string,
    dayMode: 'single' | 'multi' = 'multi'
) => {
    // Считаем точную сумму дистанций для корректного расчета нормы (без округления)
    const rawDistance = routes.reduce((sum, r) => sum + (Number(r.distanceKm) || 0), 0);
    // Для одометра используем округленное значение
    const distance = Math.round(rawDistance);
    
    let consumption = 0;
    let baseRate = 0;

    if (vehicle && seasonSettings) {
        consumption = calculateFuelConsumption(routes, vehicle, seasonSettings, baseDate, dayMode);
        // Determine base rate based on waybill date for display
        const isWinter = isWinterDate(baseDate, seasonSettings);
        baseRate = isWinter ? vehicle.fuelConsumptionRates.winterRate : vehicle.fuelConsumptionRates.summerRate;
    }

    return {
        distance,
        consumption: Math.round(consumption * 100) / 100,
        // Делим на точный пробег, чтобы получить математически верную норму (напр. 8.6, а не 8.61)
        // И используем сырой consumption (до округления)
        averageRate: rawDistance > 0 ? (consumption / rawDistance) * 100 : 0,
        baseRate
    };
};
