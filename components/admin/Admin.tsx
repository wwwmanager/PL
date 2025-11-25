import React, { useMemo, useRef, useState, useEffect, lazy } from 'react';
import { storageKeys, storageClear, loadJSON, saveJSON } from '../../services/storage';
// FIX: DB_KEYS, getAppSettings, and saveAppSettings are now correctly exported from mockApi
import { getAppSettings, saveAppSettings, dumpAllDataForExport } from '../../services/mockApi';
import { DB_KEYS } from '../../services/dbKeys';
import { DownloadIcon, UploadIcon, XIcon, UserGroupIcon } from '../Icons';
import { useToast } from '../../hooks/useToast';
import { databaseSchema } from '../../services/schemas';
import ImportAuditLog from './ImportAuditLog';
import Diagnostics from './Diagnostics';
import ExportContextPackButton from './ExportContextPackButton';
import { appendAuditEventChunked, buildParams, uid, isEntityArray, entityIdField, inferCategoryByKeyName, ImportAuditItem, ImportAuditAction, makeLabel, AUDIT_CHUNK_PREFIX, AUDIT_INDEX_KEY } from '../../services/auditLog';
import { useAuth } from '../../services/auth';
import { Waybill, Employee, Vehicle, Organization, AppSettings, AppMode } from '../../types';
import ConfirmationModal from '../shared/ConfirmationModal';

const UserManagement = lazy(() => import('./UserManagement'));
const RoleManagement = lazy(() => import('./RoleManagement'));
const BusinessAuditLog = lazy(() => import('./BusinessAuditLog'));
const BlankManagement = lazy(() => import('./BlankManagement'));

// ===== Метаданные/совместимость =====

const EXPORT_FORMAT_VERSION = 2;
const APP_VERSION = (import.meta as any)?.env?.VITE_APP_VERSION || undefined;

const BACKUP_KEY = '__backup_before_import__';
const LAST_IMPORT_META_KEY = '__last_import_meta__';
const LAST_EXPORT_META_KEY = '__last_export_meta__';
const UNKNOWN_PREFIX = 'compat:unknown:';


// Критические/служебные ключи, которые НИКОГДА не меняем из импорта
const KEY_BLOCKLIST = new Set<string>([
  'users',
  '__current_user__',
  BACKUP_KEY,
  LAST_IMPORT_META_KEY,
  LAST_EXPORT_META_KEY,
  AUDIT_INDEX_KEY,
  'db_clean_seeded_flag_v6', // новый флаг
]);

// Алиасы ключей между версиями
export const KEY_ALIASES: Record<string, string> = {
  // печатные позиции
  'printPositions_v2': 'printPositions_v4_layout',
  'printPositions_v3_layout': 'printPositions_v4_layout',
  // флаги засева
  'db_seeded_flag_v4': 'db_clean_seeded_flag_v6',
  // Поддержка импорта одиночных записей с единственным числом в ключе
  'employee': DB_KEYS.EMPLOYEES,
  'vehicle': DB_KEYS.VEHICLES,
  'organization': DB_KEYS.ORGANIZATIONS,
  'fuelType': DB_KEYS.FUEL_TYPES,
  'savedRoute': DB_KEYS.SAVED_ROUTES,
  'waybill': DB_KEYS.WAYBILLS,
  'user': DB_KEYS.USERS,
  'garageStockItem': DB_KEYS.GARAGE_STOCK_ITEMS,
  'stockTransaction': DB_KEYS.STOCK_TRANSACTIONS,
  'waybillBlankBatch': DB_KEYS.WAYBILL_BLANK_BATCHES,
  'waybillBlank': DB_KEYS.WAYBILL_BLANKS,
  // Поддержка простых множественных ключей (из ручного JSON)
  'garageStockItems': DB_KEYS.GARAGE_STOCK_ITEMS,
  'stockTransactions': DB_KEYS.STOCK_TRANSACTIONS,
  'waybillBlankBatches': DB_KEYS.WAYBILL_BLANK_BATCHES,
  'waybillBlanks': DB_KEYS.WAYBILL_BLANKS,
};


type AdminTab = 'settings' | 'users' | 'roles' | 'blanks' | 'import_audit' | 'business_audit' | 'diag';

type ExportBundle = {
  meta: {
    app: 'waybill-app';
    formatVersion: number;
    createdAt: string;
    appVersion?: string;
    locale?: string;
    keys?: string[];
    summary?: Record<string, unknown>;
  };
  data: Record<string, unknown>;
};

