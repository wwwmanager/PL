
import React, { useMemo, useRef, useState, useEffect, lazy } from 'react';
import { storageKeys, storageClear, loadJSON, saveJSON } from '../../services/storage';
import { getAppSettings, saveAppSettings, dumpAllDataForExport } from '../../services/mockApi';
import { DB_KEYS } from '../../services/dbKeys';
import { DownloadIcon, UploadIcon, XIcon, ArrowDownIcon, ArrowUpIcon } from '../Icons';
import { useToast } from '../../hooks/useToast';
import { databaseSchema } from '../../services/schemas';
import ImportAuditLog from './ImportAuditLog';
import Diagnostics from './Diagnostics';
import ExportContextPackButton from './ExportContextPackButton';
import { appendAuditEventChunked, buildParams, uid, isEntityArray, entityIdField, inferCategoryByKeyName, ImportAuditItem, ImportAuditAction, makeLabel, AUDIT_CHUNK_PREFIX, AUDIT_INDEX_KEY } from '../../services/auditLog';
import { useAuth } from '../../services/auth';
import { Waybill, Employee, Vehicle, Organization, AppSettings, DashboardWidgetsSettings } from '../../types';
import ConfirmationModal from '../shared/ConfirmationModal';

const UserManagement = lazy(() => import('./UserManagement'));
const RoleManagement = lazy(() => import('./RoleManagement'));
const BusinessAuditLog = lazy(() => import('./BusinessAuditLog'));
const BlankManagement = lazy(() => import('./BlankManagement'));

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

