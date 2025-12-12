
import React, { useMemo, useRef, useState, useEffect, lazy, Suspense } from 'react';
import { storageKeys, storageClear, loadJSON, saveJSON, removeKey } from '../../services/storage';
import { getAppSettings, saveAppSettings, dumpAllDataForExport } from '../../services/mockApi';
import { DB_KEYS } from '../../services/dbKeys';
import { DownloadIcon, UploadIcon, XIcon, ArrowDownIcon, ArrowUpIcon, TrashIcon, DocumentTextIcon, BookOpenIcon, ArchiveBoxIcon, CogIcon, ClipboardCheckIcon, ShieldCheckIcon } from '../Icons';
import { useToast } from '../../hooks/useToast';
import { databaseSchema } from '../../services/schemas';
import ImportAuditLog from './ImportAuditLog';
import Diagnostics from './Diagnostics';
import ExportContextPackButton from './ExportContextPackButton';
import { appendAuditEventChunked, buildParams, uid, isEntityArray, entityIdField, inferCategoryByKeyName, ImportAuditItem, ImportAuditAction, makeLabel, AUDIT_CHUNK_PREFIX, AUDIT_INDEX_KEY } from '../../services/auditLog';
import { useAuth } from '../../services/auth';
import { Waybill, Employee, Vehicle, Organization, AppSettings, DashboardWidgetsSettings } from '../../types';
import ConfirmationModal from '../shared/ConfirmationModal';
import { AppSettingsComponent } from './AppSettingsComponent';
import Archiving from './Archiving';
import { runFullRecalculation } from '../../services/recalculationService';
import { createRepo } from '../../services/repo';

const UserManagement = lazy(() => import('./UserManagement'));
const RoleManagement = lazy(() => import('./RoleManagement'));
const BusinessAuditLog = lazy(() => import('./BusinessAuditLog'));
const BlankManagement = lazy(() => import('./BlankManagement'));
const ProductionCalendarSettings = lazy(() => import('./ProductionCalendarSettings'));
const IntegrityManagement = lazy(() => import('./IntegrityManagement'));

const EXPORT_FORMAT_VERSION = 2;
const APP_VERSION = (import.meta as any)?.env?.VITE_APP_VERSION || undefined;

const BACKUP_KEY = '__backup_before_import__';
const LAST_IMPORT_META_KEY = '__last_import_meta__';
const LAST_EXPORT_META_KEY = '__last_export_meta__';
const UNKNOWN_PREFIX = 'compat:unknown:';

// Keys that should be treated as Singletons (Blob storage), not Repositories
const SINGLETON_KEYS = new Set([
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

// Критические/служебные ключи, которые НИКОГДА не меняем из импорта
const KEY_BLOCKLIST = new Set<string>([
  '__current_user__',
  BACKUP_KEY,
  LAST_IMPORT_META_KEY,
  LAST_EXPORT_META_KEY,
  AUDIT_INDEX_KEY,
  'db_clean_seeded_flag_v6',
]);

// Алиасы ключей между версиями
export const KEY_ALIASES: Record<string, string> = {
  'printPositions_v2': 'printPositions_v4_layout',
  'printPositions_v3_layout': 'printPositions_v4_layout',
  'db_seeded_flag_v4': 'db_clean_seeded_flag_v6',
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
};

// --- DATA ACCESS HELPERS ---

// Helper to determine if we should use Repo (Table) or Storage (Blob)
const isRepoKey = (key: string) => !SINGLETON_KEYS.has(key) && !key.startsWith('compat:') && !key.startsWith('__');

const getDataForKey = async (key: string) => {
    if (isRepoKey(key)) {
        // Use Repo for collection data
        const repo = createRepo(key);
        const result = await repo.list({ pageSize: 999999 });
        return result.data;
    } else {
        // Use Legacy Storage for singletons/settings
        return await loadJSON(key, null);
    }
};

const setDataForKey = async (key: string, data: any) => {
    if (isRepoKey(key)) {
        // Use Repo for collection data
        const repo = createRepo(key);
        // Bulk write logic
        if (Array.isArray(data)) {
            // OPTIMIZATION: Get all existing IDs first to decide between create vs update.
            // repo.list uses caching, so this is efficient.
            const existingItems = (await repo.list({ pageSize: 999999 })).data;
            const existingIds = new Set(existingItems.map((i: any) => i.id));

            // Parallel write is safe here as localforage handles concurrency per instance
            await Promise.all(data.map((item: any) => {
                if (item && item.id) {
                    if (existingIds.has(item.id)) {
                        // Update existing item
                        return repo.update(item.id, item);
                    } else {
                        // Create new item
                        return repo.create(item);
                    }
                }
                return Promise.resolve();
            }));
        }
    } else {
        // Use Legacy Storage
        await saveJSON(key, data);
    }
};

const deleteDataForKey = async (key: string, idsToDelete?: string[]) => {
    if (isRepoKey(key)) {
        const repo = createRepo(key);
        if (idsToDelete && idsToDelete.length > 0) {
            await repo.removeBulk(idsToDelete);
        } else {
            // Clear all not directly supported by repo, list and delete
            const all = await repo.list({ pageSize: 99999 });
            await repo.removeBulk(all.data.map((i: any) => i.id));
        }
    } else {
        await removeKey(key);
    }
};


type AdminTab = 'settings' | 'users' | 'roles' | 'blanks' | 'calendar' | 'archiving' | 'integrity' | 'import_audit' | 'business_audit' | 'diag';

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
  return {
    meta: {
      app: 'waybill-app',
      formatVersion: 1, 
      createdAt: new Date().toISOString(),
    },
    data: parsed || {},
  };
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
    backup[key] = await getDataForKey(key);
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
      await setDataForKey(k, v);
    }
  }
}

// ... validation functions ... (kept as is)
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
  } catch {}

  let shape = dbAny?.shape;
  if (!shape && dbAny?._def?.schema?.shape) {
      shape = dbAny._def.schema.shape;
  } else if (!shape && dbAny?._def?.shape) {
      shape = dbAny._def.shape;
  }

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

type KeyCategory = 'dict' | 'docs' | 'other' | 'unknown';
type UpdateMode = 'skip' | 'overwrite' | 'merge';
type ImportAction = { enabled: boolean; insertNew: boolean; updateMode: UpdateMode; deleteMissing: boolean; };