// Миграции формата (пример)
const MIGRATIONS: Record<number, (bundle: ExportBundle) => ExportBundle> = {
  1: (bundle) => {
    const next: ExportBundle = { ...bundle, meta: { ...bundle.meta, formatVersion: 2 } };
    const data = { ...bundle.data };

    // перенос ключей по алиасам (идемпотентно)
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

function applyMigrations(bundle: ExportBundle): ExportBundle {
  let current = bundle;
  while (current.meta.formatVersion < EXPORT_FORMAT_VERSION) {
    const m = MIGRATIONS[current.meta.formatVersion];
    if (!m) break;
    current = m(current);
  }
  return current;
}

function toBundle(parsed: any): ExportBundle {
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
  // Если meta/data нет, считаем, что весь объект — это data
  return {
    meta: {
      app: 'waybill-app',
      formatVersion: 1, // старый формат
      createdAt: new Date().toISOString(),
    },
    data: parsed || {},
  };
}

function remapKeysWithAliases(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    const newKey = KEY_ALIASES[k] || k;
    let newValue = v;

    // Автоматически оборачиваем одиночный объект в массив для ключей-справочников
    const dictionaryKeys = [
        DB_KEYS.EMPLOYEES, 
        DB_KEYS.VEHICLES, 
        DB_KEYS.ORGANIZATIONS, 
        DB_KEYS.FUEL_TYPES,
        DB_KEYS.SAVED_ROUTES,
        DB_KEYS.WAYBILLS,
        DB_KEYS.GARAGE_STOCK_ITEMS,
        DB_KEYS.STOCK_TRANSACTIONS,
        DB_KEYS.WAYBILL_BLANK_BATCHES,
        DB_KEYS.WAYBILL_BLANKS,
        DB_KEYS.USERS,
    ];

    if (dictionaryKeys.includes(newKey) && !Array.isArray(v) && v && typeof v === 'object') {
        newValue = [v];
    }

    out[newKey] = newValue;
  }
  return out;
}

async function getAllDbKeys(): Promise<string[]> {
    const lfKeys = await storageKeys();
    const cfgKeys = Object.values(DB_KEYS) as string[];
    const set = new Set<string>([...lfKeys, ...cfgKeys]);
    for (const blocked of KEY_BLOCKLIST) set.delete(blocked);
    for (const k of Array.from(set)) if (k.startsWith(AUDIT_CHUNK_PREFIX)) set.delete(k);
    return Array.from(set).sort();
}

async function getKeysToExport(selected: string[]): Promise<string[]> {
    const set = new Set(selected);
    for (const blocked of KEY_BLOCKLIST) set.delete(blocked);
    for (const k of Array.from(set)) if (k.startsWith(AUDIT_CHUNK_PREFIX)) set.delete(k);
    return Array.from(set).sort();
}

async function backupCurrent(keys: string[]) {
  const backup: Record<string, unknown> = {};
  for (const key of keys) {
    backup[key] = await loadJSON(key, null);
  }
  await saveJSON(BACKUP_KEY, {
    createdAt: new Date().toISOString(),
    keys,
    data: backup,
  });
}

async function rollbackFromBackup() {
  const backup = await loadJSON<any>(BACKUP_KEY, null);
  if (backup && backup.data && backup.keys) {
    const entries = Object.entries(backup.data) as [string, unknown][];
    for (const [k, v] of entries) {
      await saveJSON(k, v as any);
    }
  }
}

// ===== Валидация (мягкая) =====

async function validateLenient(
  data: Record<string, unknown>,
  dbKeysAllow: Set<string>
): Promise<{ ok: Record<string, unknown>; skipped: string[] }> {
  const ok: Record<string, unknown> = {};
  const skipped: string[] = [];

  const dbAny: any = databaseSchema as any;
  const allKeys = Object.keys(data).filter((k) => dbKeysAllow.has(k));
  if (allKeys.length === 0) return { ok, skipped: Object.keys(data) };

  try {
    if (typeof dbAny.pick === 'function') {
      const pickShape = Object.fromEntries(allKeys.map((k) => [k, true]));
      const subSchema = dbAny.pick(pickShape);
      const res = subSchema.safeParse(Object.fromEntries(allKeys.map((k) => [k, data[k]])));
      if (res.success) {
        Object.assign(ok, res.data);
        const unknown = Object.keys(data).filter((k) => !allKeys.includes(k));
        return { ok, skipped: unknown };
      }
    }
  } catch {
    // noop
  }

  const shape = dbAny?.shape || dbAny?._def?.shape || undefined;
  if (shape && typeof shape === 'object') {
    for (const k of allKeys) {
      const z = shape[k];
      if (z && typeof z.safeParse === 'function') {
        const res = z.safeParse(data[k]);
        if (res.success) ok[k] = res.data;
        else skipped.push(k);
      } else {
        ok[k] = data[k];
      }
    }
    const unknown = Object.keys(data).filter((k) => !allKeys.includes(k));
    skipped.push(...unknown);
    return { ok, skipped };
  }

  for (const k of allKeys) ok[k] = data[k];
  const unknown = Object.keys(data).filter((k) => !allKeys.includes(k));
  skipped.push(...unknown);
  return { ok, skipped };
}

// ===== Вспомогательные: эвристики, слияние =====

type KeyCategory = 'dict' | 'docs' | 'other' | 'unknown';
type UpdateMode = 'skip' | 'overwrite' | 'merge';
type ImportAction = { enabled: boolean; insertNew: boolean; updateMode: UpdateMode; deleteMissing: boolean; };

function prettifyKey(key: string) {
  const map: Record<string, string> = {
    waybills: 'Путевые листы',
    vehicles: 'Транспорт',
    employees: 'Сотрудники',
    organizations: 'Организации',
    fuelTypes: 'Типы топлива',
    savedRoutes: 'Сохраненные маршруты',
    seasonSettings: 'Настройки сезонов',
    printPositions_v4_layout: 'Настройки печати',
    [DB_KEYS.GARAGE_STOCK_ITEMS]: 'Номенклатура склада',
    [DB_KEYS.STOCK_TRANSACTIONS]: 'Складские операции',
    [DB_KEYS.WAYBILL_BLANK_BATCHES]: 'Пачки бланков',
    [DB_KEYS.WAYBILL_BLANKS]: 'Бланки ПЛ',
  };
  return map[key] || key;
}

function deepMerge<T>(a: T, b: Partial<T>): T {
  if (Array.isArray(a) && Array.isArray(b)) {
    return b as T;
  }
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    const res: any = Array.isArray(a) ? [...(a as any)] : { ...(a as any) };
    for (const [k, v] of Object.entries(b)) {
      if (v === undefined) continue;
      const cur = (res as any)[k];
      if (cur && typeof cur === 'object' && v && typeof v === 'object' && !Array.isArray(cur) && !Array.isArray(v)) {
        (res as any)[k] = deepMerge(cur, v);
      } else {
        (res as any)[k] = v;
      }
    }
    return res as T;
  }
  return (b as T) ?? a;
}

