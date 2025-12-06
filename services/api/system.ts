
import { DB_KEYS } from '../dbKeys';
import { loadJSON, storageClear } from '../storage';

export const dumpAllDataForExport = async () => {
    const keys = Object.values(DB_KEYS);
    const data: Record<string, any> = {};
    for (const k of keys) {
        data[k] = await loadJSON(k, null);
    }
    return data;
};

export const resetMockApiState = async () => {
    await storageClear();
};
