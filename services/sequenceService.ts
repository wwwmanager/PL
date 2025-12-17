
import { loadJSON, saveJSON } from './storage';
import { DB_KEYS } from './dbKeys';

type EntityType = 'waybill' | 'income' | 'expense' | 'fuelCard' | 'employee' | 'item' | 'vehicle';

interface SequenceConfig {
    prefix: string;
    digits: number;
    resetStrategy: 'monthly' | 'yearly' | 'none';
}

const CONFIG: Record<EntityType, SequenceConfig> = {
    waybill: { prefix: 'WL', digits: 6, resetStrategy: 'monthly' },
    income: { prefix: 'IN', digits: 5, resetStrategy: 'monthly' },
    expense: { prefix: 'OUT', digits: 5, resetStrategy: 'monthly' },
    fuelCard: { prefix: 'FC', digits: 5, resetStrategy: 'monthly' },
    employee: { prefix: 'EMP', digits: 4, resetStrategy: 'none' },
    vehicle: { prefix: 'VEH', digits: 4, resetStrategy: 'none' },
    item: { prefix: 'ITM', digits: 5, resetStrategy: 'none' },
};

/**
 * Generates the next unique number for a document or entity.
 * Format: PREFIX-YYYYMM-XXXXXX (for monthly reset) or PREFIX-XXXX (for none).
 * 
 * @param type Entity type to determine prefix and format
 * @param dateStr ISO date string (YYYY-MM-DD) for time-based numbering
 */
export const generateNextNumber = async (type: EntityType, dateStr?: string): Promise<string> => {
    const config = CONFIG[type];
    const counters = await loadJSON<Record<string, number>>(DB_KEYS.COUNTERS, {});
    
    let counterKey: string = type;
    let timePrefix = '';

    if (config.resetStrategy === 'monthly' && dateStr) {
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        // Key format: waybill_202405
        counterKey = `${type}_${year}${month}`;
        // Display format: -202405-
        timePrefix = `-${year}${month}`;
    } else if (config.resetStrategy === 'yearly' && dateStr) {
        const date = new Date(dateStr);
        const year = date.getFullYear();
        counterKey = `${type}_${year}`;
        timePrefix = `-${year}`;
    }

    // Get next index
    const nextIndex = (counters[counterKey] || 0) + 1;
    
    // Save updated counter
    counters[counterKey] = nextIndex;
    await saveJSON(DB_KEYS.COUNTERS, counters);

    // Format final string
    const numberPart = String(nextIndex).padStart(config.digits, '0');
    
    // Result: PREFIX[-YYYYMM]-XXXXXX
    // Example: WL-202405-000001 or EMP-0042
    if (config.resetStrategy === 'none') {
        return `${config.prefix}-${numberPart}`;
    } else {
        return `${config.prefix}${timePrefix}-${numberPart}`;
    }
};