function mergeEntitiesArray(
  existing: Array<Record<string, any>> | null | undefined,
  incoming: Array<Record<string, any>> | null | undefined,
  mode: UpdateMode = 'merge',
  insertNew = true,
  deleteMissing = false
) {
  const base = Array.isArray(existing) ? existing : [];
  const inc = Array.isArray(incoming) ? incoming : [];
  const idField = entityIdField(inc) || entityIdField(base) || 'id';

  const index = new Map<string | number, any>();
  for (const item of base) {
    const id = item?.[idField];
    index.set(id, item);
  }

  for (const item of inc) {
    const id = item?.[idField];
    if (!index.has(id)) {
      if (insertNew) index.set(id, item);
    } else {
      if (mode === 'skip') {
        continue;
      } else if (mode === 'overwrite') {
        index.set(id, item);
      } else {
        const merged = deepMerge(index.get(id), item);
        index.set(id, merged);
      }
    }
  }

  if (deleteMissing) {
    const incIds = new Set(inc.map((i) => i?.[idField]));
    for (const id of Array.from(index.keys())) {
      if (!incIds.has(id)) {
        index.delete(id);
      }
    }
  }

  return Array.from(index.values());
}

function uniqPrimitives(arr: any[]) {
  const s = new Set(arr);
  return Array.from(s);
}

function analyzeCounts(existing: unknown, incoming: unknown) {
  const result = { existingCount: 0, incomingCount: 0, newCount: 0, updateCount: 0 };
  if (isEntityArray(existing) || isEntityArray(incoming)) {
    const base = (existing as any[]) || [];
    const inc = (incoming as any[]) || [];
    result.existingCount = base.length;
    result.incomingCount = inc.length;
    const idField = entityIdField(inc) || entityIdField(base) || 'id';
    const baseIds = new Set(base.map((i) => i?.[idField]));
    let newCnt = 0;
    let updCnt = 0;
    for (const item of inc) {
      const id = item?.[idField];
      if (baseIds.has(id)) updCnt++;
      else newCnt++;
    }
    result.newCount = newCnt;
    result.updateCount = updCnt;
    return result;
  }

  if (Array.isArray(existing) && Array.isArray(incoming)) {
    result.existingCount = existing.length;
    result.incomingCount = incoming.length;
    const setBase = new Set(existing as any[]);
    let upd = 0;
    for (const v of incoming as any[]) if (setBase.has(v)) upd++;
    result.updateCount = upd;
    result.newCount = incoming.length - upd;
    return result;
  }

  if (existing && typeof existing === 'object' && incoming && typeof incoming === 'object') {
    const baseKeys = new Set(Object.keys(existing as any));
    const incKeys = Object.keys(incoming as any);
    const upd = incKeys.filter((k) => baseKeys.has(k)).length;
    const nw = incKeys.length - upd;
    result.existingCount = baseKeys.size;
    result.incomingCount = incKeys.length;
    result.updateCount = upd;
    result.newCount = nw;
    return result;
  }

  result.existingCount = existing == null ? 0 : 1;
  result.incomingCount = incoming == null ? 0 : 1;
  result.newCount = existing == null && incoming != null ? 1 : 0;
  result.updateCount = existing != null && incoming != null ? 1 : 0;
  return result;
}

// ===== Политики безопасности =====

type ImportPolicy = {
  allowCategories: Set<KeyCategory> | null; // null = любые
  denyKeys: Set<string>;
  allowUnknownKeys: boolean;
  allowedModes: Set<UpdateMode>;
  allowDeleteMissing: boolean;
};

const ADMIN_IMPORT_POLICY: ImportPolicy = {
  allowCategories: null,
  denyKeys: KEY_BLOCKLIST,
  allowUnknownKeys: true,
  allowedModes: new Set<UpdateMode>(['merge', 'overwrite', 'skip']),
  allowDeleteMissing: true,
};

const USER_IMPORT_POLICY: ImportPolicy = {
  allowCategories: new Set<KeyCategory>(['docs']),
  denyKeys: KEY_BLOCKLIST,
  allowUnknownKeys: false,
  allowedModes: new Set<UpdateMode>(['merge', 'skip']),
  allowDeleteMissing: false,
};

function isRowAllowedByPolicy(
  row: { key: string; category: KeyCategory; known: boolean },
  policy: ImportPolicy
) {
  if (policy.denyKeys.has(row.key)) return false;
  if (policy.allowCategories && !policy.allowCategories.has(row.category)) return false;
  if (!policy.allowUnknownKeys && !row.known) return false;
  return true;
}

function sanitizeRowByPolicy<T extends {
  key: string;
  category: KeyCategory;
  known: boolean;
  action: { enabled: boolean; insertNew: boolean; updateMode: UpdateMode; deleteMissing: boolean; };
}>(row: T, policy: ImportPolicy): T {
  const allowed = isRowAllowedByPolicy(row, policy);
  const safe = { ...row };
  if (!allowed) {
    safe.action = { ...safe.action, enabled: false };
    return safe;
  }
  if (!policy.allowedModes.has(safe.action.updateMode)) {
    safe.action.updateMode = policy.allowedModes.has('merge') ? 'merge' : 'skip';
  }
  if (!policy.allowDeleteMissing) {
    safe.action.deleteMissing = false;
  }
  safe.action.insertNew = safe.action.insertNew !== false;
  return safe;
}


