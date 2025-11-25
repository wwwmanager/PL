
import localforage from 'localforage';

import type { ImportAuditItem } from '../../../../services/auditLog';

const DEFAULT_ID_FIELD = 'id';

// Explicitly define keys that are ALWAYS collections
const COLLECTION_KEYS = new Set([
  'waybills',
  'vehicles',
  'employees',
  'organizations',
  'fuelTypes',
  'savedRoutes',
  'garageStockItems',
  'stockTransactions',
  'waybillBlankBatches',
  'waybillBlanks',
  'users',
]);

function groupByStorageKey(items: ImportAuditItem[]) {
  const byKey = new Map<string, ImportAuditItem[]>();
  for (const item of items) {
    const bucket = byKey.get(item.storageKey);
    if (bucket) {
      bucket.push(item);
    } else {
      byKey.set(item.storageKey, [item]);
    }
  }
  return byKey;
}

export async function purgeAuditItems(items: ImportAuditItem[]) {
  const byKey = groupByStorageKey(items);
  let success = 0;
  let failed = 0;

  for (const [storageKey, arr] of byKey.entries()) {
    try {
      const current = await localforage.getItem<unknown>(storageKey);
      
      const isCollection = COLLECTION_KEYS.has(storageKey) ||
                           Array.isArray(current) ||
                           (current === null && arr.some(x => x.idValue !== undefined));

      if (isCollection) {
        const list = Array.isArray(current) ? current as Record<string, unknown>[] : [];

        let idField = arr.find((x) => x.idField)?.idField || DEFAULT_ID_FIELD;
        if (list.length > 0 && list[0] && !(idField in list[0])) {
             if ('id' in list[0]) idField = 'id';
             else if ('code' in list[0]) idField = 'code';
        }

        const ids = new Set(arr.map((x) => String(x.idValue)));
        
        const filtered = list.filter((entry) => {
           const entryId = entry?.[idField];
           if (entryId === undefined || entryId === null) return true; 
           return !ids.has(String(entryId));
        });
        
        await localforage.setItem(storageKey, filtered);
        success += arr.length;
      } else {
        await localforage.removeItem(storageKey);
        success += arr.length;
      }
    } catch (e) {
      console.error('Purge failed for', storageKey, e);
      failed += arr.length;
    }
  }

  return { success, failed };
}

export async function rollbackAuditItems(items: ImportAuditItem[]) {
  const byKey = groupByStorageKey(items);
  let success = 0;
  let failed = 0;

  for (const [storageKey, arr] of byKey.entries()) {
    try {
      let current = await localforage.getItem<unknown>(storageKey);

      const isCollection = COLLECTION_KEYS.has(storageKey) ||
                           Array.isArray(current) ||
                           (current === null && arr.some(x => x.idValue !== undefined));

      if (isCollection) {
        const list = Array.isArray(current) ? current as Record<string, unknown>[] : [];
        
        let idField = arr.find((x) => x.idField)?.idField || DEFAULT_ID_FIELD;
        if (list.length > 0 && list[0] && !(idField in list[0])) {
             if ('id' in list[0]) idField = 'id';
             else if ('code' in list[0]) idField = 'code';
        }
        
        const map = new Map<string, any>();
        list.forEach(entry => {
            const rawId = entry?.[idField];
            if (rawId !== undefined && rawId !== null) {
                map.set(String(rawId), entry);
            }
        });

        for (const it of arr) {
          const id = it.idValue;
          if (id === undefined || id === null) {
            failed++;
            console.warn(`Cannot rollback item without idValue in ${storageKey}.`);
            continue;
          }
          const strId = String(id);

          if (it.beforeExists) {
            if (it.beforeSnapshot !== undefined) {
              map.set(strId, it.beforeSnapshot);
              success++;
            } else {
               failed++;
               console.warn(`Cannot rollback item ${strId} in ${storageKey}: beforeExists is true but beforeSnapshot is missing.`);
            }
          } else {
            map.delete(strId);
            success++;
          }
        }
        await localforage.setItem(storageKey, Array.from(map.values()));
      } else {
        const itemWithSnapshot = arr.find(it => it.beforeSnapshot !== undefined);
        
        if (itemWithSnapshot) {
            const valueToRestore = itemWithSnapshot.beforeExists ? itemWithSnapshot.beforeSnapshot : null;
            await localforage.setItem(storageKey, valueToRestore);
            success += arr.length;
        } else if (arr.some(it => it.beforeExists)) {
            failed += arr.length;
            console.warn(`Cannot rollback singleton ${storageKey}: no beforeSnapshot found in items.`);
        } else {
            await localforage.removeItem(storageKey);
            success += arr.length;
        }
      }
    } catch (e) {
      console.error('Rollback failed for', storageKey, e);
      failed += arr.length;
    }
  }

  return { success, failed };
}
