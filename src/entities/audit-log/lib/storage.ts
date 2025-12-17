import localforage from 'localforage';

import type { ImportAuditItem } from '../../../../services/auditLog';

const DEFAULT_ID_FIELD = 'id';

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
      if (Array.isArray(current)) {
        const idField = arr.find((x) => x.idField)?.idField || DEFAULT_ID_FIELD;
        const ids = new Set(arr.map((x) => x.idValue));
        const filtered = (current as Record<string, unknown>[]).filter((entry) => !ids.has(entry?.[idField] as any));
        await localforage.setItem(storageKey, filtered);
        success += arr.length;
      } else {
        await localforage.removeItem(storageKey);
        success += arr.length;
      }
    } catch {
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
      const current = await localforage.getItem<unknown>(storageKey);
      if (Array.isArray(current)) {
        const idField = arr.find((x) => x.idField)?.idField || DEFAULT_ID_FIELD;
        const map = new Map(
          (current as Record<string, unknown>[]).map((entry) => [entry?.[idField], entry]),
        );

        for (const it of arr) {
          const id = it.idValue;
          if (id === undefined) continue;

          if (it.beforeExists) {
            if (it.beforeSnapshot !== undefined) {
              map.set(id, it.beforeSnapshot as Record<string, unknown>);
            } else {
              map.delete(id);
            }
          } else {
            map.delete(id);
          }
          success += 1;
        }

        await localforage.setItem(storageKey, Array.from(map.values()));
      } else {
        const first = arr.find((x) => x.beforeSnapshot !== undefined);
        await localforage.setItem(storageKey, first ? first.beforeSnapshot ?? null : null);
        success += arr.length;
      }
    } catch {
      failed += arr.length;
    }
  }

  return { success, failed };
}