type ImportSubItem = {
    id: string | number;
    label: string;
    status: 'new' | 'update' | 'same';
    selected: boolean;
    data: any; 
};

type ImportRow = {
  key: string;
  category: KeyCategory;
  known: boolean;
  incoming: unknown;
  action: ImportAction;
  stats?: {
    existingCount: number;
    incomingCount: number;
    newCount: number;
    updateCount: number;
  };
  subItems?: ImportSubItem[];
  isExpanded?: boolean;
};

function prettifyKey(key: string) {
  const map: Record<string, string> = {
    [DB_KEYS.WAYBILLS]: 'Путевые листы',
    [DB_KEYS.VEHICLES]: 'Транспорт',
    [DB_KEYS.EMPLOYEES]: 'Сотрудники',
    [DB_KEYS.ORGANIZATIONS]: 'Организации',
    [DB_KEYS.FUEL_TYPES]: 'Типы топлива',
    [DB_KEYS.SAVED_ROUTES]: 'Маршруты (справочник)',
    [DB_KEYS.SEASON_SETTINGS]: 'Настройки сезонов',
    [DB_KEYS.PRINT_POSITIONS]: 'Настройки печати',
    [DB_KEYS.APP_SETTINGS]: 'Общие настройки',
    [DB_KEYS.GARAGE_STOCK_ITEMS]: 'Склад: Номенклатура',
    [DB_KEYS.STOCK_TRANSACTIONS]: 'Склад: Движение',
    [DB_KEYS.WAYBILL_BLANK_BATCHES]: 'Бланки: Пачки',
    [DB_KEYS.WAYBILL_BLANKS]: 'Бланки: Список',
    [DB_KEYS.TIRES]: 'Учет шин',
    [DB_KEYS.USERS]: 'Пользователи (системные)',
    [DB_KEYS.ROLE_POLICIES]: 'Роли и Права',
    [DB_KEYS.BUSINESS_AUDIT]: 'Бизнес-аудит',
    [DB_KEYS.STORAGES]: 'Места хранения',
    [DB_KEYS.PRINT_EDITOR_PREFS]: 'Настройки печати (координаты)',
    [DB_KEYS.CALENDAR_EVENTS]: 'Производственный календарь',
    [DB_KEYS.FUEL_CARD_SCHEDULES]: 'Автопополнение (Расписание)',
    [DB_KEYS.PERIOD_LOCKS]: 'Блокировки периодов',
    
    // UI State Keys
    'dashboard_filters_v1': 'Фильтры дашборда',
    'waybill_journal_settings_v3': 'Фильтры журнала ПЛ',
    'orgManagement_collapsedSections': 'UI: Организации (блоки)',
    'employeeList_collapsedSections': 'UI: Сотрудники (блоки)',
    'vehicleList_collapsedSections': 'UI: Транспорт (блоки)',
    'waybillDetail_collapsedSections': 'UI: ПЛ (блоки)',
    [AUDIT_INDEX_KEY]: 'Журнал импорта',
  };
  return map[key] || key;
}

// ... [The rest of the file remains largely the same until the render logic]

// ... [Existing helper functions: deepMerge, mergeEntitiesArray, uniqPrimitives, analyzeCounts, isRowAllowedByPolicy, inspectKeyCount, classNames, useAsync] ...
// I am truncating unchanged helper functions for brevity as requested by the prompt style, but in a real implementation, I would include them or import them if refactored.
// Assuming the helpers are present. I will include the TabButton and render logic updates below.

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

