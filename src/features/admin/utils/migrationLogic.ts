
import { ExportBundle } from '../types';
import { KEY_ALIASES, KEY_BLOCKLIST, BACKUP_KEY } from './importLogic';
import { getDataForKey, setDataForKey } from './storageHelpers';
import { saveJSON, loadJSON } from '../../../../services/storage';
import { AUDIT_CHUNK_PREFIX } from '../../../../services/auditLog';

export const EXPORT_FORMAT_VERSION = 2;
export const APP_VERSION = (import.meta as any)?.env?.VITE_APP_VERSION || undefined;

const MIGRATIONS: Record<number, (bundle: ExportBundle) => ExportBundle> = {
  1: (bundle) => {
    const next: ExportBundle = { ...bundle, meta: { ...bundle.meta, formatVersion: 2 } };
    const data = { ...bundle.data };
    for (const [from, to] of Object.entries(KEY_ALIASES)) {
      if (from in data && !(to in data)) {
        data[to] = data[from];
        delete data[from];
      }
    }
    next.data = data;
    return next;
  },
};

export function applyMigrations(bundle: ExportBundle): ExportBundle {
  let current = bundle;
  while (current.meta.formatVersion < EXPORT_FORMAT_VERSION) {
    const m = MIGRATIONS[current.meta.formatVersion];
    if (!m) break;
    current = m(current);
  }
  return current;
}

export function toBundle(parsed: any): ExportBundle {
  if (parsed && typeof parsed === 'object' && parsed.meta && parsed.data) {
    const meta = parsed.meta || {};
    return {
      meta: {
        app: meta.app || 'waybill-app',
        formatVersion: Number(meta.formatVersion) || 1,
        createdAt: meta.createdAt || new Date().toISOString(),
        appVersion: meta.appVersion,
        locale: meta.locale,
        keys: Array.isArray(meta.keys) ? meta.keys : undefined,
        summary: meta.summary,
      },
      data: parsed.data || {},
    };
  }
  return {
    meta: {
      app: 'waybill-app',
      formatVersion: 1, 
      createdAt: new Date().toISOString(),
    },
    data: parsed || {},
  };
}

export async function getKeysToExport(selected: string[]): Promise<string[]> {
    const set = new Set(selected);
    for (const blocked of KEY_BLOCKLIST) set.delete(blocked);
    for (const k of Array.from(set)) if (k.startsWith(AUDIT_CHUNK_PREFIX)) set.delete(k);
    return Array.from(set).sort();
}

export async function backupCurrent(keys: string[]) {
  const backup: Record<string, unknown> = {};
  for (const key of keys) {
    backup[key] = await getDataForKey(key);
  }
  await saveJSON(BACKUP_KEY, {
    createdAt: new Date().toISOString(),
    keys,
    data: backup,
  });
}

export async function rollbackFromBackup() {
  const backup = await loadJSON<any>(BACKUP_KEY, null);
  if (backup && backup.data && backup.keys) {
    const entries = Object.entries(backup.data) as [string, unknown][];
    for (const [k, v] of entries) {
      await setDataForKey(k, v);
    }
  }
}
