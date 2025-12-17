
import {
  WaybillStatus,
  OrganizationStatus,
  VehicleStatus,
  StockTransactionType,
  StockExpenseReason,
  StorageType,
  BlankStatus,
  SpoilReasonCode,
  Capability,
  Role,
} from './types';

export const WAYBILL_STATUS_COLORS: {
  [key in WaybillStatus]?: { bg: string; text: string; iconBorder: string };
} = {
  [WaybillStatus.DRAFT]: {
    bg: 'bg-gray-100 dark:bg-gray-700',
    text: 'text-gray-600 dark:text-gray-300',
    iconBorder: 'border-gray-400',
  },
  [WaybillStatus.SUBMITTED]: {
    bg: 'bg-amber-100 dark:bg-amber-900/50',
    text: 'text-amber-800 dark:text-amber-200',
    iconBorder: 'border-amber-400',
  },
  [WaybillStatus.POSTED]: {
    bg: 'bg-teal-600 dark:bg-teal-500',
    text: 'text-white',
    iconBorder: 'border-teal-700',
  },
  [WaybillStatus.CANCELLED]: {
    bg: 'bg-red-100 dark:bg-red-900/50',
    text: 'text-red-800 dark:text-red-200',
    iconBorder: 'border-red-400',
  },
};

export const WAYBILL_STATUS_TRANSLATIONS: { [key in WaybillStatus]?: string } = {
  [WaybillStatus.DRAFT]: 'Черновик',
  [WaybillStatus.SUBMITTED]: 'Отправлено',
  [WaybillStatus.POSTED]: 'Проведено',
  [WaybillStatus.CANCELLED]: 'Отменено',
};

export const ORGANIZATION_STATUS_COLORS: { [key in OrganizationStatus]: string } = {
  [OrganizationStatus.ACTIVE]: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  [OrganizationStatus.ARCHIVED]:
    'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  [OrganizationStatus.LIQUIDATED]:
    'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export const ORGANIZATION_STATUS_TRANSLATIONS: {
  [key in OrganizationStatus]: string;
} = {
  [OrganizationStatus.ACTIVE]: 'Активна',
  [OrganizationStatus.ARCHIVED]: 'В архиве',
  [OrganizationStatus.LIQUIDATED]: 'Ликвидирована',
};

