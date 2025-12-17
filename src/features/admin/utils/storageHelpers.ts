
import { createRepo } from '../../../../services/repo';
import { loadJSON, saveJSON, removeKey } from '../../../../services/storage';
import { DB_KEYS } from '../../../../services/dbKeys';
import { AUDIT_INDEX_KEY } from '../../../../services/auditLog';
import { BACKUP_KEY, LAST_IMPORT_META_KEY, LAST_EXPORT_META_KEY } from './importLogic';

// Keys that should be treated as Singletons (Blob storage), not Repositories
export const SINGLETON_KEYS = new Set([
    DB_KEYS.APP_SETTINGS,
    DB_KEYS.SEASON_SETTINGS,
    DB_KEYS.PRINT_POSITIONS,
    DB_KEYS.PRINT_EDITOR_PREFS,
    DB_KEYS.ROLE_POLICIES,
    DB_KEYS.DB_SEEDED_FLAG,
    BACKUP_KEY,
    LAST_IMPORT_META_KEY,
    LAST_EXPORT_META_KEY,
    AUDIT_INDEX_KEY,
    'dashboard_filters_v1',
    'waybill_journal_settings_v3',
    'orgManagement_collapsedSections',
    'employeeList_collapsedSections',
    'vehicleList_collapsedSections',
    'waybillDetail_collapsedSections',
]);

export const isRepoKey = (key: string) => !SINGLETON_KEYS.has(key) && !key.startsWith('compat:') && !key.startsWith('__');

export const getDataForKey = async (key: string) => {
    if (isRepoKey(key)) {
        const repo = createRepo(key);
        // ОПТИМИЗАЦИЯ: Для логов и аудита не грузим всё, иначе браузер зависнет при сравнении
        if (key.includes('audit') || key.includes('Log')) {
             return []; 
        }
        const result = await repo.list({ pageSize: 999999 });
        return result.data;
    } else {
        return await loadJSON(key, null);
    }
};

export const setDataForKey = async (key: string, data: any) => {
    if (isRepoKey(key)) {
        const repo = createRepo(key);
        if (Array.isArray(data)) {
            const validItems = data.filter((item: any) => item && item.id);
            if (validItems.length > 0) {
                await repo.updateBulk(validItems);
            }
        }
    } else {
        await saveJSON(key, data);
    }
};

export const deleteDataForKey = async (key: string, idsToDelete?: string[]) => {
    if (isRepoKey(key)) {
        const repo = createRepo(key);
        if (idsToDelete && idsToDelete.length > 0) {
            await repo.removeBulk(idsToDelete);
        } else {
            const all = await repo.list({ pageSize: 99999 });
            await repo.removeBulk(all.data.map((i: any) => i.id));
        }
    } else {
        await removeKey(key);
    }
};

export async function inspectKeyCount(key: string): Promise<number> {
  try {
    const val = await getDataForKey(key);
    if (Array.isArray(val)) return val.length;
    if (val && typeof val === 'object') return Object.keys(val as any).length;
    return val == null ? 0 : 1;
  } catch { return 0; }
}
