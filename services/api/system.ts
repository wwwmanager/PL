
import { DB_KEYS } from '../dbKeys';
import { loadJSON, storageClear } from '../storage';
import { createRepo } from '../repo';

// Keys that are stored as single objects (Blob), not Tables
const SINGLETON_KEYS = new Set([
    DB_KEYS.APP_SETTINGS,
    DB_KEYS.SEASON_SETTINGS,
    DB_KEYS.PRINT_POSITIONS,
    DB_KEYS.PRINT_EDITOR_PREFS,
    DB_KEYS.ROLE_POLICIES,
    DB_KEYS.DB_SEEDED_FLAG,
    'dashboard_filters_v1'
]);

export const dumpAllDataForExport = async () => {
    const keys = Object.values(DB_KEYS);
    const data: Record<string, any> = {};
    
    for (const k of keys) {
        if (SINGLETON_KEYS.has(k)) {
            // Read as single object
            data[k] = await loadJSON(k, null);
        } else {
            // Read as Collection from Table-like store
            // We use createRepo which knows how to read from specific stores
            try {
                const repo = createRepo(k);
                // We use list() because getAll() is internal, but list() calls getAll()
                const result = await repo.list({ pageSize: 999999 });
                data[k] = result.data;
            } catch (e) {
                // Fallback for keys that might not be migrated yet or are empty
                console.warn(`Failed to export repo for key ${k}, trying raw load`, e);
                data[k] = await loadJSON(k, null);
            }
        }
    }
    return data;
};

export const resetMockApiState = async () => {
    await storageClear();
    // Also clear all known repositories explicitly since they are in different stores now
    const keys = Object.values(DB_KEYS);
    for (const k of keys) {
        if (!SINGLETON_KEYS.has(k)) {
             try {
                 const repo = createRepo(k);
                 // We can't easily clear the store via repo, but iterating list and deleting is safe
                 // Ideally localforage.dropInstance should be used but repo doesn't expose it.
                 // For mock reset, this is acceptable.
                 const all = await repo.list({ pageSize: 99999 });
                 if (all.data.length > 0) {
                     await repo.removeBulk(all.data.map((i: any) => i.id));
                 }
             } catch (e) {
                 console.error(`Failed to clear repo ${k}`, e);
             }
        }
    }
};