export const VEHICLE_STATUS_COLORS: { [key in VehicleStatus]: string } = {
  [VehicleStatus.ACTIVE]: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  [VehicleStatus.ARCHIVED]:
    'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  [VehicleStatus.MAINTENANCE]: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

export const VEHICLE_STATUS_TRANSLATIONS: { [key in VehicleStatus]: string } = {
  [VehicleStatus.ACTIVE]: 'Активен',
  [VehicleStatus.ARCHIVED]: 'В архиве',
  [VehicleStatus.MAINTENANCE]: 'На обслуживании',
};

export const STORAGE_STATUS_COLORS: { [key in 'active' | 'archived']: string } = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  archived: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

export const STORAGE_STATUS_TRANSLATIONS: { [key in 'active' | 'archived']: string } = {
  active: 'Активен',
  archived: 'В архиве',
};

export const STOCK_TRANSACTION_TYPE_TRANSLATIONS: {
  [key in StockTransactionType]: string;
} = {
  income: 'Поступление',
  expense: 'Списание',
};

export const STOCK_TRANSACTION_TYPE_COLORS: {
  [key in StockTransactionType]: string;
} = {
  income: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  expense: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
};

export const STOCK_EXPENSE_REASON_TRANSLATIONS: {
  [key in StockExpenseReason]: string;
} = {
  waybill: 'Путевой лист',
  maintenance: 'Техническое обслуживание',
  writeOff: 'Списание',
  fuelCardTopUp: 'Пополнение топливной карты',
  inventoryAdjustment: 'Инвентаризация',
  other: 'Другое',
};

export const STORAGE_TYPE_TRANSLATIONS: { [key in StorageType]: string } = {
  centralWarehouse: 'Центральный склад',
  remoteWarehouse: 'Удалённый склад',
  vehicleTank: 'Бак транспортного средства',
  contractorWarehouse: 'Склад подрядчика',
};

export const STOCK_EXPENSE_REASON_COLORS: { [key in StockExpenseReason]: string } = {
  waybill: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  maintenance: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  writeOff: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  fuelCardTopUp: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  inventoryAdjustment: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200',
  other: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
};

export const STORAGE_TYPE_COLORS: { [key in StorageType]: string } = {
  centralWarehouse: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  remoteWarehouse: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  vehicleTank: 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200',
  contractorWarehouse: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
};

export const STOCK_TRANSACTION_TYPE_OPTIONS: Array<{
  value: StockTransactionType;
  label: string;
  badgeClass: string;
}> = (Object.keys(STOCK_TRANSACTION_TYPE_TRANSLATIONS) as StockTransactionType[]).map(
  (type) => ({
    value: type,
    label: STOCK_TRANSACTION_TYPE_TRANSLATIONS[type],
    badgeClass: STOCK_TRANSACTION_TYPE_COLORS[type],
  })
);

export const STOCK_EXPENSE_REASON_OPTIONS: Array<{
  value: StockExpenseReason;
  label: string;
  badgeClass: string;
}> = (Object.keys(STOCK_EXPENSE_REASON_TRANSLATIONS) as StockExpenseReason[]).map(
  (reason) => ({
    value: reason,
    label: STOCK_EXPENSE_REASON_TRANSLATIONS[reason],
    badgeClass: STOCK_EXPENSE_REASON_COLORS[reason],
  })
);

export const STORAGE_TYPE_OPTIONS: Array<{
  value: StorageType;
  label: string;
  badgeClass: string;
}> = (Object.keys(STORAGE_TYPE_TRANSLATIONS) as StorageType[]).map((type) => ({
  value: type,
  label: STORAGE_TYPE_TRANSLATIONS[type],
  badgeClass: STORAGE_TYPE_COLORS[type],
}));

export const BLANK_STATUS_TRANSLATIONS: Record<BlankStatus, string> = {
  available: 'На складе',
  issued: 'Выдан',
  reserved: 'Зарезервирован',
  used: 'Использован',
  returned: 'Возвращен',
  spoiled: 'Испорчен',
};

export const BLANK_STATUS_COLORS: Record<BlankStatus, string> = {
  available: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  issued: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  reserved: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  used: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  returned: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  spoiled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export const SPOIL_REASON_TRANSLATIONS: Record<SpoilReasonCode, string> = {
  damaged: 'Поврежден',
  misprint: 'Брак печати',
  lost: 'Утерян',
  other: 'Другое',
};

export const ROLE_TRANSLATIONS: Record<Role, string> = {
  admin: 'Администратор',
  user: 'Пользователь',
  auditor: 'Аудитор',
  driver: 'Водитель',
  mechanic: 'Механик',
  reviewer: 'Проверяющий',
  accountant: 'Бухгалтер',
  viewer: 'Наблюдатель',
};

export const CAPABILITY_TRANSLATIONS: Record<Capability, string> = {
  'admin.panel': 'Админ. панель',
  'import.run': 'Полный импорт',
  'import.limited': 'Ограниченный импорт',
  'export.run': 'Экспорт данных',
  'audit.read': 'Просмотр аудита',
  'audit.diff': 'Сравнение версий',
  'audit.rollback': 'Откат изменений',
  'audit.delete': 'Удаление из аудита',
  'audit.business.read': 'Просмотр бизнес-журнала',
  'waybill.create': 'Создание ПЛ',
  'waybill.submit': 'Отправка на проверку',
  'waybill.post': 'Проведение ПЛ',
  'waybill.cancel': 'Отмена ПЛ',
  'waybill.backdate': 'Проведение задним числом',
  'waybill.correct': 'Корректировка проведенного ПЛ',
  'blanks.issue': 'Выдача бланков',
  'blanks.return': 'Возврат бланков',
  'blanks.spoil.self': 'Списание своих бланков',
  'blanks.spoil.warehouse': 'Списание со склада',
  'blanks.spoil.override': 'Списание любых бланков',
  'rbac.delegate': 'Управление правами',
  'stock.move': 'Складские операции',
};

export const DEFAULT_ROLE_POLICIES: Record<Role, Capability[]> = {
  admin: [
    'admin.panel', 'import.run', 'export.run', 'audit.read', 'audit.diff',
    'audit.rollback', 'audit.delete', 'audit.business.read', 'waybill.create',
    'waybill.submit', 'waybill.post', 'waybill.cancel', 'waybill.backdate',
    'waybill.correct', 'blanks.issue', 'blanks.return', 'rbac.delegate',
    'blanks.spoil.self', 'blanks.spoil.warehouse', 'blanks.spoil.override'
  ],
  auditor: ['audit.read', 'audit.diff', 'audit.business.read'],
  user: ['import.limited', 'export.run'],
  driver: ['waybill.create', 'waybill.submit', 'waybill.post', 'waybill.cancel', 'export.run', 'blanks.spoil.self'],
  mechanic: ['export.run', 'blanks.spoil.warehouse'], // 'stock.move' - capability to be added if needed
  reviewer: ['audit.business.read', 'waybill.submit'],
  accountant: ['waybill.post', 'audit.business.read', 'export.run'],
  viewer: ['audit.read'],
};

export const ALL_CAPS: Capability[] = Array.from(
  new Set(Object.values(DEFAULT_ROLE_POLICIES).flat())
) as Capability[];

// --- Business Audit Translations ---

export const BUSINESS_EVENT_CONFIG: Record<string, { label: string; color: string; icon?: 'doc' | 'blank' | 'user' | 'alert' }> = {
    'waybill.created': { label: 'Создание ПЛ', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: 'doc' },
    'waybill.submitted': { label: 'Отправка на проверку', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', icon: 'doc' },
    'waybill.posted': { label: 'Проведение путевого листа', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: 'doc' },
    'waybill.cancelled': { label: 'Отмена путевого листа', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', icon: 'doc' },
    'waybill.corrected': { label: 'Корректировка ПЛ', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200', icon: 'alert' },
    'waybill.numberUsed': { label: 'Использование номера бланка', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200', icon: 'blank' },
    
    'blanks.batchCreated': { label: 'Создание пачки бланков', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', icon: 'blank' },
    'blanks.materialized': { label: 'Материализация бланков', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', icon: 'blank' },
    'blanks.issued': { label: 'Выдача бланков водителю', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200', icon: 'blank' },
    'blanks.returnedToDriver': { label: 'Возврат бланка водителю', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200', icon: 'blank' },
    'blank.spoiled': { label: 'Списание бланка', color: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200', icon: 'alert' },
    'blank.spoiled.bulk': { label: 'Массовое списание бланков', color: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200', icon: 'alert' },
    
    'employee.fuelReset': { label: 'Обнуление топливной карты', color: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200', icon: 'user' },
};