// Миграции формата
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
  return {
    meta: {
      app: 'waybill-app',
      formatVersion: 1, // старый формат
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

  // Improved shape extraction
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
        if (res.success) {
            ok[k] = res.data;
        } else {
            skipped.push(k);
        }
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

type ImportSubItem = {
    id: string | number;
    label: string;
    status: 'new' | 'update' | 'same';
    selected: boolean;
    data: any; // Raw object for import
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
    
    // UI State Keys
    'dashboard_filters_v1': 'Фильтры дашборда',
    'waybill_journal_settings_v3': 'Фильтры журнала ПЛ',
    'orgManagement_collapsedSections': 'UI: Организации (блоки)',
    'employeeList_collapsedSections': 'UI: Сотрудники (блоки)',
    'vehicleList_collapsedSections': 'UI: Транспорт (блоки)',
    'waybillDetail_collapsedSections': 'UI: ПЛ (блоки)',
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
function SectionHeader({ title }: { title: string }) { return <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-4 mb-2 font-bold">{title}</div>; }
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
  const [showUnknown, setShowUnknown] = useState(false);
  
  const { loading, value: items } = useAsync(async () => {
    const keys = (await storageKeys()).filter(k => !k.startsWith(AUDIT_CHUNK_PREFIX)); // Ignore audit chunks
    const infos: KeyInfo[] = [];
    for (const key of keys) {
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
                    <button className="px-3 py-1.5 text-xs font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 dark:bg-gray-600 dark:border-gray-500 dark:text-gray-200 dark:hover:bg-gray-500 transition-colors shadow-sm" onClick={() => toggleAll((items || []).map((i) => i.key), true)}>Выбрать всё</button>
                    <button className="px-3 py-1.5 text-xs font-medium rounded bg-white border border-gray-300 hover:bg-gray-50 dark:bg-gray-600 dark:border-gray-500 dark:text-gray-200 dark:hover:bg-gray-500 transition-colors shadow-sm" onClick={() => toggleAll((items || []).map((i) => i.key), false)}>Снять выделение</button>
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

export const AppSettingsComponent: React.FC = () => {
  const { can } = useAuth();
  const { showToast } = useToast();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAppSettings().then((data) => {
        setSettings(data);
        setLoading(false);
    });
  }, []);

  const handleToggle = async (key: keyof AppSettings | string) => {
    if (!settings) return;
    let next = { ...settings };
    
    if (key === 'blanks.driverCanAddBatches') {
        next.blanks = { ...next.blanks, driverCanAddBatches: !next.blanks?.driverCanAddBatches };
    } else if (key.startsWith('dashboard.')) {
        const widgetKey = key.split('.')[1] as keyof DashboardWidgetsSettings;
        next.dashboardWidgets = {
            ...next.dashboardWidgets,
            [widgetKey]: !next.dashboardWidgets?.[widgetKey]
        } as DashboardWidgetsSettings;
    } else if (key === 'isParserEnabled' || key === 'enableWarehouseAccounting') {
        next = { ...next, [key]: !next[key] };
    }

    setSettings(next);
    try {
      await saveAppSettings(next);
      showToast('Настройки сохранены.', 'success');
    } catch {
      showToast('Ошибка сохранения настроек.', 'error');
    }
  };

  if (!can('admin.panel')) return <div className="text-gray-500">Доступ к общим настройкам ограничен.</div>;
  if (loading || !settings) return <div>Загрузка...</div>;

  const widgets = settings.dashboardWidgets || { showStatuses: true, showFleetStats: true, showCharts: true, showOverruns: true, showMaintenance: true, showBirthdays: true };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Общие настройки</h3>
        <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3 p-3 border rounded-lg dark:border-gray-700">
            <input
                type="checkbox"
                checked={settings.isParserEnabled}
                onChange={() => handleToggle('isParserEnabled')}
                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">Парсер маршрутов из файла</div>
                <div className="text-xs text-gray-500">Включает кнопку импорта HTML-отчетов в путевом листе.</div>
            </div>
            </label>
            
            <label className="flex items-center gap-3 p-3 border rounded-lg dark:border-gray-700">
            <input
                type="checkbox"
                checked={settings.blanks?.driverCanAddBatches ?? false}
                onChange={() => handleToggle('blanks.driverCanAddBatches')}
                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">Водитель может добавлять пачки</div>
                <div className="text-xs text-gray-500">Разрешает водителям создавать свои пачки бланков (если отключено - только через выдачу).</div>
            </div>
            </label>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Настройка Панели управления</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center gap-3 p-3 border rounded-lg dark:border-gray-700">
                <input type="checkbox" checked={widgets.showStatuses} onChange={() => handleToggle('dashboard.showStatuses')} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Статусы документов</span>
            </label>
            <label className="flex items-center gap-3 p-3 border rounded-lg dark:border-gray-700">
                <input type="checkbox" checked={widgets.showFleetStats} onChange={() => handleToggle('dashboard.showFleetStats')} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Показатели парка (Пробег, Топливо)</span>
            </label>
            <label className="flex items-center gap-3 p-3 border rounded-lg dark:border-gray-700">
                <input type="checkbox" checked={widgets.showCharts} onChange={() => handleToggle('dashboard.showCharts')} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Графики</span>
            </label>
            <label className="flex items-center gap-3 p-3 border rounded-lg dark:border-gray-700">
                <input type="checkbox" checked={widgets.showOverruns} onChange={() => handleToggle('dashboard.showOverruns')} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Топ перерасходов</span>
            </label>
            <label className="flex items-center gap-3 p-3 border rounded-lg dark:border-gray-700">
                <input type="checkbox" checked={widgets.showMaintenance} onChange={() => handleToggle('dashboard.showMaintenance')} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Ближайшие ТО</span>
            </label>
            <label className="flex items-center gap-3 p-3 border rounded-lg dark:border-gray-700">
                <input type="checkbox" checked={widgets.showBirthdays} onChange={() => handleToggle('dashboard.showBirthdays')} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Именинники месяца</span>
            </label>
        </div>
      </div>
    </div>
  );
};

const ImportPreviewModal: React.FC<{
  bundle: ExportBundle;
  policy: ImportPolicy;
  onClose: () => void;
  onApply: (rows: ImportRow[]) => void;
}> = ({ bundle, policy, onClose, onApply }) => {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUnknown, setShowUnknown] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const allKeys = Object.keys(bundle.data);
      const computed: ImportRow[] = [];
      const knownSet = new Set(Object.values(DB_KEYS) as string[]);

      // Parallelize loading of current data for comparison
      const currentDataPromises = allKeys.map(k => loadJSON(k, null));
      const currentDataValues = await Promise.all(currentDataPromises);

      for (let i = 0; i < allKeys.length; i++) {
        const k = allKeys[i];
        const known = knownSet.has(k);
        const cat = inferCategoryByKeyName(k); // use utility that handles UNKNOWN_PREFIX
        const inc = bundle.data[k];
        const current = currentDataValues[i];
        
        // Analyze stats
        const stats = analyzeCounts(current, inc);

        // Analyze for default action
        let mode: UpdateMode = 'skip';
        if (policy.allowedModes.has('merge')) mode = 'merge';
        else if (policy.allowedModes.has('overwrite')) mode = 'overwrite';

        // Prepare subItems if it's an entity array
        let subItems: ImportSubItem[] | undefined;
        if (isEntityArray(inc)) {
            const incArr = inc as any[];
            const baseArr = Array.isArray(current) ? current as any[] : [];
            const idField = entityIdField(incArr) || 'id';
            const baseMap = new Map(baseArr.map(e => [e[idField], e]));

            subItems = incArr.map(item => {
                const id = item[idField];
                const exists = baseMap.has(id);
                // Simple equality check for status (JSON stringify is rough but works for simple objects)
                let status: 'new' | 'update' | 'same' = exists ? 'update' : 'new';
                if (exists && JSON.stringify(item) === JSON.stringify(baseMap.get(id))) {
                    status = 'same';
                }
                
                let label = makeLabel(item);

                // Specific handling for Business Audit to show Type + Date instead of just ID
                if (k === DB_KEYS.BUSINESS_AUDIT) {
                    const type = item.type || 'Событие';
                    const at = item.at ? new Date(item.at).toLocaleString('ru-RU') : '';
                    label = `${type} (${at})`;
                } else if (!label) {
                    // Fallbacks for other types if makeLabel fails
                    if (item.docNumber) label = `№${item.docNumber}`;
                    else if (item.series && item.number) label = `${item.series} ${item.number}`;
                }

                return {
                    id,
                    label: label || '—',
                    status,
                    selected: true, // Default selected
                    data: item
                };
            });
        }

        const row: ImportRow = {
            key: k,
            category: cat,
            known,
            incoming: inc,
            action: {
                enabled: true,
                insertNew: true,
                updateMode: mode,
                deleteMissing: false
            },
            stats,
            subItems,
            isExpanded: false
        };
        
        // Apply policy constraints immediately
        if (!isRowAllowedByPolicy(row, policy)) {
            row.action.enabled = false;
        }
        
        computed.push(row);
      }
      
      if (alive) {
          setRows(computed);
          setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [bundle, policy]);

  const handleApply = () => {
      onApply(rows);
  };

  const updateRow = (index: number, patch: Partial<ImportAction> | { isExpanded?: boolean }) => {
      setRows(prev => {
          const next = [...prev];
          const updatedRow = { ...next[index] };
          
          if ('isExpanded' in patch) {
              updatedRow.isExpanded = patch.isExpanded;
          } else {
              updatedRow.action = { ...updatedRow.action, ...patch };
              // If we enable/disable parent, we might want to logic for subItems too?
              // For now simpler: parent enabled flag controls the whole set, subItems are fine-tuning.
          }
          next[index] = updatedRow;
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
              
              // Auto-enable row if any subitem selected
              if (checked && !row.action.enabled) {
                  row.action = { ...row.action, enabled: true };
              }
          }
          next[rowIndex] = row;
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

  const visibleRows = useMemo(() => {
      return rows.filter(r => showUnknown || r.category !== 'unknown');
  }, [rows, showUnknown]);

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
                                            <button 
                                                onClick={() => updateRow(originalIndex, { isExpanded: !r.isExpanded })}
                                                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500"
                                            >
                                                {r.isExpanded ? <ArrowUpIcon className="h-4 w-4"/> : <ArrowDownIcon className="h-4 w-4"/>}
                                            </button>
                                        )}
                                    </td>
                                    <td className="p-3">
                                        <div className="font-medium text-gray-900 dark:text-white">{prettifyKey(r.key)}</div>
                                        <div className="text-xs text-gray-400 font-mono">{r.key}</div>
                                    </td>
                                    <td className="p-3">
                                        <span className={`px-2 py-1 rounded text-xs font-semibold
                                            ${r.category === 'dict' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                                              r.category === 'docs' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                              r.category === 'unknown' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' :
                                              'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                            }`}
                                        >
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
                                            <input 
                                                type="checkbox" 
                                                checked={r.action.enabled} 
                                                ref={input => { if (input) input.indeterminate = !!isPartiallySelected; }}
                                                onChange={e => hasSubItems ? toggleAllSubItems(originalIndex, e.target.checked) : updateRow(originalIndex, { enabled: e.target.checked })} 
                                                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
                                            />
                                        </label>
                                    </td>
                                    <td className="p-3">
                                        <select 
                                            value={r.action.updateMode} 
                                            onChange={e => updateRow(originalIndex, { updateMode: e.target.value as UpdateMode })}
                                            disabled={!r.action.enabled}
                                            className="p-1.5 border rounded text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 w-full"
                                        >
                                            {policy.allowedModes.has('merge') && <option value="merge">Объединить (безопасно)</option>}
                                            {policy.allowedModes.has('overwrite') && <option value="overwrite">Перезаписать (полностью)</option>}
                                            {policy.allowedModes.has('skip') && <option value="skip">Только новые (пропустить)</option>}
                                        </select>
                                        {r.action.enabled && policy.allowDeleteMissing && (
                                            <label className="flex items-center gap-2 mt-2 text-xs text-red-600 dark:text-red-400">
                                                <input 
                                                    type="checkbox" 
                                                    checked={r.action.deleteMissing} 
                                                    onChange={e => updateRow(originalIndex, { deleteMissing: e.target.checked })} 
                                                    className="rounded border-red-300 text-red-600 focus:ring-red-500"
                                                />
                                                Удалить отсутствующие в файле
                                            </label>
                                        )}
                                    </td>
                                </tr>
                                {r.isExpanded && hasSubItems && (
                                    <tr className="bg-gray-50 dark:bg-gray-900/50">
                                        <td colSpan={6} className="p-0">
                                            <div className="max-h-60 overflow-y-auto border-b border-gray-200 dark:border-gray-700 px-4 py-2">
                                                <table className="w-full text-xs">
                                                    <thead>
                                                        <tr className="text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                                                            <th className="p-2 text-left w-8"></th>
                                                            <th className="p-2 text-left">Наименование</th>
                                                            <th className="p-2 text-left">ID</th>
                                                            <th className="p-2 text-left">Статус</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {r.subItems!.map((sub, idx) => (
                                                            <tr key={sub.id} className="hover:bg-white dark:hover:bg-gray-800 transition-colors">
                                                                <td className="p-2">
                                                                    <input 
                                                                        type="checkbox" 
                                                                        checked={sub.selected} 
                                                                        onChange={e => toggleSubItem(originalIndex, idx, e.target.checked)}
                                                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                                    />
                                                                </td>
                                                                <td className="p-2 font-medium text-gray-800 dark:text-gray-200 text-xs">{sub.label}</td>
                                                                <td className="p-2 font-mono text-gray-500 text-[10px]">{sub.id}</td>
                                                                <td className="p-2">
                                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold
                                                                        ${sub.status === 'new' ? 'bg-green-100 text-green-700' : 
                                                                          sub.status === 'update' ? 'bg-blue-100 text-blue-700' : 
                                                                          'bg-gray-100 text-gray-500'}`
                                                                    }>
                                                                        {sub.status === 'new' ? 'Новый' : sub.status === 'update' ? 'Обновление' : 'Без изм.'}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </td>
                                    </tr>
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

// ... Admin Component ...
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

  const importPolicy = useMemo<ImportPolicy | null>(() => {
    if (canImportFull) return ADMIN_IMPORT_POLICY;
    if (canImportLimited) return USER_IMPORT_POLICY;
    return null;
  }, [canImportFull, canImportLimited]);

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
        for (const key of keysToExport) {
          data[key] = preloadedData[key];
        }
      } else {
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
        .map((r) => {
            const sanitized = { ...r, known: knownSet.has(r.key) };
            // If row enabled but check policy again
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
  
        const existing = await loadJSON(key, null);
        let toWrite: unknown = null;
        
        let effectiveIncoming = incoming;

        // --- SUB-ITEM FILTERING LOGIC ---
        if (subItems && subItems.length > 0 && isEntityArray(incoming)) {
            // If sub-items are defined, filter incoming array based on selection
            const selectedSubItems = subItems.filter(si => si.selected);
            // If nothing selected, effective incoming is empty array
            effectiveIncoming = selectedSubItems.map(si => si.data);
        }
        // --------------------------------

        if (isEntityArray(existing) || isEntityArray(effectiveIncoming)) {
          toWrite = mergeEntitiesArray(
            (existing as any[]) || [],
            (effectiveIncoming as any[]) || [],
            action.updateMode,
            action.insertNew,
            action.deleteMissing
          );
        } else if (Array.isArray(existing) && Array.isArray(effectiveIncoming)) {
          // Simple array (not entities) - usually overwrite or skip, selective not supported here yet
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
  
        await saveJSON(storageKey, safe as any);
      }
  
      // Audit Log Logic (Simplified for now, doesn't deeply track sub-item selection in `items` param construction, but captures final state diff)
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
          const { key, incoming, action, subItems } = row;
          const storageKey = knownSet.has(key) ? key : `${UNKNOWN_PREFIX}${key}`;
          const category = knownSet.has(key) ? inferCategoryByKeyName(key) : 'unknown';
  
          const beforeVal = beforeMap[storageKey];
          const afterVal = await loadJSON(storageKey, null);
  
          // Determine effective incoming for audit log logic
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
            // Fallback for non-entity arrays or objects
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
            <button onClick={() => (canImportFull ? setShowExportModal(true) : handleExportAllData())} disabled={!canExport || isImporting} className="flex items-center gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-green-700 transition-colors disabled:opacity-50"><DownloadIcon className="h-5 w-5" />{isExporting ? 'Экспорт...' : 'Экспорт'}</button>
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
