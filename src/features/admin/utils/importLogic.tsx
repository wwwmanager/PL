import React from 'react';
import {
  DocumentTextIcon,
  BookOpenIcon,
  ArchiveBoxIcon,
  CogIcon,
  ClipboardCheckIcon,
} from '../../../../components/Icons';
import { DB_KEYS } from '../../../../services/dbKeys';
import { AUDIT_INDEX_KEY, isEntityArray, entityIdField } from '../../../../services/auditLog';
import { KeyCategory, UpdateMode, ImportPolicy } from '../types';

export const BACKUP_KEY = '__backup_before_import__';
export const LAST_IMPORT_META_KEY = '__last_import_meta__';
export const LAST_EXPORT_META_KEY = '__last_export_meta__';

// Критические/служебные ключи, которые НИКОГДА не меняем из импорта
export const KEY_BLOCKLIST = new Set<string>([
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

export const DATA_GROUPS = [
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
        keys: [DB_KEYS.BUSINESS_AUDIT, AUDIT_INDEX_KEY, DB_KEYS.PERIOD_LOCKS] 
    }
];

export function prettifyKey(key: string) {
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

export function deepMerge<T>(a: T, b: Partial<T>): T {
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

export function mergeEntitiesArray(
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

export function uniqPrimitives(arr: any[]) {
  const s = new Set(arr);
  return Array.from(s);
}

export function analyzeCounts(existing: unknown, incoming: unknown) {
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

export function isRowAllowedByPolicy(
  row: { key: string; category: KeyCategory; known: boolean },
  policy: ImportPolicy
) {
  if (policy.denyKeys.has(row.key)) return false;
  if (policy.allowCategories && !policy.allowCategories.has(row.category)) return false;
  if (!policy.allowUnknownKeys && !row.known) return false;
  return true;
}

export const getItemLabel = (item: any, key: string): string => {
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