// ===== Модалка экспорта =====
type KeyInfo = { key: string; category: KeyCategory; display: string; count: number; };
async function inspectKeyCount(key: string): Promise<number> {
  try {
    const val = await loadJSON(key, null);
    if (Array.isArray(val)) return val.length;
    if (val && typeof val === 'object') return Object.keys(val as any).length;
    return val == null ? 0 : 1;
  } catch { return 0; }
}
function classNames(...cls: (string | false | undefined)[]) { return cls.filter(Boolean).join(' '); }
function SectionHeader({ title }: { title: string }) { return <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-3 mb-1">{title}</div>; }
function useAsync<T>(fn: () => Promise<T>, deps: any[]) {
  const [state, setState] = useState<{ loading: boolean; error?: any; value?: T }>({ loading: true });
  useEffect(() => {
    let alive = true;
    setState({ loading: true });
    fn().then((value) => alive && setState({ loading: false, value })).catch((error) => alive && setState({ loading: false, error }));
    return () => { alive = false; };
  }, deps); // eslint-disable-line
  return state;
}
const ExportModal: React.FC<{ onClose: () => void; onConfirm: (selectedKeys: string[]) => void; }> = ({ onClose, onConfirm }) => {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const { loading, value: items } = useAsync(async () => {
    const keys = await getAllDbKeys();
    const infos: KeyInfo[] = [];
    for (const key of keys) {
      const count = await inspectKeyCount(key);
      infos.push({ key, category: inferCategoryByKeyName(key), display: prettifyKey(key), count });
    }
    return infos;
  }, []);
  const grouped = useMemo(() => {
    const out: Record<KeyCategory, KeyInfo[]> = { dict: [], docs: [], other: [], unknown: [] };
    (items || []).forEach((ki) => out[ki.category]?.push(ki));
    return out;
  }, [items]);
  const toggleAll = (keys: string[], val: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      keys.forEach((k) => (next[k] = val));
      return next;
    });
  };
  const handleConfirm = () => {
    const keys = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    onConfirm(keys);
  };
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Экспорт данных (выборочно)</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"><XIcon className="h-5 w-5" /></button>
        </div>
        <div className="p-4">{loading && <div className="text-gray-500">Загрузка ключей…</div>}
          {!loading && (<>
              <div className="flex items-center gap-2 mb-3">
                <button className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700" onClick={() => toggleAll((items || []).map((i) => i.key), true)}>Выбрать всё</button>
                <button className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700" onClick={() => toggleAll((items || []).map((i) => i.key), false)}>Снять выделение</button>
              </div>
              {(['dict', 'docs', 'other'] as KeyCategory[]).map((cat) => {
                const list = grouped[cat] || [];
                if (!list.length) return null;
                return (
                  <div key={cat} className="mb-4"><SectionHeader title={cat === 'dict' ? 'Справочники' : cat === 'docs' ? 'Документы' : 'Прочее'} />
                    <div className="divide-y dark:divide-gray-700 rounded border dark:border-gray-700">
                      {list.map((it) => (
                        <label key={it.key} className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                          <div className="flex items-center gap-2">
                            <input type="checkbox" checked={!!selected[it.key]} onChange={(e) => setSelected((s) => ({ ...s, [it.key]: e.target.checked }))}/>
                            <div className="text-gray-900 dark:text-gray-100">{it.display}</div>
                            <div className="text-xs text-gray-500">({it.key})</div>
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-300">записей: {it.count}</div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
        <div className="p-4 border-t dark:border-gray-700 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100">Отмена</button>
          <button onClick={handleConfirm} className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:bg-green-400" disabled={!Object.values(selected).some(Boolean)}>Экспортировать выбранное</button>
        </div>
      </div>
    </div>
  );
};

// ===== Модалка импорта =====
type ImportRow = { key: string; display: string; category: KeyCategory; existing: unknown; incoming: unknown; stats: ReturnType<typeof analyzeCounts>; action: ImportAction; known: boolean; };
const ImportPreviewModal: React.FC<{ bundle: ExportBundle; policy: ImportPolicy; onClose: () => void; onApply: (rows: ImportRow[]) => Promise<void>; }> = ({ bundle, policy, onClose, onApply }) => {
  const { showToast } = useToast();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = remapKeysWithAliases(bundle.data);
        const knownSet = new Set(Object.values(DB_KEYS) as string[]);
        const keys = Object.keys(data);
        const tmp: Omit<ImportRow, 'action'>[] = [];
        for (const key of keys) {
          const incoming = data[key];
          const existing = await loadJSON(key, null);
          const stats = analyzeCounts(existing, incoming);
          const category = inferCategoryByKeyName(key);
          tmp.push({ key, display: prettifyKey(key), category, existing, incoming, stats, known: knownSet.has(key) });
        }
        const sanitized = tmp.map(r => sanitizeRowByPolicy({ ...r, action: { enabled: true, insertNew: true, updateMode: 'merge', deleteMissing: false } }, policy));
        if (alive) setRows(sanitized.sort((a,b)=>a.display.localeCompare(b.display)));
      } catch (e) {
        console.error(e);
        showToast('Ошибка подготовки превью импорта', 'error');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [bundle, policy, showToast]);

  const toggleAll = (enabled: boolean) => {
    setRows((prev) => prev.map((r) => isRowAllowedByPolicy(r, policy) ? ({ ...r, action: { ...r.action, enabled } }) : r));
  };

  const apply = async () => {
    const selected = rows.filter((r) => r.action.enabled);
    await onApply(selected);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700"><h3 className="text-lg font-semibold text-gray-900 dark:text-white">Импорт: предварительный просмотр</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"><XIcon className="h-5 w-5" /></button></div>
        <div className="p-4">
          <div className="text-sm text-gray-600 dark:text-gray-300 mb-3">Файл: ключей {Object.keys(bundle.data || {}).length}. Формат: v{bundle.meta.formatVersion} • Создан: {new Date(bundle.meta.createdAt).toLocaleString()} {bundle.meta.appVersion && (<>• Версия приложения: {bundle.meta.appVersion}</>)}</div>
          <div className="flex items-center gap-2 mb-3"><button onClick={() => toggleAll(true)} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">Включить все</button><button onClick={() => toggleAll(false)} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">Отключить все</button></div>
          {loading && <div className="text-gray-500">Загрузка…</div>}
          {!loading && (<div className="space-y-3">
              {(['dict', 'docs', 'other'] as KeyCategory[]).map((cat) => {
                const subset = rows.filter((r) => r.category === cat);
                if (!subset.length) return null;
                return (
                  <div key={cat}><SectionHeader title={cat === 'dict' ? 'Справочники' : cat === 'docs' ? 'Документы' : 'Прочее'} />
                    <div className="overflow-hidden rounded border dark:border-gray-700"><table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-700/40"><tr className="text-left text-gray-700 dark:text-gray-200"><th className="p-2 w-8"></th><th className="p-2">Раздел</th><th className="p-2">Ключ</th><th className="p-2 text-right">В БД</th><th className="p-2 text-right">В файле</th><th className="p-2 text-right">Новые</th><th className="p-2 text-right">Обновл.</th><th className="p-2">Стратегия</th></tr></thead>
                        <tbody>{subset.map((r) => (
                            <tr key={r.key} className="border-t dark:border-gray-700">
                              <td className="p-2"><input type="checkbox" checked={r.action.enabled} onChange={(e) => setRows((prev) => prev.map((x) => (x.key === r.key ? { ...x, action: { ...x.action, enabled: e.target.checked } } : x)))} disabled={!isRowAllowedByPolicy(r, policy)} /></td>
                              <td className="p-2"><div className="text-gray-900 dark:text-gray-100">{r.display}</div>{!r.known && <div className="text-xs text-amber-600">Неизвестный ключ</div>} {!isRowAllowedByPolicy(r, policy) && <div className="text-[11px] text-amber-600">Недоступно вашей роли</div>}</td>
                              <td className="p-2 text-gray-500 text-xs">{r.key}</td><td className="p-2 text-right">{r.stats.existingCount}</td><td className="p-2 text-right">{r.stats.incomingCount}</td><td className="p-2 text-right">{r.stats.newCount}</td><td className="p-2 text-right">{r.stats.updateCount}</td>
                              <td className="p-2"><div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-1"><input type="checkbox" checked={r.action.insertNew} onChange={(e) => setRows((prev) => prev.map((x) => x.key === r.key ? { ...x, action: { ...x.action, insertNew: e.target.checked } } : x))} /><span>Добавлять новые</span></label>
                                  <select className="border rounded px-2 py-1 dark:bg-gray-800 dark:border-gray-700" value={r.action.updateMode} onChange={(e) => setRows((prev) => prev.map((x) => x.key === r.key ? { ...x, action: { ...x.action, updateMode: e.target.value as UpdateMode } } : x))} disabled={!policy.allowedModes.has('merge') && !policy.allowedModes.has('overwrite')}>
                                    {policy.allowedModes.has('merge') && <option value="merge">Обновлять (слияние)</option>}
                                    {policy.allowedModes.has('overwrite') && <option value="overwrite">Обновлять (перезапись)</option>}
                                    {policy.allowedModes.has('skip') && <option value="skip">Не обновлять</option>}
                                  </select>
                                  <label className="flex items-center gap-1"><input type="checkbox" checked={r.action.deleteMissing} onChange={(e) => setRows((prev) => prev.map((x) => x.key === r.key ? { ...x, action: { ...x.action, deleteMissing: e.target.checked } } : x))} disabled={!policy.allowDeleteMissing} /><span className="text-red-600">Удалять отсутствующие</span></label>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="p-4 border-t dark:border-gray-700 flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100">Отмена</button><button onClick={apply} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Импортировать выбранное</button></div>
      </div>
    </div>
  );
};

export const AppSettingsComponent: React.FC = () => {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const { showToast } = useToast();
    const { can } = useAuth();

    useEffect(() => {
        getAppSettings().then(setSettings);
    }, []);

    const handleSettingChange = (key: keyof AppSettings, value: boolean | AppMode) => {
        if (!settings) return;
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        saveAppSettings(newSettings).then(() => {
            showToast('Настройки сохранены.', 'success');
        });
    };
    
    const handleBlanksSettingChange = (key: keyof NonNullable<AppSettings['blanks']>, value: boolean) => {
        if (!settings) return;
        const newSettings = { 
            ...settings, 
            blanks: {
                ...(settings.blanks || { driverCanAddBatches: false }),
                [key]: value,
            }
        };
        setSettings(newSettings);
        saveAppSettings(newSettings).then(() => {
            showToast('Настройки сохранены.', 'success');
        });
    };

    if (!can('admin.panel')) {
        return (
            <div className="text-gray-500 dark:text-gray-400 p-4">
                Доступ к общим настройкам есть только у администратора.
            </div>
        );
    }

    if (!settings) {
        return <div>Загрузка настроек...</div>;
    }

    const blanksSettings = settings.blanks || { driverCanAddBatches: false };

    return (
        <section className="border rounded-lg p-4 dark:border-gray-700 max-w-2xl space-y-4">
            <h3 className="font-semibold text-lg mb-4 text-gray-800 dark:text-white">Общие настройки</h3>
            <div className="space-y-4">
                <label className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <div>
                        <div className="font-medium text-gray-800 dark:text-white">Включить парсер маршрутов из файла</div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Активирует кнопку "Импорт из файла" в путевом листе для загрузки маршрутов из HTML отчетов.
                        </p>
                    </div>
                    <div className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={settings.isParserEnabled}
                            onChange={(e) => handleSettingChange('isParserEnabled', e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-blue-600"></div>
                    </div>
                </label>
                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <div className="font-medium text-gray-800 dark:text-white">Режим работы с путевыми листами</div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                        Определяет доступные переходы статусов для путевых листов.
                    </p>
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2">
                            <input type="radio" name="appMode" value="driver" checked={settings.appMode === 'driver' || !settings.appMode} onChange={() => handleSettingChange('appMode', 'driver')} />
                            <span>Driver mode (упрощенный)</span>
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="radio" name="appMode" value="central" checked={settings.appMode === 'central'} onChange={() => handleSettingChange('appMode', 'central')} />
                            <span>Central mode (с проверкой)</span>
                        </label>
                    </div>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 space-y-2">
                     <div className="font-medium text-gray-800 dark:text-white">Настройки бланков ПЛ</div>
                     <label className="flex items-center gap-2"><input type="checkbox" checked={blanksSettings.driverCanAddBatches} onChange={e => handleBlanksSettingChange('driverCanAddBatches', e.target.checked)} /><span>Водитель может добавлять пачки</span></label>
                </div>
            </div>
        </section>
    );
};


// ===== Основной компонент Admin =====
const Admin: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('settings');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [importBundle, setImportBundle] = useState<ExportBundle | null>(null);
  const [isClearDataModalOpen, setIsClearDataModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const { can, currentUser } = useAuth();
  const [skel, setSkel] = useState<any>(null);

  useEffect(() => {
    if ((activeTab === 'diag' || activeTab === 'users' || activeTab === 'blanks') && !can('admin.panel')) {
      setActiveTab('settings');
    }
  }, [activeTab, can]);

  useEffect(() => {
    fetch('/context-pack.skeleton.json')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => setSkel(data))
      .catch(error => {
        console.error("Could not load context pack skeleton file:", error);
        // showToast('Не удалось загрузить скелет пакета контекста.', 'error');
      });
  }, [showToast]);

  const canImportFull = can('import.run');
  const canImportLimited = can('import.limited');
  const canExport = can('export.run');

  const importPolicy = useMemo<ImportPolicy | null>(() => {
    if (canImportFull) return ADMIN_IMPORT_POLICY;
    if (canImportLimited) return USER_IMPORT_POLICY;
    return null;
  }, [canImportFull, canImportLimited]);

  // ===== Экспорт =====
  const startExport = () => setShowExportModal(true);

  const handleExportAllData = async () => {
      try {
          const data = await dumpAllDataForExport();
          const keys = Object.keys(data);
          handleExportConfirm(keys, data);
      } catch (error) {
          console.error('Full export error:', error);
          showToast('Ошибка полного экспорта.', 'error');
      }
  };
  
  const handleExportConfirm = async (
    selectedKeys: string[],
    preloadedData?: Record<string, unknown>
  ) => {
    setShowExportModal(false);
    setIsExporting(true);
  
    try {
      const keysToExport = await getKeysToExport(selectedKeys);
      const data: Record<string, unknown> = {};
  
      if (preloadedData) {
        // путь "Экспорт всего" — данные уже собраны dumpAllDataForExport()
        for (const key of keysToExport) {
          data[key] = preloadedData[key];
        }
      } else {
        // выборочный экспорт — читаем каждый ключ из IndexedDB
        for (const key of keysToExport) {
          data[key] = await loadJSON(key, null);
        }
      }
  
      const bundle: ExportBundle = {
        meta: {
          app: 'waybill-app',
          formatVersion: EXPORT_FORMAT_VERSION,
          createdAt: new Date().toISOString(),
          appVersion: APP_VERSION,
          keys: keysToExport,
          summary: { keyCount: keysToExport.length },
        },
        data,
      };
  
      const jsonString = JSON.stringify(bundle, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `waybill_app_export_${timestamp}.json`;
  
      let exportSuccessful = false;
  
      if ((window as any).showSaveFilePicker &&
          (currentUser?.role === 'user' || currentUser?.role === 'auditor')) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'JSON Files',
              accept: { 'application/json': ['.json'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          exportSuccessful = true;
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.error(err.name, err.message);
            showToast(`Не удалось экспортировать данные: ${err.message}`, 'error');
          }
        }
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        exportSuccessful = true;
      }
  
      if (exportSuccessful) {
        await saveJSON(LAST_EXPORT_META_KEY, {
          createdAt: new Date().toISOString(),
          keys: keysToExport,
          size: jsonString.length,
          appVersion: APP_VERSION,
          formatVersion: EXPORT_FORMAT_VERSION,
        });
        showToast('Данные экспортированы.', 'success');
      }
    } catch (error) {
      console.error('Failed to export data:', error);
      showToast('Не удалось экспортировать данные. Подробности в консоли.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // ===== Импорт =====
  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') throw new Error('Не удалось прочитать файл.');
        let parsed: any;
        try { parsed = JSON.parse(text); } catch { throw new Error('Файл повреждён или имеет неверный JSON.'); }
        let bundle = toBundle(parsed);
        bundle = applyMigrations(bundle);
        setImportBundle(bundle);
      } catch (error) {
        console.error('Import preview error:', error);
        showToast(`Ошибка импорта: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`, 'error');
        setIsImporting(false);
      } finally {
        if (event.target) event.target.value = '';
      }
    };
    reader.onerror = () => { showToast('Не удалось прочитать файл.', 'error'); setIsImporting(false); if (event.target) event.target.value = ''; };
    reader.readAsText(file);
  };

  const applySelectiveImport = async (rows: ImportRow[], policy: ImportPolicy) => {
    try {
      const knownSet = new Set(Object.values(DB_KEYS) as string[]);
  
      const safeRows = rows
        .map((r) => sanitizeRowByPolicy({ ...r, known: knownSet.has(r.key) }, policy))
        .filter((r) => r.action.enabled);
  
      if (!safeRows.length) return;
  
      const selectedKeys = safeRows.map((r) => r.key);
      await backupCurrent(selectedKeys);
  
      // 1. Считаем итоговые значения по каждому ключу (с учётом merge/overwrite/skip/deleteMissing)
      const candidate: Record<string, unknown> = {};
      const unknown: Record<string, unknown> = {};
  
      for (const row of safeRows) {
        const { key, incoming, action } = row;
        if (KEY_BLOCKLIST.has(key)) continue;
  
        const existing = await loadJSON(key, null);
        let toWrite: unknown = null;
  
        if (isEntityArray(existing) || isEntityArray(incoming)) {
          toWrite = mergeEntitiesArray(
            (existing as any[]) || [],
            (incoming as any[]) || [],
            action.updateMode,
            action.insertNew,
            action.deleteMissing
          );
        } else if (Array.isArray(existing) && Array.isArray(incoming)) {
          if (action.updateMode === 'skip') {
            toWrite = existing;
          } else if (action.updateMode === 'overwrite' || action.deleteMissing) {
            toWrite = incoming;
          } else {
            toWrite = uniqPrimitives([...(existing as any[]), ...(incoming as any[])]);
          }
        } else if (existing && typeof existing === 'object' && incoming && typeof incoming === 'object') {
          if (action.updateMode === 'skip') {
            toWrite = existing;
          } else if (action.updateMode === 'overwrite' || action.deleteMissing) {
            toWrite = incoming;
          } else {
            toWrite = deepMerge(existing, incoming);
          }
        } else {
          if (existing == null) {
            toWrite = action.insertNew ? incoming : existing;
          } else {
            toWrite = action.updateMode === 'skip' ? existing : incoming;
          }
        }
  
        if (knownSet.has(key)) {
          candidate[key] = toWrite;
        } else {
          unknown[key] = toWrite;
        }
      }
  
      // 2. Валидируем уже посчитанное итоговое состояние,
      //    а не "сырой" импорт
      const recognized = Object.fromEntries(
        Object.entries(candidate).filter(([k]) => knownSet.has(k))
      ) as Record<string, unknown>;
  
      let validated: Record<string, unknown> = {};
      const strict = (databaseSchema as any)?.safeParse?.(recognized);
  
      if (strict?.success) {
        validated = strict.data;
      } else {
        const len = await validateLenient(recognized, knownSet);
        validated = len.ok;
        if (strict?.error) {
          console.warn('Strict validation failed. Using lenient result.', strict.error);
        }
        if (len.skipped.length) {
          console.warn('Skipped keys in lenient validation:', len.skipped);
        }
      }
  
      // 3. Пишем в хранилище
      for (const row of safeRows) {
        const { key } = row;
        if (KEY_BLOCKLIST.has(key)) continue;
  
        const isKnown = knownSet.has(key);
        const storageKey = isKnown ? key : `${UNKNOWN_PREFIX}${key}`;
        const raw = isKnown ? candidate[key] : unknown[key];
        const safe = isKnown && key in validated ? validated[key] : raw;
  
        await saveJSON(storageKey, safe as any);
      }
  
      // 4. Журнал аудита — можно оставить без изменений
      try {
        const items: ImportAuditItem[] = [];
        const backup = await loadJSON<any>(BACKUP_KEY, null);
        const beforeMap: Record<string, any> = backup?.data || {};
  
        const employees = await loadJSON<Employee[]>('employees', []);
        const vehicles = await loadJSON<Vehicle[]>('vehicles', []);
        const orgs = await loadJSON<Organization[]>('organizations', []);
  
        const byId = {
          emp: new Map<string, Employee>(employees.map((e) => [e.id, e])),
          veh: new Map<string, Vehicle>(vehicles.map((v) => [v.id, v])),
          org: new Map<string, Organization>(orgs.map((o) => [o.id, o])),
        };
  
        for (const row of safeRows) {
          const { key, incoming, action } = row;
          const storageKey = knownSet.has(key) ? key : `${UNKNOWN_PREFIX}${key}`;
          const category = knownSet.has(key) ? inferCategoryByKeyName(key) : 'unknown';
  
          const beforeVal = beforeMap[storageKey];
          const afterVal = await loadJSON(storageKey, null);
  
          if (isEntityArray(incoming) || isEntityArray(beforeVal) || isEntityArray(afterVal)) {
            const base: any[] = Array.isArray(beforeVal) ? beforeVal : [];
            const inc: any[] = Array.isArray(incoming) ? incoming : [];
            const aft: any[] = Array.isArray(afterVal) ? afterVal : [];
  
            const idField =
              entityIdField(inc) || entityIdField(base) || entityIdField(aft) || 'id';
  
            const baseIndex = new Map<any, any>(base.map((x) => [x?.[idField], x]));
            const incIndex = new Map<any, any>(inc.map((x) => [x?.[idField], x]));
            const aftIndex = new Map<any, any>(aft.map((x) => [x?.[idField], x]));
  
            for (const it of inc) {
              const idVal = it?.[idField];
              const existed = baseIndex.has(idVal);
              const now = aftIndex.get(idVal);
  
              const act: ImportAuditAction = existed
                ? action.updateMode === 'overwrite'
                  ? 'overwrite'
                  : 'merge'
                : 'insert';
  
              const w = (now || it) as Partial<Waybill>;
  
              const params =
                key === 'waybills'
                  ? {
                      ...buildParams(key, w),
                      driverName: byId.emp.get(w?.driverId)?.fullName,
                      vehiclePlate: byId.veh.get(w?.vehicleId)?.plateNumber,
                      organizationName: byId.org.get(w?.organizationId)?.fullName,
                    }
                  : buildParams(key, w);
  
              items.push({
                storageKey,
                key,
                category,
                idField,
                idValue: idVal,
                action: act,
                label: makeLabel(now || it),
                params,
                beforeExists: existed,
                afterExists: !!now,
                beforeSnapshot: existed ? baseIndex.get(idVal) : undefined,
                afterSnapshot: now,
              });
            }
  
            if (action.deleteMissing) {
              for (const b of base) {
                const idVal = b?.[idField];
                if (!incIndex.has(idVal)) {
                  const now = aftIndex.get(idVal);
                  items.push({
                    storageKey,
                    key,
                    category,
                    idField,
                    idValue: idVal,
                    action: 'delete',
                    label: makeLabel(b),
                    params: buildParams(key, b),
                    beforeExists: true,
                    afterExists: !!now,
                    beforeSnapshot: b,
                    afterSnapshot: now,
                  });
                }
              }
            }
          } else {
            const act: ImportAuditAction =
              action.updateMode === 'overwrite'
                ? 'overwrite'
                : action.updateMode === 'merge'
                ? 'merge'
                : 'skip';
  
            items.push({
              storageKey,
              key,
              category,
              action: act,
              beforeExists: beforeVal != null,
              afterExists: afterVal != null,
              beforeSnapshot: beforeVal,
              afterSnapshot: afterVal,
            });
          }
        }
  
        await appendAuditEventChunked({
          id: uid(),
          at: new Date().toISOString(),
          sourceMeta: {
            ...(importBundle?.meta || {}),
            actor: currentUser
              ? {
                  id: currentUser.id,
                  role: currentUser.role,
                  name: currentUser.displayName,
                }
              : undefined,
          },
          items,
        });
      } catch (e) {
        console.warn('Не удалось записать событие журнала импорта', e);
      }
  
      await saveJSON(LAST_IMPORT_META_KEY, {
        importedAt: new Date().toISOString(),
        sourceMeta: importBundle?.meta,
        writtenKeys: safeRows.map((r) => r.key),
        appVersion: APP_VERSION,
        formatVersion: EXPORT_FORMAT_VERSION,
      });
    } catch (error) {
      console.error('Import error:', error);
      showToast(
        `Ошибка импорта: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        'error'
      );
      try {
        await rollbackFromBackup();
        showToast('Данные восстановлены из бэкапа.', 'info');
      } catch (rbErr) {
        console.error('Rollback error:', rbErr);
        showToast('КРИТИЧЕСКАЯ ОШИБКА: Не удалось восстановить бэкап!', 'error');
      }
    } finally {
      showToast('Операция завершена. Страница будет перезагружена.', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    }
  };

  const handleClearAllData = async () => {
    setIsClearDataModalOpen(false);
    setIsImporting(true); // Reuse loading state to disable buttons
    try {
        await storageClear();
        // Устанавливаем флаг, чтобы предотвратить повторное заполнение демо-данными при перезагрузке
        await saveJSON(DB_KEYS.DB_SEEDED_FLAG, true);
        showToast('Все данные успешно удалены. Приложение будет перезагружено.', 'success');
        setTimeout(() => {
            window.location.reload();
        }, 1500);
    } catch (error) {
        console.error("Failed to clear data:", error);
        showToast('Произошла ошибка при очистке данных.', 'error');
        setIsImporting(false);
    }
  };
  
  const TabButton = ({ tab, label }: { tab: AdminTab; label: string }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={classNames(
        'px-4 py-2 text-sm font-medium rounded-md transition-colors',
        activeTab === tab
          ? 'bg-blue-600 text-white'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
      )}
    >
      {label}
    </button>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'settings':
        return <AppSettingsComponent />;
      case 'users':
        return <UserManagement />;
      case 'roles':
        return <RoleManagement />;
      case 'blanks':
        return <BlankManagement />;
      case 'import_audit':
        return <ImportAuditLog />;
      case 'business_audit':
        return <BusinessAuditLog />;
      case 'diag':
        return <Diagnostics />;
      default:
        return null;
    }
  };
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
      <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".json" className="hidden" />
      {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} onConfirm={(keys) => handleExportConfirm(keys)} />}
      {importBundle && importPolicy && <ImportPreviewModal bundle={importBundle} policy={importPolicy} onClose={() => { setImportBundle(null); setIsImporting(false); }} onApply={(rows) => applySelectiveImport(rows, importPolicy)} />}
       <ConfirmationModal
          isOpen={isClearDataModalOpen}
          onClose={() => setIsClearDataModalOpen(false)}
          onConfirm={handleClearAllData}
          title="Подтвердить полную очистку данных?"
          message="Вы уверены, что хотите полностью удалить ВСЕ данные приложения? Это действие необратимо и приведет к сбросу до начального состояния."
          confirmText="Да, удалить все"
          confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Настройки</h2>
        <div className="flex items-center gap-4 flex-wrap">
            <div className="flex space-x-2 p-1 bg-gray-100 dark:bg-gray-900 rounded-lg">
                <TabButton tab="settings" label="Общие настройки" />
                {can('admin.panel') && <TabButton tab="users" label="Пользователи" />}
                {can('admin.panel') && <TabButton tab="roles" label="Управление ролями" />}
                {can('admin.panel') && <TabButton tab="blanks" label="Бланки ПЛ" />}
                <TabButton tab="import_audit" label="Журнал импорта" />
                {can('audit.business.read') && <TabButton tab="business_audit" label="Бизнес-аудит" />}
                {can('admin.panel') && <TabButton tab="diag" label="Диагностика" />}
            </div>
            <button onClick={handleImportClick} disabled={!importPolicy || isImporting} className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:opacity-50"><UploadIcon className="h-5 w-5" />{isImporting ? 'Импорт...' : 'Импорт'}</button>
            <button onClick={() => (canImportFull ? startExport() : handleExportAllData())} disabled={!canExport || isImporting} className="flex items-center gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-green-700 transition-colors disabled:opacity-50"><DownloadIcon className="h-5 w-5" />{isExporting ? 'Экспорт...' : 'Экспорт'}</button>
            {skel && <ExportContextPackButton packSkeleton={skel} mode="skeleton" />}
        </div>
      </div>
       <div className="overflow-x-auto">{renderActiveTab()}</div>

        {can('admin.panel') && (
            <div className="mt-8">
                <div className="border-t pt-6 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-red-600 dark:text-red-500">Опасная зона</h3>
                    <div className="mt-4 p-4 border border-red-300 dark:border-red-700 rounded-lg">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium text-gray-800 dark:text-gray-100">Очистить все данные</p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Это действие полностью удалит все данные из хранилища браузера (путевые листы, справочники, настройки). Действие необратимо.</p>
                            </div>
                            <button
                                onClick={() => setIsClearDataModalOpen(true)}
                                disabled={isImporting}
                                className="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-red-700 transition-colors disabled:opacity-50"
                            >
                                Очистить
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default Admin;