type ImportPolicy = {
  allowCategories: Set<KeyCategory> | null; 
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

type KeyInfo = { key: string; category: KeyCategory; display: string; count: number; };
async function inspectKeyCount(key: string): Promise<number> {
  try {
    const val = await getDataForKey(key);
    if (Array.isArray(val)) return val.length;
    if (val && typeof val === 'object') return Object.keys(val as any).length;
    return val == null ? 0 : 1;
  } catch { return 0; }
}
function classNames(...cls: (string | false | undefined)[]) { return cls.filter(Boolean).join(' '); }
function SectionHeader({ title }: { title: string }) { return <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-4 mb-2 font-bold">{title}</div>; }
function useAsync<T>(fn: () => Promise<T>, deps: any[]) {
  const [state, setState] = useState<{ loading: boolean; error?: any; value?: T }>({ loading: true });
  useEffect(() => {
    let alive = true;
    setState({ loading: true });
    fn().then((value) => alive && setState({ loading: false, value })).catch((error) => alive && setState({ loading: false, error }));
    return () => { alive = false; };
  }, deps); 
  return state;
}

// ... [SelectiveClearModal, ExportModal, ImportPreviewModal - kept from original file] ... 
// Since they are large and unchanged, I'm omitting them in this diff block for brevity, but in the final output, they would be present.
// For the purpose of this task, I will include the TabButton and Admin component rendering updates.

// (Assuming SelectiveClearModal, ExportModal, ImportPreviewModal code is here as in previous version)
const DATA_GROUPS = [
    {
        id: 'docs', label: 'Документы', icon: <DocumentTextIcon className="w-5 h-5" />,
        keys: [DB_KEYS.WAYBILLS]
    },
    {
        id: 'dicts', label: 'Справочники', icon: <BookOpenIcon className="w-5 h-5" />,
        keys: [
            DB_KEYS.EMPLOYEES, 
            DB_KEYS.VEHICLES, 
            DB_KEYS.ORGANIZATIONS, 
            DB_KEYS.FUEL_TYPES, 
            DB_KEYS.SAVED_ROUTES, 
            DB_KEYS.CALENDAR_EVENTS,
            DB_KEYS.FUEL_CARD_SCHEDULES,
            DB_KEYS.STORAGES
        ]
    },
    {
        id: 'blanks', label: 'Бланки', icon: <ArchiveBoxIcon className="w-5 h-5" />,
        keys: [DB_KEYS.WAYBILL_BLANK_BATCHES, DB_KEYS.WAYBILL_BLANKS]
    },
    {
        id: 'stock', label: 'Склад', icon: <ArchiveBoxIcon className="w-5 h-5" />,
        keys: [DB_KEYS.GARAGE_STOCK_ITEMS, DB_KEYS.STOCK_TRANSACTIONS, DB_KEYS.TIRES]
    },
    {
        id: 'settings', label: 'Настройки', icon: <CogIcon className="w-5 h-5" />,
        keys: [DB_KEYS.APP_SETTINGS, DB_KEYS.SEASON_SETTINGS, DB_KEYS.PRINT_POSITIONS, DB_KEYS.PRINT_EDITOR_PREFS, DB_KEYS.ROLE_POLICIES, DB_KEYS.USERS]
    },
    {
        id: 'logs', label: 'Журналы', icon: <ClipboardCheckIcon className="w-5 h-5" />,
        keys: [DB_KEYS.BUSINESS_AUDIT, AUDIT_INDEX_KEY, DB_KEYS.PERIOD_LOCKS] // Added PERIOD_LOCKS to logs group
    }
];

const getItemLabel = (item: any, key: string): string => {
    if (!item) return 'Unknown';
    if (key === DB_KEYS.WAYBILLS) return `№${item.number} от ${item.date}`;
    if (key === DB_KEYS.EMPLOYEES) return item.shortName || item.fullName;
    if (key === DB_KEYS.VEHICLES) return `${item.plateNumber} (${item.brand})`;
    if (key === DB_KEYS.ORGANIZATIONS) return item.shortName;
    if (key === DB_KEYS.FUEL_TYPES) return item.name;
    if (key === DB_KEYS.SAVED_ROUTES) return `${item.from} -> ${item.to}`;
    if (key === DB_KEYS.WAYBILL_BLANKS) return `${item.series} ${item.number}`;
    if (key === DB_KEYS.GARAGE_STOCK_ITEMS) return item.name;
    if (key === DB_KEYS.STOCK_TRANSACTIONS) return `${item.type === 'income' ? 'Приход' : 'Расход'} №${item.docNumber} от ${item.date}`;
    if (key === DB_KEYS.TIRES) return `${item.brand} ${item.model} (${item.size})`;
    if (key === DB_KEYS.PERIOD_LOCKS) return `Блок периода ${item.period}`;
    if (item.name) return item.name;
    if (item.id) return item.id;
    return 'Record';
};

const SelectiveClearModal: React.FC<{ onClose: () => void; onConfirm: (selections: Record<string, Set<string>>) => void }> = ({ onClose, onConfirm }) => {
    // (Implementation as before, relies on DATA_GROUPS)
    // ... [Code of SelectiveClearModal] ...
    // For brevity, assuming it exists unchanged from previous file state
    const [dataMap, setDataMap] = useState<Record<string, any[]>>({});
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [selections, setSelections] = useState<Record<string, Set<string>>>({});
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['docs']));
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadAll = async () => {
            const newCounts: Record<string, number> = {};
            const newDataMap: Record<string, any[]> = {};
            
            const allKeys = DATA_GROUPS.flatMap(g => g.keys);
            
            for (const key of allKeys) {
                try {
                    const val = await getDataForKey(key);
                    if (Array.isArray(val)) {
                        newCounts[key] = val.length;
                        newDataMap[key] = val;
                    } else if (val && typeof val === 'object') {
                        newCounts[key] = 1;
                        newDataMap[key] = [val];
                    } else {
                        newCounts[key] = 0;
                        newDataMap[key] = [];
                    }
                } catch {
                    newCounts[key] = 0;
                    newDataMap[key] = [];
                }
            }
            setCounts(newCounts);
            setDataMap(newDataMap);
            setLoading(false);
        };
        loadAll();
    }, []);

    const toggleGroup = (groupId: string, keys: string[], checked: boolean) => {
        const newSelections = { ...selections };
        keys.forEach(key => {
            if (checked) {
                const allIds = dataMap[key]?.map((item: any) => item.id || 'single') || [];
                newSelections[key] = new Set(allIds);
            } else {
                delete newSelections[key];
            }
        });
        setSelections(newSelections);
    };

    const toggleKey = (key: string, checked: boolean) => {
        const newSelections = { ...selections };
        if (checked) {
            const allIds = dataMap[key]?.map((item: any) => item.id || 'single') || [];
            newSelections[key] = new Set(allIds);
        } else {
            delete newSelections[key];
        }
        setSelections(newSelections);
    };

    const toggleItem = (key: string, id: string, checked: boolean) => {
        const newSelections = { ...selections };
        if (!newSelections[key]) newSelections[key] = new Set();
        
        if (checked) newSelections[key].add(id);
        else newSelections[key].delete(id);
        
        if (newSelections[key].size === 0) delete newSelections[key];
        setSelections(newSelections);
    };

    const toggleExpandGroup = (groupId: string) => {
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(groupId)) newExpanded.delete(groupId);
        else newExpanded.add(groupId);
        setExpandedGroups(newExpanded);
    };

    const toggleExpandKey = (key: string) => {
        const newExpanded = new Set(expandedKeys);
        if (newExpanded.has(key)) newExpanded.delete(key);
        else newExpanded.add(key);
        setExpandedKeys(newExpanded);
    };

    const totalSelectedCount = Object.values(selections).reduce((sum: number, set) => sum + (set as Set<string>).size, 0);

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 shrink-0">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-500">
                        <TrashIcon className="h-6 w-6" />
                        <h3 className="text-lg font-bold">Выборочное удаление данных</h3>
                    </div>
                    <button onClick={onClose}><XIcon className="h-5 w-5 text-gray-500" /></button>
                </div>

                <div className="p-4 overflow-y-auto flex-1 bg-gray-50 dark:bg-gray-900/50">
                    {loading ? (
                        <div className="text-center p-8 text-gray-500">Анализ данных...</div>
                    ) : (
                        <div className="space-y-4">
                            {DATA_GROUPS.map(group => {
                                const groupKeys = group.keys;
                                const groupTotal = groupKeys.reduce((sum, k) => sum + (counts[k] || 0), 0);
                                
                                let totalSelectedInGroup = 0;
                                let isAllGroupSelected = true;
                                groupKeys.forEach(k => {
                                    const selectedCount = selections[k]?.size || 0;
                                    const totalCount = counts[k] || 0;
                                    totalSelectedInGroup += selectedCount;
                                    if (selectedCount !== totalCount || totalCount === 0) isAllGroupSelected = false;
                                });
                                
                                if (groupTotal === 0) isAllGroupSelected = false;

                                const isGroupIndeterminate = totalSelectedInGroup > 0 && !isAllGroupSelected;
                                const isGroupExpanded = expandedGroups.has(group.id);

                                return (
                                    <div key={group.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                                        <div className="flex items-center justify-between p-3 bg-gray-100/50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <button 
                                                    onClick={() => toggleExpandGroup(group.id)}
                                                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500"
                                                >
                                                    {isGroupExpanded ? <ArrowUpIcon className="h-4 w-4"/> : <ArrowDownIcon className="h-4 w-4"/>}
                                                </button>
                                                <input 
                                                    type="checkbox" 
                                                    checked={isAllGroupSelected}
                                                    ref={input => { if (input) input.indeterminate = isGroupIndeterminate; }}
                                                    onChange={(e) => toggleGroup(group.id, groupKeys, e.target.checked)}
                                                    disabled={groupTotal === 0}
                                                    className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer disabled:opacity-50"
                                                />
                                                <div className="flex items-center gap-2 font-medium text-gray-800 dark:text-gray-200">
                                                    {group.icon}
                                                    {group.label}
                                                </div>
                                            </div>
                                            <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                                                {totalSelectedInGroup > 0 ? <span className="text-red-600">{totalSelectedInGroup} / {groupTotal}</span> : groupTotal}
                                            </span>
                                        </div>
                                        
                                        {isGroupExpanded && (
                                            <div className="divide-y dark:divide-gray-700 border-t dark:border-gray-700 pl-4">
                                                {groupKeys.map(key => {
                                                    const keyTotal = counts[key] || 0;
                                                    const keySelected = selections[key]?.size || 0;
                                                    const isKeyAllSelected = keyTotal > 0 && keySelected === keyTotal;
                                                    const isKeyIndeterminate = keySelected > 0 && !isKeyAllSelected;
                                                    const isKeyExpanded = expandedKeys.has(key);
                                                    const items = dataMap[key] || [];
                                                    const isArray = items.length > 0 && (items.length > 1 || (items[0] && items[0].id));

                                                    return (
                                                        <div key={key}>
                                                            <div className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                                                <div className="flex items-center gap-3">
                                                                    {isArray ? (
                                                                        <button 
                                                                            onClick={() => toggleExpandKey(key)}
                                                                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500"
                                                                        >
                                                                            {isKeyExpanded ? <ArrowUpIcon className="h-4 w-4"/> : <ArrowDownIcon className="h-4 w-4"/>}
                                                                        </button>
                                                                    ) : <div className="w-6"></div>}
                                                                    
                                                                    <input 
                                                                        type="checkbox" 
                                                                        checked={isKeyAllSelected}
                                                                        ref={input => { if (input) input.indeterminate = isKeyIndeterminate; }}
                                                                        onChange={(e) => toggleKey(key, e.target.checked)}
                                                                        disabled={keyTotal === 0}
                                                                        className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer disabled:opacity-50"
                                                                    />
                                                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                                                        {prettifyKey(key)}
                                                                    </span>
                                                                </div>
                                                                <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300">
                                                                    {keySelected > 0 ? `${keySelected} / ${keyTotal}` : keyTotal}
                                                                </span>
                                                            </div>

                                                            {isKeyExpanded && isArray && (
                                                                <div className="pl-12 pr-4 pb-2 text-xs max-h-60 overflow-y-auto border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20">
                                                                    {items.map((item: any, idx) => (
                                                                        <label key={item.id || idx} className="flex items-center gap-2 py-1.5 hover:bg-red-50 dark:hover:bg-red-900/10 cursor-pointer rounded px-2">
                                                                            <input 
                                                                                type="checkbox"
                                                                                checked={selections[key]?.has(item.id || 'single')}
                                                                                onChange={(e) => toggleItem(key, item.id || 'single', e.target.checked)}
                                                                                className="h-3.5 w-3.5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                                                            />
                                                                            <span className="text-gray-600 dark:text-gray-400 truncate">
                                                                                {getItemLabel(item, key)}
                                                                            </span>
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 shrink-0">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        Выбрано записей: <b>{totalSelectedCount}</b>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Отмена</button>
                        <button 
                            onClick={() => onConfirm(selections)} 
                            disabled={totalSelectedCount === 0}
                            className="px-6 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <TrashIcon className="h-5 w-5" />
                            Удалить выбранное
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ExportModal: React.FC<{ onClose: () => void; onConfirm: (selectedKeys: string[]) => void; }> = ({ onClose, onConfirm }) => {
    // (Existing ExportModal logic)
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [showUnknown, setShowUnknown] = useState(false);
    
    const { loading, value: items } = useAsync(async () => {
        const rawKeys = (await storageKeys()).filter(k => !k.startsWith(AUDIT_CHUNK_PREFIX)); 
        const knownKeys = Object.values(DB_KEYS);
        const combinedSet = new Set([...rawKeys, ...knownKeys]);
        
        const infos: KeyInfo[] = [];
        for (const key of combinedSet) {
            if (KEY_BLOCKLIST.has(key)) continue;
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

    const categoriesToShow: KeyCategory[] = ['docs', 'dict', 'other'];
    if (showUnknown) categoriesToShow.push('unknown');

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 shrink-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Экспорт данных (выборочно)</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"><XIcon className="h-5 w-5" /></button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1">
            {loading && <div className="text-center text-gray-500 p-4">Сканирование хранилища...</div>}
            
            {!loading && (<>
                <div className="flex items-center justify-between gap-2 mb-4 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                    <div className="flex gap-2">
                        <button className="px-3 py-1.5 text-xs font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 dark:bg-gray-600 dark:border-gray-500 dark:text-gray-200 dark:hover:bg-gray-50 transition-colors shadow-sm" onClick={() => toggleAll((items || []).map((i) => i.key), true)}>Выбрать всё</button>
                        <button className="px-3 py-1.5 text-xs font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 dark:bg-gray-600 dark:border-gray-500 dark:text-gray-200 dark:hover:bg-gray-50 transition-colors shadow-sm" onClick={() => toggleAll((items || []).map((i) => i.key), false)}>Снять выделение</button>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                        <input type="checkbox" checked={showUnknown} onChange={e => setShowUnknown(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500" />
                        Показать системные
                    </label>
                </div>

                {categoriesToShow.map((cat) => {
                    const list = grouped[cat] || [];
                    if (!list.length) return null;
                    const titleMap: Record<string, string> = { dict: 'Справочники', docs: 'Документы', other: 'Прочее', unknown: 'Системные / Неизвестные' };
                    return (
                    <div key={cat} className="mb-6">
                        <SectionHeader title={titleMap[cat] || cat} />
                        <div className="divide-y dark:divide-gray-700 border dark:border-gray-700 rounded-lg overflow-hidden">
                        {list.map((it) => (
                            <label key={it.key} className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer bg-white dark:bg-gray-800">
                            <div className="flex items-center gap-3">
                                <input 
                                    type="checkbox" 
                                    checked={!!selected[it.key]} 
                                    onChange={(e) => setSelected((s) => ({ ...s, [it.key]: e.target.checked }))}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <div>
                                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{it.display}</div>
                                    <div className="text-xs text-gray-400 font-mono">{it.key}</div>
                                </div>
                            </div>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                {it.count}
                            </span>
                            </label>
                        ))}
                        </div>
                    </div>
                    );
                })}
                </>
            )}
            </div>
            <div className="p-4 border-t dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800 shrink-0">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-600 font-medium transition-colors">Отмена</button>
            <button onClick={handleConfirm} className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed font-medium shadow-sm transition-colors" disabled={!Object.values(selected).some(Boolean)}>Экспортировать</button>
            </div>
        </div>
        </div>
    );
};

// ... [ImportPreviewModal - also kept existing] ...
const ImportPreviewModal: React.FC<{
  bundle: ExportBundle;
  policy: ImportPolicy;
  onClose: () => void;
  onApply: (rows: ImportRow[]) => void;
}> = ({ bundle, policy, onClose, onApply }) => {
    // (Existing ImportPreviewModal code)
    const [rows, setRows] = useState<ImportRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [showUnknown, setShowUnknown] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
        const allKeys = Object.keys(bundle.data);
        const computed: ImportRow[] = [];
        const knownSet = new Set(Object.values(DB_KEYS) as string[]);
        
        const currentDataPromises = allKeys.map(k => getDataForKey(k));
        const currentDataValues = await Promise.all(currentDataPromises);

        for (let i = 0; i < allKeys.length; i++) {
            const k = allKeys[i];
            const known = knownSet.has(k);
            const cat = inferCategoryByKeyName(k);
            const inc = bundle.data[k];
            const current = currentDataValues[i];
            const stats = analyzeCounts(current, inc);
            let mode: UpdateMode = 'skip';
            if (policy.allowedModes.has('merge')) mode = 'merge';
            else if (policy.allowedModes.has('overwrite')) mode = 'overwrite';

            let subItems: ImportSubItem[] | undefined;
            if (isEntityArray(inc)) {
                const incArr = inc as any[];
                const baseArr = Array.isArray(current) ? current as any[] : [];
                const idField = entityIdField(incArr) || 'id';
                const baseMap = new Map(baseArr.map(e => [e[idField], e]));

                subItems = incArr.map(item => {
                    const id = item[idField];
                    const exists = baseMap.has(id);
                    let status: 'new' | 'update' | 'same' = exists ? 'update' : 'new';
                    if (exists && JSON.stringify(item) === JSON.stringify(baseMap.get(id))) {
                        status = 'same';
                    }
                    let label = makeLabel(item);
                    if (k === DB_KEYS.BUSINESS_AUDIT) {
                        const type = item.type || 'Событие';
                        const at = item.at ? new Date(item.at).toLocaleString('ru-RU') : '';
                        label = `${type} (${at})`;
                    } else if (!label) {
                        if (item.docNumber) label = `№${item.docNumber}`;
                        else if (item.series && item.number) label = `${item.series} ${item.number}`;
                    }
                    return { id, label: label || '—', status, selected: true, data: item };
                });
            }

            const row: ImportRow = {
                key: k, category: cat, known, incoming: inc,
                action: { enabled: true, insertNew: true, updateMode: mode, deleteMissing: false },
                stats, subItems, isExpanded: false
            };
            if (!isRowAllowedByPolicy(row, policy)) row.action.enabled = false;
            computed.push(row);
        }
        if (alive) { setRows(computed); setLoading(false); }
        })();
        return () => { alive = false; };
    }, [bundle, policy]);

    const handleApply = () => onApply(rows);
    const updateRow = (index: number, patch: Partial<ImportAction> | { isExpanded?: boolean }) => {
        setRows(prev => {
            const next = [...prev];
            const updatedRow = { ...next[index] };
            if ('isExpanded' in patch) updatedRow.isExpanded = patch.isExpanded;
            else updatedRow.action = { ...updatedRow.action, ...patch };
            next[index] = updatedRow;
            return next;
        });
    };
    const toggleAllSubItems = (rowIndex: number, checked: boolean) => {
        setRows(prev => {
            const next = [...prev];
            const row = { ...next[rowIndex] };
            if (row.subItems) {
                row.subItems = row.subItems.map(si => ({ ...si, selected: checked }));
                row.action = { ...row.action, enabled: checked };
            }
            next[rowIndex] = row;
            return next;
        });
    };
    const toggleSubItem = (rowIndex: number, subItemIndex: number, checked: boolean) => {
        setRows(prev => {
            const next = [...prev];
            const row = { ...next[rowIndex] };
            if (row.subItems) {
                const newSubs = [...row.subItems];
                newSubs[subItemIndex] = { ...newSubs[subItemIndex], selected: checked };
                row.subItems = newSubs;
                if (checked && !row.action.enabled) row.action = { ...row.action, enabled: true };
            }
            next[rowIndex] = row;
            return next;
        });
    };
    const visibleRows = useMemo(() => rows.filter(r => showUnknown || r.category !== 'unknown'), [rows, showUnknown]);

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
            <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Предпросмотр импорта</h3>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={showUnknown} onChange={e => setShowUnknown(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500" />
                    Показать системные/неизвестные
                </label>
            </div>
            <button onClick={onClose}><XIcon className="h-5 w-5 text-gray-500" /></button>
            </div>
            <div className="flex-1 overflow-auto p-4">
                {loading ? <div className="text-center p-8 text-gray-500">Анализ данных...</div> : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300">
                                <th className="p-3 w-10"></th>
                                <th className="p-3">Раздел</th>
                                <th className="p-3">Категория</th>
                                <th className="p-3">Статистика</th>
                                <th className="p-3 text-center">Выбрать</th>
                                <th className="p-3">Режим слияния</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleRows.map((r) => {
                                const originalIndex = rows.findIndex(or => or.key === r.key);
                                const hasSubItems = r.subItems && r.subItems.length > 0;
                                const isPartiallySelected = hasSubItems && r.subItems!.some(si => si.selected) && !r.subItems!.every(si => si.selected);
                                return (
                                    <React.Fragment key={r.key}>
                                    <tr className={`border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 ${!r.action.enabled ? 'opacity-60' : ''}`}>
                                        <td className="p-3 text-center">
                                            {hasSubItems && (
                                                <button onClick={() => updateRow(originalIndex, { isExpanded: !r.isExpanded })} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500">
                                                    {r.isExpanded ? <ArrowUpIcon className="h-4 w-4"/> : <ArrowDownIcon className="h-4 w-4"/>}
                                                </button>
                                            )}
                                        </td>
                                        <td className="p-3">
                                            <div className="font-medium text-gray-900 dark:text-white">{prettifyKey(r.key)}</div>
                                            <div className="text-xs text-gray-400 font-mono">{r.key}</div>
                                        </td>
                                        <td className="p-3">
                                            <span className={`px-2 py-1 rounded text-xs font-semibold ${r.category === 'dict' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' : r.category === 'docs' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : r.category === 'unknown' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}`}>
                                                {r.category === 'dict' ? 'Справочник' : r.category === 'docs' ? 'Документы' : r.category === 'unknown' ? 'Системное' : 'Прочее'}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            {r.stats && (
                                                <div className="flex flex-col text-xs">
                                                    <span className="text-gray-700 dark:text-gray-300">Всего в файле: <b>{r.stats.incomingCount}</b></span>
                                                    <div className="flex gap-2 mt-1">
                                                        {r.stats.newCount > 0 && <span className="text-green-600 dark:text-green-400">+{r.stats.newCount} новых</span>}
                                                        {r.stats.updateCount > 0 && <span className="text-blue-600 dark:text-blue-400">~{r.stats.updateCount} обнов.</span>}
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3 text-center">
                                            <label className="flex items-center justify-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={r.action.enabled} ref={input => { if (input) input.indeterminate = !!isPartiallySelected; }} onChange={e => hasSubItems ? toggleAllSubItems(originalIndex, e.target.checked) : updateRow(originalIndex, { enabled: e.target.checked })} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                            </label>
                                        </td>
                                        <td className="p-3">
                                            <select value={r.action.updateMode} onChange={e => updateRow(originalIndex, { updateMode: e.target.value as UpdateMode })} disabled={!r.action.enabled} className="p-1.5 border rounded text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 w-full">
                                                {policy.allowedModes.has('merge') && <option value="merge">Объединить (безопасно)</option>}
                                                {policy.allowedModes.has('overwrite') && <option value="overwrite">Перезаписать (полностью)</option>}
                                                {policy.allowedModes.has('skip') && <option value="skip">Только новые (пропустить)</option>}
                                            </select>
                                            {r.action.enabled && policy.allowDeleteMissing && (
                                                <label className="flex items-center gap-2 mt-2 text-xs text-red-600 dark:text-red-400"><input type="checkbox" checked={r.action.deleteMissing} onChange={e => updateRow(originalIndex, { deleteMissing: e.target.checked })} className="rounded border-red-300 text-red-600 focus:ring-red-500"/>Удалить отсутствующие в файле</label>
                                            )}
                                        </td>
                                    </tr>
                                    {r.isExpanded && hasSubItems && (
                                        <tr className="bg-gray-50 dark:bg-gray-900/50"><td colSpan={6} className="p-0"><div className="max-h-60 overflow-y-auto border-b border-gray-200 dark:border-gray-700 px-4 py-2"><table className="w-full text-xs"><thead><tr className="text-gray-500 dark:text-gray-400 border-b dark:border-gray-700"><th className="p-2 text-left w-8"></th><th className="p-2 text-left">Наименование</th><th className="p-2 text-left">ID</th><th className="p-2 text-left">Статус</th></tr></thead><tbody>
                                            {r.subItems!.map((sub, idx) => (
                                                <tr key={sub.id} className="hover:bg-white dark:hover:bg-gray-800 transition-colors">
                                                    <td className="p-2"><input type="checkbox" checked={sub.selected} onChange={e => toggleSubItem(originalIndex, idx, e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"/></td>
                                                    <td className="p-2 font-medium text-gray-800 dark:text-gray-200 text-xs">{sub.label}</td>
                                                    <td className="p-2 font-mono text-gray-500 text-[10px]">{sub.id}</td>
                                                    <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${sub.status === 'new' ? 'bg-green-100 text-green-700' : sub.status === 'update' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{sub.status === 'new' ? 'Новый' : sub.status === 'update' ? 'Обновление' : 'Без изм.'}</span></td>
                                                </tr>
                                            ))}
                                        </tbody></table></div></td></tr>
                                    )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
            <div className="p-4 border-t dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800 shrink-0">
                <button onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Отмена</button>
                <button onClick={handleApply} disabled={loading} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-md disabled:opacity-50">Импортировать выбранное</button>
            </div>
        </div>
        </div>
    );
};

const Admin: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('settings');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [importBundle, setImportBundle] = useState<ExportBundle | null>(null);
  const [isClearDataModalOpen, setIsClearDataModalOpen] = useState(false);
  const [isSelectiveClearModalOpen, setIsSelectiveClearModalOpen] = useState(false);
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
    fetch('context-pack.skeleton.json')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => setSkel(data))
      .catch(error => {
        console.error("Could not load context pack skeleton file:", error);
      });
  }, [showToast]);

  const canImportFull = can('import.run');
  const canImportLimited = can('import.limited');
  const canExport = can('export.run');

  const importPolicy = useMemo(() => {
    if (canImportFull) return ADMIN_IMPORT_POLICY;
    if (canImportLimited) return USER_IMPORT_POLICY;
    return null;
  }, [canImportFull, canImportLimited]);

  // ... [Export/Import handlers kept as is] ...
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

  const handleExportConfirm = async (selectedKeys: string[], preloadedData?: Record<string, unknown>) => {
    setShowExportModal(false);
    setIsExporting(true);
  
    try {
      const keysToExport = await getKeysToExport(selectedKeys);
      const data: Record<string, unknown> = {};
  
      if (preloadedData) {
        for (const key of keysToExport) {
          data[key] = preloadedData[key];
        }
      } else {
        for (const key of keysToExport) {
          data[key] = await getDataForKey(key);
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
    // (Implementation similar to before, handles backup, merge/overwrite, audit logging)
    // For brevity in this diff, assuming correct implementation is retained.
    // ...
    // NOTE: This function is critical, ensure it is fully present in final file.
    // I am including it fully here to be safe.
    try {
      const knownSet = new Set(Object.values(DB_KEYS) as string[]);
  
      const safeRows = rows
        .map((r) => {
            const sanitized = { ...r, known: knownSet.has(r.key) };
            if (!isRowAllowedByPolicy(sanitized, policy)) {
                sanitized.action.enabled = false;
            }
            return sanitized;
        })
        .filter((r) => r.action.enabled);
  
      if (!safeRows.length) return;
  
      const selectedKeys = safeRows.map((r) => r.key);
      await backupCurrent(selectedKeys);
  
      const candidate: Record<string, unknown> = {};
      const unknown: Record<string, unknown> = {};
  
      for (const row of safeRows) {
        const { key, incoming, action, subItems } = row;
        if (KEY_BLOCKLIST.has(key)) continue;
  
        const existing = await getDataForKey(key);
        let toWrite: unknown = null;
        
        let effectiveIncoming = incoming;

        if (subItems && isEntityArray(incoming)) {
            const selectedSubItems = subItems.filter(si => si.selected);
            effectiveIncoming = selectedSubItems.map(si => si.data);
        }

        if (isEntityArray(existing) || isEntityArray(effectiveIncoming)) {
          toWrite = mergeEntitiesArray(
            (existing as any[]) || [],
            (effectiveIncoming as any[]) || [],
            action.updateMode,
            action.insertNew,
            action.deleteMissing
          );
        } else if (Array.isArray(existing) && Array.isArray(effectiveIncoming)) {
          if (action.updateMode === 'skip') {
            toWrite = existing;
          } else if (action.updateMode === 'overwrite' || action.deleteMissing) {
            toWrite = effectiveIncoming;
          } else {
            toWrite = uniqPrimitives([...(existing as any[]), ...(effectiveIncoming as any[])]);
          }
        } else if (existing && typeof existing === 'object' && effectiveIncoming && typeof effectiveIncoming === 'object') {
          if (action.updateMode === 'skip') {
            toWrite = existing;
          } else if (action.updateMode === 'overwrite' || action.deleteMissing) {
            toWrite = effectiveIncoming;
          } else {
            toWrite = deepMerge(existing, effectiveIncoming);
          }
        } else {
          if (existing == null) {
            toWrite = action.insertNew ? effectiveIncoming : existing;
          } else {
            toWrite = action.updateMode === 'skip' ? existing : effectiveIncoming;
          }
        }
  
        if (knownSet.has(key)) {
          candidate[key] = toWrite;
        } else {
          unknown[key] = toWrite;
        }
      }
  
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
  
      for (const row of safeRows) {
        const { key } = row;
        if (KEY_BLOCKLIST.has(key)) continue;
  
        const isKnown = knownSet.has(key);
        const storageKey = isKnown ? key : `${UNKNOWN_PREFIX}${key}`;
        const raw = isKnown ? candidate[key] : unknown[key];
        const safe = isKnown && key in validated ? validated[key] : raw;
  
        // DELETE missing items if needed (Sync mode)
        if (isRepoKey(key) && row.action.deleteMissing) {
             const existing = await getDataForKey(key);
             if (Array.isArray(existing) && Array.isArray(safe)) {
                 const newIds = new Set(safe.map((i: any) => i.id));
                 const toDelete = existing.filter((i: any) => !newIds.has(i.id)).map((i: any) => i.id);
                 if (toDelete.length > 0) {
                     await deleteDataForKey(key, toDelete);
                 }
             }
        }

        // WRITE updated/new items
        await setDataForKey(storageKey, safe);
      }
  
      try {
        const items: ImportAuditItem[] = [];
        const backup = await loadJSON<any>(BACKUP_KEY, null);
        const beforeMap: Record<string, any> = backup?.data || {};
  
        const employees = await getDataForKey(DB_KEYS.EMPLOYEES) as Employee[];
        const vehicles = await getDataForKey(DB_KEYS.VEHICLES) as Vehicle[];
        const orgs = await getDataForKey(DB_KEYS.ORGANIZATIONS) as Organization[];
  
        const byId = {
          emp: new Map<string, Employee>(employees.map((e) => [e.id, e])),
          veh: new Map<string, Vehicle>(vehicles.map((v) => [v.id, v])),
          org: new Map<string, Organization>(orgs.map((o) => [o.id, o])),
        };
  
        for (const row of safeRows) {
          const { key, incoming, action, subItems } = row;
          const storageKey = knownSet.has(key) ? key : `${UNKNOWN_PREFIX}${key}`;
          const category = knownSet.has(key) ? inferCategoryByKeyName(key) : 'unknown';
  
          const beforeVal = beforeMap[storageKey];
          const afterVal = await getDataForKey(storageKey);
  
          let effectiveIncoming = incoming;
          if (subItems && isEntityArray(incoming)) {
             effectiveIncoming = subItems.filter(si => si.selected).map(si => si.data);
          }

          if (isEntityArray(effectiveIncoming) || isEntityArray(beforeVal) || isEntityArray(afterVal)) {
            const base: any[] = Array.isArray(beforeVal) ? beforeVal : [];
            const inc: any[] = Array.isArray(effectiveIncoming) ? effectiveIncoming : [];
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
        showToast('Импорт завершен.', 'success');
        showToast('Рекомендуется выполнить пересчет итогов для актуализации остатков.', 'info', {
            label: 'Пересчитать данные',
            onClick: async () => {
                showToast('Начат полный пересчет данных...', 'info');
                try {
                    await runFullRecalculation();
                    showToast('Пересчет завершен. Перезагрузка страницы...', 'success');
                    setTimeout(() => window.location.reload(), 1500);
                } catch (e) {
                    showToast('Ошибка пересчета: ' + (e as Error).message, 'error');
                }
            }
        });
    }
  };

  const handleClearAllData = async () => {
    setIsClearDataModalOpen(false);
    setIsImporting(true);
    try {
        await storageClear();
        // Also clear Repositories explicitly (as they are in different stores)
        const keys = Object.values(DB_KEYS);
        for(const k of keys) {
            if (isRepoKey(k)) await deleteDataForKey(k);
        }

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

  const handleSelectiveClear = async (selections: Record<string, Set<string>>) => {
      setIsSelectiveClearModalOpen(false);
      setIsImporting(true);
      try {
          let totalDeleted = 0;
          const keys = Object.keys(selections);

          for (const key of keys) {
              const selectedIds = selections[key];
              
              if (key === AUDIT_INDEX_KEY) {
                  if (selectedIds.size > 0) { 
                      const idx = await loadJSON<any[]>(AUDIT_INDEX_KEY, []);
                      const events = Array.isArray(idx) ? idx : [];
                      for (const ev of events) {
                          const ks: string[] = ev?.chunk?.keys || [];
                          await Promise.all(ks.map((k: string) => removeKey(k)));
                      }
                      await removeKey(AUDIT_INDEX_KEY);
                      totalDeleted++;
                  }
                  continue;
              }

              const currentData = await getDataForKey(key);
              
              if (Array.isArray(currentData)) {
                  const totalCount = currentData.length;
                  
                  if (selectedIds.size >= totalCount) {
                      await deleteDataForKey(key);
                      totalDeleted += totalCount;
                  } else {
                      // Partial deletion
                      const idsArray = Array.from(selectedIds);
                      if (isRepoKey(key)) {
                          const repo = createRepo(key);
                          await repo.removeBulk(idsArray);
                      } else {
                          // Fallback for array in storage (legacy)
                          const newData = currentData.filter((item: any) => !selectedIds.has(item.id));
                          await saveJSON(key, newData);
                      }
                      totalDeleted += selectedIds.size;
                  }
              } else {
                  await removeKey(key);
                  totalDeleted++;
              }
          }
          
          showToast(`Удалено ${totalDeleted} записей. Перезагрузка...`, 'success');
          setTimeout(() => {
              window.location.reload();
          }, 1500);
      } catch (error) {
          console.error("Failed to clear selected data:", error);
          showToast('Ошибка при удалении.', 'error');
          setIsImporting(false);
      }
  };
  
  const TabButton = ({ tab, label }: { tab: AdminTab; label: string }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={classNames(
        'px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap',
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
      case 'settings': return <AppSettingsComponent />;
      case 'users': return <Suspense fallback={<div>...</div>}><UserManagement /></Suspense>;
      case 'roles': return <Suspense fallback={<div>...</div>}><RoleManagement /></Suspense>;
      case 'blanks': return <Suspense fallback={<div>...</div>}><BlankManagement /></Suspense>;
      case 'calendar': return <Suspense fallback={<div>...</div>}><ProductionCalendarSettings /></Suspense>;
      case 'archiving': return <Archiving />;
      case 'integrity': return <Suspense fallback={<div>...</div>}><IntegrityManagement /></Suspense>;
      case 'import_audit': return <ImportAuditLog />;
      case 'business_audit': return <Suspense fallback={<div>...</div>}><BusinessAuditLog /></Suspense>;
      case 'diag': return <Diagnostics />;
      default: return null;
    }
  };
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
      <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".json" className="hidden" />
      {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} onConfirm={(keys) => handleExportConfirm(keys)} />}
      {importBundle && importPolicy && <ImportPreviewModal bundle={importBundle} policy={importPolicy} onClose={() => { setImportBundle(null); setIsImporting(false); }} onApply={(rows) => applySelectiveImport(rows, importPolicy)} />}
      {isSelectiveClearModalOpen && <SelectiveClearModal onClose={() => setIsSelectiveClearModalOpen(false)} onConfirm={handleSelectiveClear} />}
      
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
            <div className="flex space-x-2 p-1 bg-gray-100 dark:bg-gray-900 rounded-lg overflow-x-auto max-w-full">
                <TabButton tab="settings" label="Общие" />
                {can('admin.panel') && <TabButton tab="users" label="Пользователи" />}
                {can('admin.panel') && <TabButton tab="roles" label="Роли" />}
                {can('admin.panel') && <TabButton tab="blanks" label="Бланки ПЛ" />}
                <TabButton tab="calendar" label="Календарь" />
                {can('admin.panel') && <TabButton tab="integrity" label="Целостность" />}
                <TabButton tab="archiving" label="Архивация" />
                {can('audit.business.read') && <TabButton tab="business_audit" label="Бизнес-аудит" />}
                <TabButton tab="import_audit" label="Журнал импорта" />
                {can('admin.panel') && <TabButton tab="diag" label="Диагностика" />}
            </div>
            <button onClick={handleImportClick} disabled={!importPolicy || isImporting} className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:opacity-50"><UploadIcon className="h-5 w-5" />{isImporting ? '...' : 'Импорт'}</button>
            <button onClick={() => (canImportFull ? setShowExportModal(true) : handleExportAllData())} disabled={!canExport || isImporting} className="flex items-center gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-green-700 transition-colors disabled:opacity-50"><DownloadIcon className="h-5 w-5" />{isExporting ? '...' : 'Экспорт'}</button>
            {skel && <ExportContextPackButton packSkeleton={skel} mode="skeleton" />}
        </div>
      </div>
       <div className="overflow-x-auto mt-4">{renderActiveTab()}</div>

        {can('admin.panel') && (
            <div className="mt-8">
                <div className="border-t pt-6 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-red-600 dark:text-red-500">Опасная зона</h3>
                    <div className="mt-4 p-4 border border-red-300 dark:border-red-700 rounded-lg bg-red-50 dark:bg-red-900/10">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                            <div>
                                <p className="font-medium text-gray-800 dark:text-gray-100">Удаление данных</p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Вы можете удалить определенные категории данных или полностью очистить базу приложения. Действия необратимы.</p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setIsSelectiveClearModalOpen(true)}
                                    disabled={isImporting}
                                    className="bg-white dark:bg-gray-800 text-red-600 border border-red-200 dark:border-red-800 font-semibold py-2 px-4 rounded-lg shadow-sm hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                                >
                                    Выборочная очистка
                                </button>
                                <button
                                    onClick={() => setIsClearDataModalOpen(true)}
                                    disabled={isImporting}
                                    className="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-red-700 transition-colors disabled:opacity-50"
                                >
                                    Очистить всё
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default Admin;
