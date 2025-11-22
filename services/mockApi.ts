
import {
  WaybillStatus,
  OrganizationStatus,
  VehicleStatus,
  StockTransactionType,
  StockExpenseReason,
  StorageType,
  Waybill,
  Route,
  Vehicle,
  Employee,
  Organization,
  FuelType,
  SeasonSettings,
  AppSettings,
  GarageStockItem,
  StockTransaction,
  User,
  Role,
  Capability,
  WaybillBlankBatch,
  WaybillBlank,
  BlankStatus,
} from '../types';
import { loadJSON, saveJSON } from './storage';
import { broadcast } from './bus';
import { appendEvent, auditBusiness } from './auditBusiness';
import { IssueBlanksSchema, SpoilBlankSchema, BulkSpoilInputSchema, BlankFiltersSchema } from './schemas';
import { z } from 'zod';
import { DB_KEYS } from './dbKeys';
import { BLANK_STATUS_TRANSLATIONS, DEFAULT_ROLE_POLICIES } from '../constants';
import { faker } from './faker';
import { canTransition, formatTransitionError } from './waybillStatusMachine';


export type DriverStatus = 'active' | 'onLeave' | 'inactive';

export type MockOrganization = Organization;
export type MockVehicle = Vehicle;
export type MockDriver = Employee;
export type MockStorage = {
  id: string;
  organizationId: string;
  type: StorageType;
  name: string;
  description?: string;
  address?: string;
  responsiblePerson?: string;
  fuelType?: string;
  capacityLiters?: number;
  currentLevelLiters?: number;
  safetyStockLiters?: number;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'archived';
};
export type MockWaybill = Waybill;
export type MockStockTransaction = StockTransaction;


export interface MockStockBalanceRow {
  storageId: string;
  storageName: string;
  organizationId: string;
  organizationName: string;
  type: StorageType;
  capacityLiters: number;
  currentLevelLiters: number;
  utilization: number;
  safetyStockLiters: number;
  status: 'ok' | 'low' | 'overflow';
  lastTransactionAt?: string;
}

export interface ApiListMeta {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface ApiListResponse<T> {
  data: T[];
  meta: ApiListMeta;
}

export interface ApiSingleResponse<T> {
  data: T;
  meta: {
    updatedAt: string;
  };
}

export interface FetchOrganizationsParams {
  search?: string;
  status?: OrganizationStatus[];
  page?: number;
  perPage?: number;
}

export interface FetchVehiclesParams {
  organizationId?: string;
  status?: VehicleStatus[];
  search?: string;
  page?: number;
  perPage?: number;
}

export interface FetchDriversParams {
  organizationId?: string;
  status?: ('Active' | 'Inactive')[];
  search?: string;
  page?: number;
  perPage?: number;
}

export interface FetchStoragesParams {
  organizationId?: string;
  type?: StorageType[];
  search?: string;
  page?: number;
  perPage?: number;
}

export interface FetchWaybillsParams {
  organizationId?: string;
  vehicleId?: string;
  driverId?: string;
  status?: WaybillStatus[];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  perPage?: number;
}

export interface FetchStockTransactionsParams {
  organizationId?: string;
  storageId?: string;
  type?: StockTransactionType[];
  reason?: StockExpenseReason[];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  perPage?: number;
}

export interface CreateStockTransactionInput {
  organizationId: string;
  storageId: string;
  type: StockTransactionType;
  reason: StockExpenseReason;
  quantityLiters: number;
  unitPrice: number;
  counterparty?: string;
  waybillId?: string;
  vehicleId?: string;
  comment?: string;
  createdAt?: string;
}

const clone = <T>(value: T): T => {
  if (value === undefined) {
    return undefined as T;
  }
  return JSON.parse(JSON.stringify(value));
};

const randomLatency = () => 120 + Math.floor(Math.random() * 220);

const simulateNetwork = async <T>(payload: T, latency = randomLatency()): Promise<T> =>
  new Promise((resolve) => {
    setTimeout(() => resolve(clone(payload)), latency);
  });

const paginate = <T>(items: T[], pageParam = 1, perPageParam = 10): ApiListResponse<T> => {
  const page = Math.max(1, Math.trunc(pageParam));
  const perPage = Math.max(1, Math.trunc(perPageParam));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const startIndex = (page - 1) * perPage;
  return {
    data: items.slice(startIndex, startIndex + perPage),
    meta: {
      total,
      page,
      perPage,
      totalPages,
    },
  };
};

const normalizeSearch = (value?: string) => value?.trim().toLowerCase() ?? '';

export const generateId = (prefix = 'id') =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;

const initialOrganizations: MockOrganization[] = [
  {
    id: 'org-001',
    fullName: 'ООО «СеверТранс»',
    shortName: 'СеверТранс',
    status: OrganizationStatus.ACTIVE,
    inn: '7701234567',
    kpp: '770101001',
    ogrn: '1227700000001',
    address: '125212, г. Москва, Ленинградское ш., д. 45, стр. 2',
    phone: '+7 (495) 123-45-67',
    email: 'info@severtrans.ru',
  },
  {
    id: 'org-002',
    fullName: 'АО «Универсал Логистикс»',
    shortName: 'Универсал',
    status: OrganizationStatus.ARCHIVED,
    inn: '7804567890',
    kpp: '780401001',
    ogrn: '1097800000012',
    address:
      '197101, г. Санкт-Петербург, вн. тер. г. муниципальный округ Кронверкское, пр-кт Кронверкский, д. 23',
    phone: '+7 (812) 555-42-42',
    email: 'office@universallog.ru',
  },
  {
    id: 'org-003',
    fullName: 'ООО «Вектор-Снабжение»',
    shortName: 'Вектор',
    status: OrganizationStatus.LIQUIDATED,
    inn: '5409876543',
    kpp: '540901001',
    ogrn: '1135400000456',
    address: '630108, г. Новосибирск, ул. Крылова, д. 18',
    phone: '+7 (383) 700-11-22',
    email: 'support@vector-supply.ru',
  },
  {
    id: 'org-med-001',
    fullName: 'ООО «МедЭксперт»',
    shortName: 'МедЭксперт',
    status: OrganizationStatus.ACTIVE,
    inn: '7709876543',
    kpp: '770901001',
    ogrn: '1157700000123',
    address: '109028, г. Москва, ул. Солянка, д. 1/2',
    phone: '+7 (495) 987-65-43',
    email: 'med@expert.ru',
    group: 'Мед. учреждение',
    medicalLicenseNumber: 'ЛО-77-01-012345',
    medicalLicenseIssueDate: '2020-05-15',
  },
];

const initialFuelTypes: FuelType[] = [
  { id: 'diesel-std', name: 'ДТ', code: '01', density: 0.84, unit: 'л', notes: 'Дизельное топливо (летнее/зимнее)' },
  { id: 'petrol-92', name: 'АИ-92', code: '02', density: 0.735, unit: 'л', notes: 'Бензин АИ-92' },
  { id: 'petrol-95', name: 'АИ-95', code: '03', density: 0.75, unit: 'л', notes: 'Бензин АИ-95' },
  { id: 'petrol-100', name: 'АИ-100', code: '04', density: 0.76, unit: 'л', notes: 'Бензин АИ-98/100' },
  { id: 'lpg', name: 'Пропан', code: '05', density: 0.54, unit: 'л', notes: 'Сжиженный углеводородный газ' },
  { id: 'cng', name: 'Метан', code: '06', density: 0.72, unit: 'м³', notes: 'Сжатый природный газ' },
];

const initialVehicles: MockVehicle[] = [
  {
    id: 'veh-001',
    organizationId: 'org-001',
    status: VehicleStatus.ACTIVE,
    brand: 'Lada Granta',
    plateNumber: 'Х123ОР777',
    vin: 'XTA219010F0123456',
    year: 2023,
    fuelTypeId: 'petrol-92',
    fuelTankCapacity: 50,
    currentFuel: 0,
    mileage: 15400,
    storageLocationId: 'storage-veh-001',
    assignedDriverId: 'emp-driver-01',
    fuelConsumptionRates: { summerRate: 8.5, winterRate: 10.0, cityIncreasePercent: 15 },
    vehicleType: 'Легковой',
    ptsType: 'EPTS',
    eptsNumber: '164301123456789',
    diagnosticCardNumber: '012345678901234',
    diagnosticCardIssueDate: '2023-08-15',
    diagnosticCardExpiryDate: '2027-08-14',
    osagoSeries: 'XXX',
    osagoNumber: '0123456789',
    osagoStartDate: '2023-08-10',
    osagoEndDate: '2024-08-09',
    useCityModifier: true,
    maintenanceHistory: [],
    notes: 'Служебный автомобиль для поездок по городу'
  }
];

const generateInitialDrivers = (count: number): MockDriver[] => {
    const drivers: MockDriver[] = [];
    
    // Always include the original driver for consistency
    drivers.push({
        id: 'emp-driver-01',
        fullName: 'Сергеев Александр Викторович',
        shortName: 'Сергеев А.В.',
        employeeType: 'driver',
        position: 'Водитель-экспедитор 1 класса',
        organizationId: 'org-001',
        status: 'Active',
        phone: '+7 (925) 555-77-88',
        address: 'г. Москва, ул. Тверская, д. 15, кв. 42',
        dateOfBirth: '1982-07-21',
        notes: 'Опытный водитель, специализируется на междугородних перевозках. Без вредных привычек.',
        licenseCategory: 'B, C, CE, D',
        documentNumber: '99 11 123456', // Driver's license
        documentExpiry: '2028-09-15',
        snils: '123-456-789 00',
        personnelNumber: 'V042',
        fuelCardNumber: '7001 1020 3040 5060',
        fuelCardBalance: 0,
        medicalCertificateSeries: '003-В/у',
        medicalCertificateNumber: '012345678',
        medicalCertificateIssueDate: '2023-11-20',
        medicalCertificateExpiryDate: '2026-11-19',
        dispatcherId: 'emp-driver-01',
        controllerId: 'emp-driver-01',
        medicalInstitutionId: 'org-med-001',
        driverCardType: 'SKZI',
        driverCardNumber: '0123456789012345',
        driverCardStartDate: '2022-03-10',
        driverCardExpiryDate: '2025-03-10',
        email: 'sergeev.av@severtrans.ru',
    });

    for (let i = 2; i <= count; i++) {
        const fullName = faker.person.fullName();
        const shortName = `${fullName.split(' ')[0]} ${fullName.split(' ')[1][0]}.${fullName.split(' ')[2][0]}.`;
        drivers.push({
            id: `emp-driver-${String(i).padStart(2, '0')}`,
            fullName: fullName,
            shortName: shortName,
            employeeType: 'driver',
            position: 'Водитель',
            organizationId: 'org-001',
            status: 'Active',
            phone: faker.phone.number(),
            personnelNumber: `V${faker.string.numeric(3)}`,
            fuelCardBalance: faker.number.float({ min: 50, max: 500, precision: 2 }),
            documentExpiry: faker.date.future({ years: 3 }).toISOString().split('T')[0],
            medicalCertificateExpiryDate: faker.date.future({ years: 2 }).toISOString().split('T')[0],
        });
    }
    return drivers;
};

const initialDrivers = generateInitialDrivers(1);

const initialStorages: MockStorage[] = [
  {
    id: 'storage-centr-001',
    organizationId: 'org-001',
    type: 'centralWarehouse',
    name: 'Центральный склад Москва',
    description: 'Основное место хранения дизельного топлива',
    address: 'г. Москва, Ленинградское ш., д. 45, стр. 2',
    responsiblePerson: 'Анна Смирнова',
    fuelType: 'diesel',
    capacityLiters: 50000,
    currentLevelLiters: 21850,
    safetyStockLiters: 8000,
    createdAt: '2023-02-15T06:00:00.000Z',
    updatedAt: '2024-10-09T05:45:00.000Z',
    status: 'active',
  },
  {
    id: 'storage-remote-001',
    organizationId: 'org-001',
    type: 'remoteWarehouse',
    name: 'Склад Тверь',
    description: 'Региональная площадка',
    address: 'Тверская обл., д. Черногубово, промзона',
    responsiblePerson: 'Егор Литвинов',
    fuelType: 'diesel',
    capacityLiters: 12000,
    currentLevelLiters: 6450,
    safetyStockLiters: 2500,
    createdAt: '2023-05-10T07:10:00.000Z',
    updatedAt: '2024-10-07T13:20:00.000Z',
    status: 'active',
  },
  {
    id: 'storage-veh-001',
    organizationId: 'org-001',
    type: 'vehicleTank',
    name: 'Lada Granta (Х123ОР777)',
    description: 'Бак легкового автомобиля',
    responsiblePerson: 'Сергеев А.В.',
    fuelType: 'petrol-92',
    capacityLiters: 50,
    currentLevelLiters: 25,
    safetyStockLiters: 10,
    createdAt: '2023-08-01T09:00:00.000Z',
    updatedAt: new Date().toISOString(),
    status: 'active',
  },
  {
    id: 'storage-contractor-001',
    organizationId: 'org-002',
    type: 'contractorWarehouse',
    name: 'Подрядчик «ЗапСнаб» (СПб)',
    description: 'Договор на хранение топлива',
    address: 'г. Санкт-Петербург, дор. на Металлострой, д. 12',
    responsiblePerson: 'ООО «ЗапСнаб»',
    fuelType: 'diesel',
    capacityLiters: 30000,
    currentLevelLiters: 21200,
    safetyStockLiters: 5000,
    createdAt: '2022-06-30T08:40:00.000Z',
    updatedAt: '2024-09-15T09:50:00.000Z',
    status: 'archived',
  },
];

const initialWaybills: MockWaybill[] = [];

const initialStockTransactions: MockStockTransaction[] = [];
const initialUsers: User[] = [{ id: 'dev-admin', role: 'admin', displayName: 'Admin' }];

const initialGarageStockItems: GarageStockItem[] = [
  {
    id: 'gsi-fuel-92',
    name: 'Топливо АИ-92 (л)',
    itemType: 'Товар',
    group: 'ГСМ',
    unit: 'л',
    balance: 10000,
    storageType: 'centralWarehouse',
    isActive: true,
    fuelTypeId: 'petrol-92',
    organizationId: 'org-001',
    lastTransactionDate: new Date().toISOString()
  }
];
let garageStockItems = clone(initialGarageStockItems);

let organizations = clone(initialOrganizations);
let vehicles = clone(initialVehicles);
let drivers = clone(initialDrivers);
let storages = clone(initialStorages);
let waybills = clone(initialWaybills);
let stockTransactions = clone(initialStockTransactions);
let fuelTypes = clone(initialFuelTypes);
let users = clone(initialUsers);
let waybillBlankBatches: WaybillBlankBatch[] = [];
let waybillBlanks: WaybillBlank[] = [];
// State for role policies
let rolePolicies: Record<Role, Capability[]> = clone(DEFAULT_ROLE_POLICIES);


export const resetMockApiState = (): void => {
  organizations = clone(initialOrganizations);
  vehicles = clone(initialVehicles);
  drivers = clone(initialDrivers);
  storages = clone(initialStorages);
  waybills = clone(initialWaybills);
  stockTransactions = clone(initialStockTransactions);
  fuelTypes = clone(initialFuelTypes);
  garageStockItems = clone(initialGarageStockItems);
  users = clone(initialUsers);
  waybillBlankBatches = [];
  waybillBlanks = [];
  rolePolicies = clone(DEFAULT_ROLE_POLICIES);
  rebuildBlankIndex();
};

export const fetchOrganizations = async (
  params: FetchOrganizationsParams = {},
): Promise<ApiListResponse<MockOrganization>> => {
  const { search, status, page = 1, perPage = 10 } = params;
  const normalized = normalizeSearch(search);
  let result = [...organizations];

  if (status?.length) {
    result = result.filter((org) => status.includes(org.status));
  }

  if (normalized) {
    result = result.filter((org) => {
      const haystack = [
        org.fullName,
        org.shortName,
        org.inn,
        org.kpp,
        org.ogrn,
        org.email,
        org.phone,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase())
        .join(' ');
      return haystack.includes(normalized);
    });
  }

  // result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return simulateNetwork(paginate(result, page, perPage));
};

export const fetchVehicles = async (
  params: FetchVehiclesParams = {},
): Promise<ApiListResponse<MockVehicle>> => {
  const { organizationId, status, search, page = 1, perPage = 10 } = params;
  const normalized = normalizeSearch(search);
  let result = [...vehicles];

  if (organizationId) {
    result = result.filter((vehicle) => vehicle.organizationId === organizationId);
  }

  if (status?.length) {
    result = result.filter((vehicle) => status.includes(vehicle.status));
  }

  if (normalized) {
    result = result.filter((vehicle) => {
      const haystack = [
        vehicle.brand,
        vehicle.plateNumber,
        vehicle.vin,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase())
        .join(' ');
      return haystack.includes(normalized);
    });
  }

  // result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return simulateNetwork(paginate(result, page, perPage));
};

export const fetchDrivers = async (
  params: FetchDriversParams = {},
): Promise<ApiListResponse<MockDriver>> => {
  const { organizationId, status, search, page = 1, perPage = 10 } = params;
  const normalized = normalizeSearch(search);
  let result = [...drivers];

  if (organizationId) {
    result = result.filter((driver) => driver.organizationId === organizationId);
  }

  if (status?.length) {
    result = result.filter((driver) => status.includes(driver.status));
  }

  if (normalized) {
    result = result.filter((driver) => {
      const haystack = [
        driver.fullName,
        driver.shortName,
        driver.phone,
        driver.email ?? '',
        driver.documentNumber,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase())
        .join(' ');
      return haystack.includes(normalized);
    });
  }

  // result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return simulateNetwork(paginate(result, page, perPage));
};

export const fetchStorages = async (
  params: FetchStoragesParams = {},
): Promise<ApiListResponse<MockStorage>> => {
  const { organizationId, type, search, page = 1, perPage = 10 } = params;
  const normalized = normalizeSearch(search);
  let result = [...storages];

  if (organizationId) {
    result = result.filter((storage) => storage.organizationId === organizationId);
  }

  if (type?.length) {
    result = result.filter((storage) => storage.type && type.includes(storage.type));
  }

  if (normalized) {
    result = result.filter((storage) => {
      const haystack = [
        storage.name,
        storage.description ?? '',
        storage.address ?? '',
        storage.responsiblePerson ?? '',
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase())
        .join(' ');
      return haystack.includes(haystack);
    });
  }

  result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return simulateNetwork(paginate(result, page, perPage));
};

export const fetchWaybills = async (
  params: FetchWaybillsParams = {},
): Promise<ApiListResponse<MockWaybill>> => {
  const {
    organizationId,
    vehicleId,
    driverId,
    status,
    dateFrom,
    dateTo,
    search,
    page = 1,
    perPage = 10,
  } = params;

  const normalized = normalizeSearch(search);
  const from = dateFrom ? new Date(dateFrom).getTime() : null;
  const to = dateTo ? new Date(dateTo).getTime() : null;

  let result = [...waybills];

  if (organizationId) {
    result = result.filter((waybill) => waybill.organizationId === organizationId);
  }

  if (vehicleId) {
    result = result.filter((waybill) => waybill.vehicleId === vehicleId);
  }

  if (driverId) {
    result = result.filter((waybill) => waybill.driverId === driverId);
  }

  if (status?.length) {
    result = result.filter((waybill) => status.includes(waybill.status));
  }

  if (from || to) {
    result = result.filter((waybill) => {
      const waybillDate = new Date(waybill.date).getTime();
      if (from && waybillDate < from) {
        return false;
      }
      if (to && waybillDate > to) {
        return false;
      }
      return true;
    });
  }

  if (normalized) {
    result = result.filter((waybill) => {
      const routeInfo = (waybill.routes || []).map(r => `${r.from} ${r.to}`).join(' ');
      const haystack = [
        waybill.number,
        routeInfo,
        waybill.notes ?? '',
        waybill.reviewerComment ?? '',
      ]
        .map((value) => String(value).toLowerCase())
        .join(' ');
      return haystack.includes(normalized);
    });
  }

  result.sort((a, b) => b.date.localeCompare(a.date));

  return simulateNetwork(paginate(result, page, perPage));
};

export const fetchStockTransactions = async (
  params: FetchStockTransactionsParams = {},
): Promise<ApiListResponse<MockStockTransaction>> => {
  const {
    organizationId,
    storageId,
    type,
    reason,
    dateFrom,
    dateTo,
    search,
    page = 1,
    perPage = 10,
  } = params;

  const normalized = normalizeSearch(search);
  const from = dateFrom ? new Date(dateFrom).getTime() : null;
  const to = dateTo ? new Date(dateTo).getTime() : null;

  let result = [...stockTransactions];

  if (organizationId) {
    result = result.filter((transaction) => transaction.organizationId === organizationId);
  }

  if (storageId) {
    // result = result.filter((transaction) => transaction.storageId === storageId);
  }

  if (type?.length) {
    result = result.filter((transaction) => type.includes(transaction.type));
  }

  if (reason?.length) {
    result = result.filter((transaction) => transaction.expenseReason && reason.includes(transaction.expenseReason));
  }

  if (from || to) {
    result = result.filter((transaction) => {
      const executedAt = new Date(transaction.createdAt || transaction.date).getTime();
      if (from && executedAt < from) {
        return false;
      }
      if (to && executedAt > to) {
        return false;
      }
      return true;
    });
  }

  if (normalized) {
    result = result.filter((transaction) => {
      const haystack = [
        transaction.notes ?? '',
        transaction.supplier ?? '',
        transaction.waybillId ?? '',
        transaction.vehicleId ?? '',
      ]
        .map((value) => String(value).toLowerCase())
        .join(' ');
      return haystack.includes(normalized);
    });
  }

  result.sort((a, b) => (b.createdAt || b.date).localeCompare(a.createdAt || a.date));

  return simulateNetwork(paginate(result, page, perPage));
};

export const getStockBalances = async (): Promise<MockStockBalanceRow[]> => {
  const orgLookup = new Map(organizations.map((org) => [org.id, org]));
  const balance = storages.map<MockStockBalanceRow>((storage) => {
    const utilization =
      (storage.capacityLiters ?? 0) === 0
        ? 0
        : Number(((storage.currentLevelLiters ?? 0) / (storage.capacityLiters ?? 1)).toFixed(4));

    const lastTransaction = stockTransactions
      .filter((transaction) => {
          // simplified check
          return true;
      })
      .sort((a, b) => (b.createdAt||b.date).localeCompare(a.createdAt||a.date))[0];

    let status: 'ok' | 'low' | 'overflow' = 'ok';
    if ((storage.currentLevelLiters ?? 0) <= (storage.safetyStockLiters ?? 0)) {
      status = 'low';
    } else if ((storage.currentLevelLiters ?? 0) > (storage.capacityLiters ?? Infinity)) {
      status = 'overflow';
    }

    const organization = orgLookup.get(storage.organizationId);

    return {
      storageId: storage.id,
      storageName: storage.name,
      organizationId: storage.organizationId,
      organizationName: organization?.shortName ?? 'Неизвестно',
      type: storage.type,
      capacityLiters: storage.capacityLiters ?? 0,
      currentLevelLiters: storage.currentLevelLiters ?? 0,
      utilization,
      safetyStockLiters: storage.safetyStockLiters ?? 0,
      status,
      lastTransactionAt: lastTransaction?.createdAt,
    };
  });

  balance.sort((a, b) => a.storageName.localeCompare(b.storageName));

  return simulateNetwork(balance);
};

export const createStockTransaction = async (
  input: Omit<StockTransaction, 'id'>,
): Promise<ApiSingleResponse<MockStockTransaction>> => {
  const createdAt = new Date().toISOString();

  const transaction: MockStockTransaction = {
    ...input,
    id: generateId('trx'),
    createdAt,
  };

  stockTransactions = [transaction, ...stockTransactions];

  return simulateNetwork({
    data: transaction,
    meta: {
      updatedAt: createdAt,
    },
  });
};

export const updateWaybillStatus = async (
  waybillId: string,
  status: WaybillStatus,
): Promise<ApiSingleResponse<MockWaybill>> => {
  return changeWaybillStatus(waybillId, status, { appMode: 'driver' });
};

export const changeWaybillStatus = async (
  waybillId: string,
  next: WaybillStatus,
  ctx: { userId?: string; appMode?: string; reason?: string } = {}
): Promise<ApiSingleResponse<MockWaybill>> => {
  await initFromStorage();
  const w = waybills.find((x) => x.id === waybillId);
  if (!w) throw new Error('ПЛ не найден');

  const from = w.status;
  
  // --- PHASE 2.1 START: Status Machine Check ---
  if (!canTransition(from, next)) {
    throw new Error(formatTransitionError(from, next));
  }
  // --- PHASE 2.1 END ---

  const mode = ctx.appMode ?? 'driver';
  const now = new Date().toISOString();

  // Correction logic from POSTED to DRAFT
  if (from === WaybillStatus.POSTED && next === WaybillStatus.DRAFT) {
    if (!ctx.reason?.trim()) {
        throw new Error('Причина корректировки обязательна.');
    }

    // *** топливо: вернуть заправку на карту ***
    const driverId = w.driverId;
    const fuelFilled = w.fuelFilled ?? 0;
    if (driverId && fuelFilled > 0) {
      await addToFuelCardBalance(driverId, fuelFilled);
    }

    if (w.blankId) {
        const blank = waybillBlanks.find(b => b.id === w.blankId);
        if (blank && blank.status === 'used') {
            blank.status = 'issued';
            blank.usedInWaybillId = null;
            blank.usedAt = null;
        }
    }

    w.status = WaybillStatus.DRAFT;
    w.postedAt = undefined;
    w.postedBy = undefined;
    w.updatedAt = now;
    
    const user = users.find(u => u.id === ctx.userId);
    const userDisplayName = user?.displayName || ctx.userId || 'system';
    const reasonNote = `[Корректировка ${new Date(now).toLocaleString('ru-RU')} от ${userDisplayName}: ${ctx.reason.trim()}]\n`;
    w.notes = `${reasonNote}${w.notes || ''}`.trim();

    await appendEvent({
        id: generateId('ev'),
        at: now,
        userId: ctx.userId,
        type: 'waybill.corrected',
        payload: { waybillId, reason: ctx.reason.trim() },
    });

    await commit(['waybills', 'blanks', 'audit', 'employees']);
    return simulateNetwork({
      data: w,
      meta: { updatedAt: now },
    });
  }

  const allowedDriver = new Set([
    `${WaybillStatus.DRAFT}->${WaybillStatus.POSTED}`,
    `${WaybillStatus.DRAFT}->${WaybillStatus.CANCELLED}`,
  ]);
  const allowedCentral = new Set([
    `${WaybillStatus.DRAFT}->${WaybillStatus.SUBMITTED}`,
    `${WaybillStatus.SUBMITTED}->${WaybillStatus.POSTED}`,
    `${WaybillStatus.DRAFT}->${WaybillStatus.CANCELLED}`,
    `${WaybillStatus.SUBMITTED}->${WaybillStatus.CANCELLED}`,
  ]);

  const key = `${from}->${next}`;
  const ok = mode === 'driver' ? allowedDriver.has(key) : allowedCentral.has(key);
  if (!ok) throw new Error(`Недопустимый переход статуса: ${from} → ${next} (режим ${mode})`);
  
  if (next === WaybillStatus.POSTED) {
    // *** топливо: логика списания с карты + расход по баку ***
    // Списание с карты: выполняем ТОЛЬКО при первом проведении "Draft → Posted"
    if (from === WaybillStatus.DRAFT) {
        const driverId = w.driverId;
        const fuelFilled = w.fuelFilled ?? 0;

        if (driverId && fuelFilled > 0) {
            const balance = await getFuelCardBalance(driverId);
            if (fuelFilled > balance) {
                throw new Error(
                `Недостаточно топлива на карте водителя. Доступно: ${balance}, требуется: ${fuelFilled}`,
                );
            }
            await addToFuelCardBalance(driverId, -fuelFilled);
        }

        // Автоматическое списание фактического расхода со склада
        const fuelAtStart = w.fuelAtStart ?? 0;
        const fuelFilledLocal = w.fuelFilled ?? 0; // use a local var to avoid shadowing
        const fuelAtEnd = w.fuelAtEnd ?? 0;

        const actualConsumption = fuelAtStart + fuelFilledLocal - fuelAtEnd;
        
        if (actualConsumption > 0 && w.vehicleId) {
            const vehicle = vehicles.find(v => v.id === w.vehicleId);
            let stockItemId: string | undefined;

            if (vehicle?.fuelTypeId) {
                // Find an active stock item that is fuel of the correct type
                const fuelStockItem = garageStockItems.find(item => item.fuelTypeId === vehicle.fuelTypeId && item.isActive);
                stockItemId = fuelStockItem?.id;
            }

            if (stockItemId) {
                const existingTx = stockTransactions.find(
                    t => t.waybillId === w.id && t.expenseReason === 'waybill',
                );

                if (!existingTx) {
                    const tx = await addStockTransaction({
                        docNumber: `waybill-${w.number}`,
                        date: w.date,
                        organizationId: w.organizationId,
                        type: 'expense',
                        expenseReason: 'waybill',
                        items: [{ stockItemId, quantity: actualConsumption, unit: 'л' }],
                        vehicleId: w.vehicleId,
                        driverId: w.driverId,
                        waybillId: w.id,
                    });

                    const ids = w.linkedStockTransactionIds ?? [];
                    if (!ids.includes(tx.id)) {
                        w.linkedStockTransactionIds = [...ids, tx.id];
                    }
                }
            }
        }
    }

    if (!w.blankId) throw new Error('Не указан номер бланка ПЛ');
    const blank = waybillBlanks.find(b => b.id === w.blankId);
    if (!blank) throw new Error('Связанный бланк не найден.');
    if (blank.status !== 'reserved' && blank.status !== 'issued') {
        const statusName = BLANK_STATUS_TRANSLATIONS[blank.status] || blank.status;
        throw new Error(`Бланк недоступен (статус: ${statusName}).`);
    }
    blank.status = 'used';
    blank.usedInWaybillId = w.id;
    blank.usedAt = now;
    await appendEvent({ id: generateId('ev'), at: now, type: 'waybill.numberUsed', payload: { waybillId: w.id, series: blank.series, number: blank.number } });
  }

  if (next === WaybillStatus.CANCELLED) {
    if(w.blankId) {
        const blank = waybillBlanks.find(b => b.id === w.blankId);
        if (blank && blank.status === 'reserved') {
            blank.status = 'issued';
            blank.reservedByWaybillId = null;
            blank.reservedAt = null;
        }
    }
  }

  w.status = next;
  w.updatedAt = now;
  
  if (next === WaybillStatus.SUBMITTED) {
    w.submittedBy = ctx.userId;
    await appendEvent({ id: generateId('ev'), at: now, userId: ctx.userId, type: 'waybill.submitted', payload: { waybillId } });
  }
  if (next === WaybillStatus.POSTED) {
    w.postedAt = now;
    w.postedBy = ctx.userId;
    await appendEvent({ id: generateId('ev'), at: now, userId: ctx.userId, type: 'waybill.posted', payload: { waybillId } });
  }
  if (next === WaybillStatus.CANCELLED) {
    w.cancelledAt = now;
    w.cancelledBy = ctx.userId;
    await appendEvent({ id: generateId('ev'), at: now, userId: ctx.userId, type: 'waybill.cancelled', payload: { waybillId } });
  }

  await commit(['waybills', 'audit', 'blanks', 'employees', 'stock']);
  return simulateNetwork({
    data: w,
    meta: {
      updatedAt: now,
    },
  });
};

export const fetchWaybillById = async (waybillId: string): Promise<MockWaybill | null> => {
  const waybill = waybills.find((item) => item.id === waybillId);
  return simulateNetwork(waybill ?? null);
};

export interface DashboardOverview {
  organizationsTotal: number;
  organizationsActive: number;
  vehiclesActive: number;
  vehiclesArchived: number;
  driversActive: number;
  waybillsDraft: number;
  waybillsCompletedLast30Days: number;
  fuelBalanceTotal: number;
  fuelBalanceCritical: number;
}

export const getDashboardOverview = async (): Promise<DashboardOverview> => {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const organizationsTotal = organizations.length;
  const organizationsActive = organizations.filter(
    (org) => org.status === OrganizationStatus.ACTIVE,
  ).length;
  const vehiclesActive = vehicles.filter((vehicle) => vehicle.status === VehicleStatus.ACTIVE)
    .length;
  const vehiclesArchived = vehicles.filter(
    (vehicle) => vehicle.status === VehicleStatus.ARCHIVED,
  ).length;
  const driversActive = drivers.filter((driver) => driver.status === 'Active').length;
  const waybillsDraft = waybills.filter((waybill) => waybill.status === WaybillStatus.DRAFT).length;
  const waybillsCompletedLast30Days = waybills.filter((waybill) => {
    if (waybill.status !== WaybillStatus.COMPLETED) {
      return false;
    }
    const completeDate = new Date(waybill.date).getTime();
    return completeDate >= thirtyDaysAgo;
  }).length;

  const fuelBalanceTotal = storages.reduce(
    (sum, storage) => sum + (storage.currentLevelLiters ?? 0),
    0,
  );

  const fuelBalanceCritical = storages
    .filter((storage) => (storage.currentLevelLiters ?? 0) <= (storage.safetyStockLiters ?? 0))
    .reduce((sum, storage) => sum + (storage.currentLevelLiters ?? 0), 0);

  return simulateNetwork({
    organizationsTotal,
    organizationsActive,
    vehiclesActive,
    vehiclesArchived,
    driversActive,
    waybillsDraft,
    waybillsCompletedLast30Days,
    fuelBalanceTotal: Number(fuelBalanceTotal.toFixed(2)),
    fuelBalanceCritical: Number(fuelBalanceCritical.toFixed(2)),
  });
};

export const getIssues = async (filters: { vehicleId?: string } = {}) => {
  const expiringDocs: { type: string; name: string; date: string }[] = [];
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const safeVehicles = vehicles || [];
  const safeDrivers = drivers || [];

  const vehiclesToCheck = filters.vehicleId ? safeVehicles.filter(v => v.id === filters.vehicleId) : [...safeVehicles];
  const assignedDriverId = vehiclesToCheck.length === 1 ? vehiclesToCheck[0].assignedDriverId : null;
  const driversToCheck = filters.vehicleId
      ? (assignedDriverId ? safeDrivers.filter(d => d.id === assignedDriverId) : [])
      : [...safeDrivers];

  driversToCheck.forEach(d => {
    if (d.documentExpiry && new Date(d.documentExpiry) < in30Days) {
      expiringDocs.push({ type: 'Водительское удостоверение', name: d.shortName, date: d.documentExpiry });
    }
    if (d.medicalCertificateExpiryDate && new Date(d.medicalCertificateExpiryDate) < in30Days) {
      expiringDocs.push({ type: 'Мед. справка', name: d.shortName, date: d.medicalCertificateExpiryDate });
    }
  });

  vehiclesToCheck.forEach(v => {
    if (v.diagnosticCardExpiryDate && new Date(v.diagnosticCardExpiryDate) < in30Days) {
      expiringDocs.push({ type: 'Диагностическая карта', name: v.plateNumber, date: v.diagnosticCardExpiryDate });
    }
    if (v.osagoEndDate && new Date(v.osagoEndDate) < in30Days) {
      expiringDocs.push({ type: 'ОСАГО', name: v.plateNumber, date: v.osagoEndDate });
    }
  });

  return simulateNetwork({ expiringDocs });
};

export const getDashboardData = async (filters: { vehicleId: string; dateFrom: string; dateTo: string }) => {
    await initFromStorage();
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentQuarter = Math.floor(currentMonth / 3);

    // Filter waybills for the SELECTED vehicle and ONLY COMPLETED ones
    // We load ALL completed waybills for the CURRENT YEAR to calculate metrics independently of date filter
    const yearStart = new Date(currentYear, 0, 1).toISOString().split('T')[0];
    const yearEnd = new Date(currentYear, 11, 31).toISOString().split('T')[0];

    const relevantWaybills = waybills.filter(w => 
        w.status === WaybillStatus.POSTED &&
        (!filters.vehicleId || w.vehicleId === filters.vehicleId) &&
        w.date >= yearStart && w.date <= yearEnd
    );

    // Initialize counters
    let mileageMonth = 0;
    let mileageQuarter = 0;
    let mileageYear = 0;
    let fuelMonth = 0;
    let fuelQuarter = 0;
    let fuelYear = 0;

    for (const w of relevantWaybills) {
        const wDate = new Date(w.date);
        const wYear = wDate.getFullYear();
        const wMonth = wDate.getMonth();
        const wQuarter = Math.floor(wMonth / 3);

        const mileage = (w.odometerEnd ?? w.odometerStart) - w.odometerStart;
        const consumption = (w.fuelAtStart ?? 0) + (w.fuelFilled ?? 0) - (w.fuelAtEnd ?? 0);
        const fuelConsumed = consumption > 0 ? consumption : 0;

        if (wYear === currentYear) {
            mileageYear += mileage;
            fuelYear += fuelConsumed;

            if (wQuarter === currentQuarter) {
                mileageQuarter += mileage;
                fuelQuarter += fuelConsumed;
            }

            if (wMonth === currentMonth) {
                mileageMonth += mileage;
                fuelMonth += fuelConsumed;
            }
        }
    }

    // Current Fuel Balance (taken from Vehicle card if specific vehicle selected, or sum of all if not)
    let fuelBalance = 0;
    if (filters.vehicleId) {
        const vehicle = vehicles.find(v => v.id === filters.vehicleId);
        fuelBalance = vehicle?.currentFuel ?? 0;
        // Optionally: take from last waybill if newer? sticking to vehicle card for consistency.
    } else {
        fuelBalance = vehicles
            .filter(v => v.status === VehicleStatus.ACTIVE)
            .reduce((sum, v) => sum + (v.currentFuel ?? 0), 0);
    }
    
    // Issues calculation
    const issuesData = await getIssues({ vehicleId: filters.vehicleId });
    const issuesCount = issuesData.expiringDocs.length;

    // --- Calculate Chart Data (last 12 months) ---
    // This part still respects the filtered vehicle, but we'll compute the last 12 months rolling
    const medicalExamsByMonth: { month: string; Осмотры: number }[] = [];
    const fuelConsumptionByMonth: { month: string; Факт: number }[] = [];
    
    for (let i = 11; i >= 0; i--) {
        const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth();
        
        const waybillsInMonth = relevantWaybills.filter(w => {
            const waybillDate = new Date(w.date);
            return waybillDate.getFullYear() === year && waybillDate.getMonth() === month;
        });
        
        const examCount = waybillsInMonth.reduce((sum, w) => sum + getMedicalExamsCount(w), 0);
        const fuelConsumed = waybillsInMonth.reduce((sum, w) => {
            const consumption = (w.fuelAtStart ?? 0) + (w.fuelFilled ?? 0) - (w.fuelAtEnd ?? 0);
            return sum + (consumption > 0 ? consumption : 0);
        }, 0);
        
        const monthName = targetDate.toLocaleString('ru-RU', { month: 'short' });
        const label = monthName.charAt(0).toUpperCase() + monthName.slice(1).replace('.', '');

        medicalExamsByMonth.push({ month: label, Осмотры: examCount });
        fuelConsumptionByMonth.push({ month: label, Факт: Number(fuelConsumed.toFixed(0)) });
    }

    return simulateNetwork({
        kpi: {
            mileageMonth: Math.round(mileageMonth),
            mileageQuarter: Math.round(mileageQuarter),
            mileageYear: Math.round(mileageYear),
            
            fuelMonth: Number(fuelMonth.toFixed(1)),
            fuelQuarter: Number(fuelQuarter.toFixed(1)),
            fuelYear: Number(fuelYear.toFixed(1)),

            totalFuelBalance: fuelBalance,
            issues: issuesCount,
        },
        fuelConsumptionByMonth,
        medicalExamsByMonth,
    });
};

export const getWaybills = async () => {
  await initFromStorage();
  const orgMap = new Map(organizations.map(o => [o.id, o.shortName]));
  const vehicleMap = new Map(vehicles.map(v => [v.id, `${v.brand} ${v.plateNumber}`]));
  const driverMap = new Map(drivers.map(d => [d.id, d.shortName]));
  
  const enriched = waybills.map(w => ({
    ...w,
    organization: orgMap.get(w.organizationId) || '?',
    vehicle: vehicleMap.get(w.vehicleId) || '?',
    driver: driverMap.get(w.driverId) || '?'
  }));
  return simulateNetwork(enriched);
};
export const deleteWaybill = async (id: string, markAsSpoiled: boolean) => {
    await initFromStorage();
    const idx = waybills.findIndex(w => w.id === id);
    if (idx === -1) return simulateNetwork(undefined);
    const w = waybills[idx];
  
    if (w.status === WaybillStatus.POSTED) {
      throw new Error('Нельзя удалить проведённый ПЛ. Используйте корректировку.');
    }
  
    if (w.blankId) {
      if (markAsSpoiled) {
        const blank = waybillBlanks.find(b => b.id === w.blankId);
        if(blank) {
            blank.status = 'spoiled';
            blank.spoiledAt = new Date().toISOString();
        }
      } else {
        const blank = waybillBlanks.find(b => b.id === w.blankId);
        if (blank && blank.status === 'reserved') {
            blank.status = 'issued';
            blank.reservedByWaybillId = null;
            blank.reservedAt = null;
        }
      }
    }
  
    waybills.splice(idx, 1);
    await commit(['waybills', 'blanks', 'audit']);
    return simulateNetwork(undefined);
};
export const updateWaybill = async (w: Waybill): Promise<Waybill> => {
    await initFromStorage();
    const i = waybills.findIndex(x => x.id === w.id);
    if (i > -1) {
      const oldWaybill = waybills[i];
      if (w.status === WaybillStatus.DRAFT && oldWaybill.blankId !== w.blankId) {
        if (oldWaybill.blankId) {
            const oldBlank = waybillBlanks.find(b => b.id === oldWaybill.blankId);
            if (oldBlank && oldBlank.status === 'reserved') {
                oldBlank.status = 'issued';
                oldBlank.reservedAt = null;
                oldBlank.reservedByWaybillId = null;
            }
        }
        if (w.blankId) {
            const newBlank = waybillBlanks.find(b => b.id === w.blankId);
            if (newBlank && newBlank.status === 'issued') {
                newBlank.status = 'reserved';
                newBlank.reservedAt = new Date().toISOString();
                newBlank.reservedByWaybillId = w.id;
            }
        }
      }
      w.updatedAt = new Date().toISOString();
      waybills[i] = w;
      await commit(['waybills', 'blanks']);
    }
    return simulateNetwork(w);
};
export const addWaybill = async (waybill: Omit<Waybill, 'id'>): Promise<Waybill> => {
    await initFromStorage();
    const now = new Date().toISOString();
    const newWaybill: Waybill = { ...waybill, id: generateId('wb'), createdAt: now, updatedAt: now };
  
    if (newWaybill.blankId) {
        const blank = waybillBlanks.find(b => b.id === newWaybill.blankId);
        if (blank && blank.status === 'issued') {
            blank.status = 'reserved';
            blank.reservedAt = now;
            blank.reservedByWaybillId = newWaybill.id;
        } else if (blank) {
            const statusName = BLANK_STATUS_TRANSLATIONS[blank.status] || blank.status;
            throw new Error(`Бланк ${blank.series} ${String(blank.number).padStart(6, '0')} недоступен (статус: ${statusName}).`);
        }
    }
  
    waybills.push(newWaybill);
    await appendEvent({ id: generateId('ev'), at: now, type: 'waybill.created', payload: { waybillId: newWaybill.id } });
    await commit(['waybills', 'audit', 'blanks']);
    return simulateNetwork(newWaybill);
};
export const getLatestWaybill = async (): Promise<Waybill | null> => {
    await initFromStorage();
    if (waybills.length === 0) return simulateNetwork(null);
    const sorted = [...waybills].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return simulateNetwork(sorted[0]);
}
export const getVehicles = async (): Promise<MockVehicle[]> => { await initFromStorage(); return simulateNetwork(clone(vehicles)); };
export const getEmployees = async (): Promise<MockDriver[]> => { await initFromStorage(); return simulateNetwork(clone(drivers)); };
export const getOrganizations = async (): Promise<MockOrganization[]> => { await initFromStorage(); return simulateNetwork(clone(organizations)); };
export const getMedicalExamsCount = (w: Waybill): number => {
    // Запрос пользователя: 1 осмотр на каждую уникальную дату в маршрутах ПЛ.
    const uniqueDates = new Set<string>();
    
    if (w.routes && w.routes.length > 0) {
        w.routes.forEach(r => {
             // Если дата маршрута не указана, используем дату самого путевого листа
             const d = r.date ? r.date : w.date;
             if (d) uniqueDates.add(d);
        });
    }
    
    // Если список дат пуст (нет маршрутов), считаем 1 осмотр на дату ПЛ
    if (uniqueDates.size === 0 && w.date) {
        uniqueDates.add(w.date);
    }
    
    return uniqueDates.size || 1;
};


export const dumpAllDataForExport = async (): Promise<Record<string, unknown>> => {
    await initFromStorage();
    const data: Record<string, unknown> = {
        [DB_KEYS.ORGANIZATIONS]: organizations,
        [DB_KEYS.VEHICLES]: vehicles,
        [DB_KEYS.EMPLOYEES]: drivers,
        [DB_KEYS.FUEL_TYPES]: fuelTypes,
        [DB_KEYS.WAYBILLS]: waybills,
        [DB_KEYS.GARAGE_STOCK_ITEMS]: garageStockItems,
        [DB_KEYS.STOCK_TRANSACTIONS]: stockTransactions,
        [DB_KEYS.WAYBILL_BLANK_BATCHES]: waybillBlankBatches,
        [DB_KEYS.WAYBILL_BLANKS]: waybillBlanks,
        [DB_KEYS.USERS]: users,
        [DB_KEYS.ROLE_POLICIES]: rolePolicies,
        // These are loaded directly, not through memory state
        [DB_KEYS.SEASON_SETTINGS]: await loadJSON(DB_KEYS.SEASON_SETTINGS, null),
        [DB_KEYS.APP_SETTINGS]: await loadJSON(DB_KEYS.APP_SETTINGS, null),
        [DB_KEYS.PRINT_POSITIONS]: await loadJSON(DB_KEYS.PRINT_POSITIONS, null),
        [DB_KEYS.PRINT_EDITOR_PREFS]: await loadJSON(DB_KEYS.PRINT_EDITOR_PREFS, null),
    };

    // Filter out null values to avoid exporting empty keys
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== null));
};


export const mockApi = {
  fetchOrganizations,
  fetchVehicles,
  fetchDrivers,
  fetchStorages,
  fetchWaybills,
  fetchWaybillById,
  fetchStockTransactions,
  getStockBalances,
  getDashboardOverview,
  createStockTransaction,
  updateWaybillStatus,
  reset: resetMockApiState,
};

export default mockApi;

// --- Other missing exports ---

export const getFuelTypes = async (): Promise<FuelType[]> => { await initFromStorage(); return simulateNetwork(clone(fuelTypes)); };
export const getSavedRoutes = async (): Promise<any[]> => { await initFromStorage(); return simulateNetwork([]); };
export const getSeasonSettings = async (): Promise<SeasonSettings> => { await initFromStorage(); return (await loadJSON(DB_KEYS.SEASON_SETTINGS, { type: 'recurring', summerDay: 1, summerMonth: 4, winterDay: 1, winterMonth: 11 })); };
export const isWinterDate = (date: string, settings: SeasonSettings): boolean => {
    const d = new Date(date);
    if (settings.type === 'manual') {
        return d >= new Date(settings.winterStartDate) && d <= new Date(settings.winterEndDate);
    }
    const summerStart = new Date(d.getFullYear(), settings.summerMonth - 1, settings.summerDay);
    const winterStart = new Date(d.getFullYear(), settings.winterMonth - 1, settings.winterDay);
    if (summerStart < winterStart) {
        return d < summerStart || d >= winterStart;
    } else {
        return d >= winterStart && d < summerStart;
    }
};
export const getLastWaybillForVehicle = async (vehicleId: string): Promise<Waybill | null> => {
    await initFromStorage();
    const vehicleWaybills = waybills.filter(w => w.vehicleId === vehicleId)
        .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return simulateNetwork(vehicleWaybills[0] || null);
};
export const getNextWaybillNumber = async (driverId: string): Promise<string | null> => {
    // This is a legacy function, use getNextBlankForDriver instead.
    return simulateNetwork(null);
};
export const getBlankBatches = async (): Promise<WaybillBlankBatch[]> => { await initFromStorage(); return simulateNetwork(clone(waybillBlankBatches)); };

export const createBlankBatch = async (data: Omit<WaybillBlankBatch, 'id' | 'status'>): Promise<WaybillBlankBatch> => {
  await initFromStorage();
  const newBatch: WaybillBlankBatch = {
    ...data,
    series: normalizeSeries(data.series),
    id: generateId('batch'),
    status: 'active',
  };
  waybillBlankBatches.push(newBatch);
  await appendEvent({ id: generateId('ev'), at: new Date().toISOString(), type: 'blanks.batchCreated', payload: { batchId: newBatch.id } });
  await commit(['blanks', 'audit']);
  return simulateNetwork(newBatch);
};

export const materializeBatch = async (batchId: string): Promise<{created: number}> => {
  await initFromStorage();
  const batch = waybillBlankBatches.find(b => b.id === batchId);
  if (!batch) throw new Error('Пачка не найдена');
  
  const blanksInBatch = waybillBlanks.filter(bl => bl.batchId === batchId);
  if (blanksInBatch.length > 0) {
      throw new Error('Пачка уже материализована.');
  }

  let created = 0;
  const now = new Date().toISOString();
  for (let i = batch.startNumber; i <= batch.endNumber; i++) {
    assertBlankUnique(batch.organizationId, batch.series, i);
    const newBlank: WaybillBlank = {
        id: generateId('blank'),
        organizationId: batch.organizationId,
        series: batch.series,
        number: i,
        status: 'available',
        batchId: batch.id,
        updatedAt: now,
        ownerEmployeeId: null,
        updatedBy: 'system',
        version: 0,
    };
    waybillBlanks.push(newBlank);
    created++;
  }
  rebuildBlankIndex();
  await appendEvent({ id: generateId('ev'), at: now, type: 'blanks.materialized', payload: { batchId: batch.id, created } });
  await commit(['blanks', 'audit']);
  return simulateNetwork({created});
};

export const getBlanks = async (): Promise<WaybillBlank[]> => { await initFromStorage(); return simulateNetwork(clone(waybillBlanks)); };

export const getNextBlankForDriver = async (driverId: string, organizationId: string): Promise<{ blankId: string; series: string; number: number } | null> => {
    await initFromStorage();
    const pool = waybillBlanks
      .filter(b => b.organizationId === organizationId && b.ownerEmployeeId === driverId && b.status === 'issued')
      .sort((a,b) => a.series.localeCompare(b.series) || a.number - b.number);
    const first = pool[0];
    return first ? { blankId: first.id, series: first.series, number: first.number } : null;
};

export const useBlankForWaybill = async (organizationId: string, series: string, number: number, waybillId: string) => {
    await initFromStorage();
    const id = blankIndex.get(keyOf(organizationId, series, number));
    if (!id) throw new Error(`Бланк ${series} ${String(number).padStart(6,'0')} не найден`);
    const b = waybillBlanks.find(x => x.id === id)!;
    if (b.status !== 'issued' && b.status !== 'reserved') {
      const statusName = BLANK_STATUS_TRANSLATIONS[b.status] || b.status;
      throw new Error(`Бланк ${series} ${String(number).padStart(6,'0')} недоступен (статус: ${statusName}).`);
    }
    const now = new Date().toISOString();
    b.status = 'used';
    b.usedInWaybillId = waybillId;
    b.usedAt = now;
    b.updatedAt = now;
    await appendEvent({ id: generateId('ev'), at: b.updatedAt!, type: 'waybill.numberUsed', payload: { waybillId, series, number } });
    await commit(['blanks', 'audit']);
    return b;
};

export const returnBlankToDriver = async (organizationId: string, series: string, number: number) => {
    await initFromStorage();
    const id = blankIndex.get(keyOf(organizationId, series, number));
    if (!id) return;
    const b = waybillBlanks.find(x => x.id === id)!;
    // if (b.status === 'used') throw new Error('Нельзя вернуть использованный бланк. Документ уже проведён.');
    const now = new Date().toISOString();
    b.status = 'issued';
    b.usedInWaybillId = null;
    b.usedAt = null;
    b.reservedAt = null;
    b.reservedByWaybillId = null;
    b.updatedAt = now;
    await appendEvent({ id: generateId('ev'), at: b.updatedAt!, type: 'blanks.returnedToDriver', payload: { series: b.series, number: b.number, driverId: b.ownerEmployeeId! } });
    await commit(['blanks', 'audit']);
};

export const spoilBlankLegacy = async (organizationId: string, series: string, number: number, reason?: string) => {
    await initFromStorage();
    const id = blankIndex.get(keyOf(organizationId, series, number));
    if (!id) return;
    const b = waybillBlanks.find(x => x.id === id)!;
    if (b.status === 'used') throw new Error('Нельзя испортить использованный бланк.');
    const now = new Date().toISOString();
    b.status = 'spoiled';
    b.usedInWaybillId = null;
    b.usedAt = null;
    b.spoiledAt = now;
    b.spoilReasonNote = reason;
    b.updatedAt = now;
    await appendEvent({ id: generateId('ev'), at: b.updatedAt!, type: 'blanks.spoiled', payload: { series: b.series, number: b.number, driverId: b.ownerEmployeeId, reason } });
    await commit(['blanks', 'audit']);
};

export const getAppSettings = async (): Promise<AppSettings> => { await initFromStorage(); return (await loadJSON(DB_KEYS.APP_SETTINGS, {isParserEnabled: true, blanks: { driverCanAddBatches: false }})); };
export const saveAppSettings = async (settings: AppSettings): Promise<void> => { await initFromStorage(); await saveJSON(DB_KEYS.APP_SETTINGS, settings); await commit(['settings']); };
export const addSavedRoutesFromWaybill = async (routes: Route[]): Promise<void> => { await initFromStorage(); /* ... logic ... */ };
export const getAvailableFuelExpenses = async (driverId: string, waybillId: string | null): Promise<StockTransaction[]> => { await initFromStorage(); return simulateNetwork(stockTransactions.filter(tx => tx.driverId === driverId && (!tx.waybillId || tx.waybillId === waybillId))); };
export const updateStockTransaction = async (tx: StockTransaction): Promise<StockTransaction> => {
    await initFromStorage();
    const index = stockTransactions.findIndex(t => t.id === tx.id);
    if (index > -1) stockTransactions[index] = tx;
    await commit(['stock']);
    return simulateNetwork(tx);
};
export const getStockTransactions = async (): Promise<StockTransaction[]> => { await initFromStorage(); return simulateNetwork(clone(stockTransactions)); };
export const getGarageStockItems = async (): Promise<GarageStockItem[]> => { await initFromStorage(); return simulateNetwork(clone(garageStockItems)); };
export const addVehicle = async (v: Omit<Vehicle, 'id'>): Promise<Vehicle> => { await initFromStorage(); const newV = {...v, id: generateId('veh')}; vehicles.push(newV); await commit(['vehicles']); return simulateNetwork(newV); };
export const updateVehicle = async (v: Vehicle): Promise<Vehicle> => { await initFromStorage(); const i = vehicles.findIndex(x=>x.id===v.id); if (i>-1) vehicles[i] = v; await commit(['vehicles']); return simulateNetwork(v); };
export const deleteVehicle = async (id: string): Promise<void> => { await initFromStorage(); vehicles = vehicles.filter(v=>v.id !== id); await commit(['vehicles']); return simulateNetwork(undefined); };
export const addFuelType = async (ft: Omit<FuelType, 'id'>): Promise<FuelType> => { await initFromStorage(); const newFt = {...ft, id: generateId('ft')}; fuelTypes.push(newFt); await commit(['settings']); return simulateNetwork(newFt); };
export const updateFuelType = async (ft: FuelType): Promise<FuelType> => { await initFromStorage(); const i = fuelTypes.findIndex(x=>x.id===ft.id); if (i > -1) fuelTypes[i] = ft; await commit(['settings']); return simulateNetwork(ft); };
export const deleteFuelType = async (id: string): Promise<void> => { await initFromStorage(); fuelTypes = fuelTypes.filter(f=>f.id !== id); await commit(['settings']); return simulateNetwork(undefined); };
export const addOrganization = async (o: Omit<Organization, 'id'>): Promise<Organization> => { await initFromStorage(); const newO = {...o, id: generateId('org')}; organizations.push(newO); await commit(['organizations']); return simulateNetwork(newO); };
export const updateOrganization = async (o: Organization): Promise<Organization> => { await initFromStorage(); const i = organizations.findIndex(x=>x.id===o.id); if (i > -1) organizations[i] = o; await commit(['organizations']); return simulateNetwork(o); };
export const deleteOrganization = async (id: string): Promise<void> => { await initFromStorage(); organizations = organizations.filter(o => o.id !== id); await commit(['organizations']); return simulateNetwork(undefined); };
export const addSavedRoute = async (r: Omit<any, 'id'>): Promise<any> => { await initFromStorage(); /* ... */ };
export const updateSavedRoute = async (r: any): Promise<any> => { await initFromStorage(); /* ... */ };
export const deleteSavedRoute = async (id: string): Promise<void> => { await initFromStorage(); /* ... */ };
export const addEmployee = async (e: Omit<Employee, 'id'>): Promise<Employee> => { await initFromStorage(); const newE = {...e, id: generateId('emp')}; drivers.push(newE); await commit(['employees']); return simulateNetwork(newE); };
export const updateEmployee = async (e: Employee): Promise<Employee> => { await initFromStorage(); const i = drivers.findIndex(x=>x.id===e.id); if (i > -1) drivers[i] = e; await commit(['employees']); return simulateNetwork(e); };
export const deleteEmployee = async (id: string): Promise<void> => { await initFromStorage(); drivers = drivers.filter(d=>d.id !== id); await commit(['employees']); return simulateNetwork(undefined); };
export const addStorage = async (s: Omit<MockStorage, 'id'>): Promise<MockStorage> => {
  await initFromStorage();
  const newS: MockStorage = {
    // provide defaults for fields not in the form
    fuelType: '',
    capacityLiters: 0,
    currentLevelLiters: 0,
    safetyStockLiters: 0,
    ...s,
    id: generateId('stor'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  storages.push(newS);
  await commit(['stock']);
  return simulateNetwork(newS);
};
export const updateStorage = async (s: MockStorage): Promise<MockStorage> => {
  await initFromStorage();
  const i = storages.findIndex(x => x.id === s.id);
  if (i > -1) {
    storages[i] = { ...storages[i], ...s, updatedAt: new Date().toISOString() };
    await commit(['stock']);
    return simulateNetwork(storages[i]);
  }
  throw new Error(`Storage not found: ${s.id}`);
};
export const deleteStorage = async (id: string): Promise<void> => {
  await initFromStorage();
  const isReferenced = vehicles.some(v => v.storageLocationId === id);
  if (isReferenced) {
      throw new Error('Нельзя удалить место хранения, т.к. оно используется в ТС.');
  }
  storages = storages.filter(s => s.id !== id);
  await commit(['stock']);
  return simulateNetwork(undefined);
};

// Вспомогательная функция поиска сотрудника по id
async function findDriverById(id: string): Promise<MockDriver | undefined> {
  await initFromStorage();
  return drivers.find(d => d.id === id);
}

// Получить текущий баланс топливной карты водителя
export const getFuelCardBalance = async (driverId: string): Promise<number> => {
  await initFromStorage();

  const driver = drivers.find(d => d.id === driverId);
  if (!driver) {
    throw new Error(`Employee (driver) not found for id=${driverId}`);
  }

  return driver.fuelCardBalance ?? 0;
};

// Изменить баланс топливной карты на delta (может быть + или -)
// Возвращает новый баланс
export const addToFuelCardBalance = async (
  driverId: string,
  delta: number,
): Promise<number> => {
  await initFromStorage();

  const idx = drivers.findIndex(d => d.id === driverId);
  if (idx === -1) {
    throw new Error(`Employee (driver) not found for id=${driverId}`);
  }

  const driver = drivers[idx];
  const current = driver.fuelCardBalance ?? 0;
  const next = current + delta;

  if (next < 0) {
    throw new Error(
      `Недостаточно средств на топливной карте для отмены операции. Текущий баланс: ${current}, требуется списать: ${-delta}`,
    );
  }

  const updated: MockDriver = { ...driver, fuelCardBalance: next };
  drivers[idx] = updated;

  // Сохраняем изменения и уведомляем подписчиков
  await commit(['employees']);

  return next;
};

export const getUsers = async (): Promise<User[]> => { await initFromStorage(); return simulateNetwork(clone(users)); };
export const addUser = async (u: Omit<User, 'id'>): Promise<User> => { await initFromStorage(); const newUser: User = { ...u, id: generateId('user') }; users.push(newUser); await commit(['settings']); return simulateNetwork(newUser); };
export const updateUser = async (u: User): Promise<User> => { await initFromStorage(); const i = users.findIndex(x => x.id === u.id); if (i > -1) { users[i] = u; await commit(['settings']); } return simulateNetwork(u); };
export const deleteUser = async (id: string): Promise<void> => { await initFromStorage(); users = users.filter(u => u.id !== id); await commit(['settings']); return simulateNetwork(undefined); };
export const saveSeasonSettings = async (s: SeasonSettings): Promise<void> => { await initFromStorage(); await saveJSON(DB_KEYS.SEASON_SETTINGS, s); await commit(['settings']); };

export const addGarageStockItem = async (item: Omit<GarageStockItem, 'id'>): Promise<GarageStockItem> => {
  await initFromStorage();
  const newItem: GarageStockItem = {
    ...item,
    id: generateId('gsi'),
    balance: item.balance ?? 0,
    isActive: item.isActive ?? true,
    lastTransactionDate: item.lastTransactionDate ?? new Date().toISOString(),
    storageType: 'centralWarehouse',
  };
  garageStockItems.push(newItem);
  await commit(['stock']);
  return simulateNetwork(newItem);
};

export const updateGarageStockItem = async (item: GarageStockItem): Promise<GarageStockItem> => {
  await initFromStorage();
  const idx = garageStockItems.findIndex(x => x.id === item.id);
  if (idx === -1) throw new Error(`GarageStockItem not found: ${item.id}`);
  garageStockItems[idx] = { ...garageStockItems[idx], ...item, lastTransactionDate: new Date().toISOString() };
  await commit(['stock']);
  return simulateNetwork(garageStockItems[idx]);
};

export const deleteGarageStockItem = async (id: string): Promise<void> => {
  await initFromStorage();
  const referenced = stockTransactions.some(tx =>
    (tx.items || []).some(it => it.stockItemId === id)
  );
  if (referenced) {
    throw new Error('Нельзя удалить позицию — есть связанные транзакции.');
  }
  garageStockItems = garageStockItems.filter(x => x.id !== id);
  await commit(['stock']);
  return simulateNetwork(undefined);
};

export const addStockTransaction = async (tx: Omit<StockTransaction, 'id'>): Promise<StockTransaction> => {
  await initFromStorage();
  const createdAt = new Date().toISOString();

  if (!Array.isArray(tx.items) || tx.items.length === 0) {
    throw new Error('Транзакция должна содержать хотя бы одну позицию.');
  }
  const ttype = tx.type;

  for (const row of tx.items) {
    const item = garageStockItems.find(i => i.id === row.stockItemId);
    if (!item) throw new Error(`Позиция склада не найдена: ${row.stockItemId}`);
    const qty = Number(row.quantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('Количество должно быть > 0');

    if (ttype === 'income') {
      item.balance = Number((item.balance + qty).toFixed(3));
      item.lastTransactionDate = createdAt;
    } else if (ttype === 'expense') {
      const next = Number((item.balance - qty).toFixed(3));
      if (next < 0) throw new Error(`Недостаточно остатка по "${item.name}". Списать ${qty}, доступно ${item.balance}.`);
      item.balance = next;
      item.lastTransactionDate = createdAt;
    } else {
      throw new Error(`Неизвестный тип транзакции: ${ttype}`);
    }
  }

  const newTx: StockTransaction = {
    ...tx,
    id: generateId('trx'),
    createdAt,
    updatedAt: createdAt,
  };
  stockTransactions.unshift(newTx);
  await commit(['stock']);

  // Пополнение топливной карты, если это fuelCardTopUp
  if (
    newTx.type === 'expense' &&
    newTx.expenseReason === 'fuelCardTopUp' &&
    newTx.driverId
  ) {
    const totalQuantity =
      newTx.items?.reduce(
        (sum, item) => sum + (item.quantity ?? 0),
        0,
      ) ?? 0;

    if (totalQuantity > 0) {
      await addToFuelCardBalance(newTx.driverId, totalQuantity);
    }
  }

  return simulateNetwork(newTx);
};

export const deleteStockTransaction = async (id: string) => {
  await initFromStorage();
  const txToDelete = stockTransactions.find(tx => tx.id === id);

  if (!txToDelete) {
    return simulateNetwork(undefined);
  }

  const createdAt = new Date().toISOString();

  const isFuelCardTopUp =
    txToDelete.type === 'expense' &&
    txToDelete.expenseReason === 'fuelCardTopUp' &&
    !!txToDelete.driverId;

  let totalQuantity = 0;

  // 1. Для fuelCardTopUp сначала проверяем, можно ли откатить баланс карты
  if (isFuelCardTopUp) {
    totalQuantity =
      txToDelete.items?.reduce(
        (sum, item) => sum + (item.quantity ?? 0),
        0,
      ) ?? 0;

    if (totalQuantity > 0 && txToDelete.driverId) {
      // Берём актуальный список сотрудников через API
      const employeesList = await getEmployees();
      const driver = employeesList.find(e => e.id === txToDelete.driverId);

      if (!driver) {
        throw new Error('Водитель для пополнения топливной карты не найден');
      }

      const currentBalance = driver.fuelCardBalance ?? 0;
      const newBalance = currentBalance - totalQuantity;

      if (newBalance < 0) {
        // Нельзя удалить пополнение: карта уйдёт в минус.
        // НИКАКИХ изменений по складу и транзакциям не делаем.
        throw new Error('Недостаточно средств на топливной карте для отмены пополнения');
      }
    }
  }

  // 2. Откатываем изменения на складе
  for (const row of txToDelete.items) {
    const item = garageStockItems.find(i => i.id === row.stockItemId);
    if (!item) continue;

    const qty = Number(row.quantity || 0);
    if (txToDelete.type === 'income') {
      // Удаление прихода уменьшает остаток
      const next = Number((item.balance - qty).toFixed(3));
      if (next < 0) {
        throw new Error(`Не удалось отменить поступление: недостаточно остатка по "${item.name}".`);
      }
      item.balance = next;
      item.lastTransactionDate = createdAt;
    } else if (txToDelete.type === 'expense') {
      // Удаление расхода увеличивает остаток
      item.balance = Number((item.balance + qty).toFixed(3));
      item.lastTransactionDate = createdAt;
    }
  }

  // 3. Откатываем пополнение топливной карты, если применимо
  if (isFuelCardTopUp && totalQuantity > 0 && txToDelete.driverId) {
    // Здесь addToFuelCardBalance уже не должен бросать,
    // т.к. предварительная проверка прошла
    await addToFuelCardBalance(txToDelete.driverId, -totalQuantity);
  }

  // 4. Удаляем саму транзакцию
  stockTransactions = stockTransactions.filter(tx => tx.id !== id);
  await commit(['stock', 'employees']);

  return simulateNetwork(undefined);
};
const normalizeSeries = (s: string) => (s ?? '').trim().toUpperCase();
const keyOf = (orgId: string, series: string, num: number) => `${orgId}:${normalizeSeries(series)}:${num}`;
let blankIndex = new Map<string, string>();

function rebuildBlankIndex() {
  blankIndex.clear();
  for (const b of waybillBlanks) blankIndex.set(keyOf(b.organizationId, b.series, b.number), b.id);
}

function assertBlankUnique(orgId: string, series: string, number: number) {
  if (blankIndex.has(keyOf(orgId, series, number))) {
    throw new Error(`Бланк ${series} ${String(number).padStart(6, '0')} уже существует`);
  }
}

function migrateWaybills(src: any[]): Waybill[] {
    return (src ?? []).map((w) => {
      if (w.status === 'Completed') w.status = WaybillStatus.POSTED;
      if (!w.blankSeries || !w.blankNumber) {
        const m = String(w.number ?? '').trim().match(/^([^\d]+)\s*0*?(\d+)$/);
        if (m) {
          w.blankSeries = m[1].trim().toUpperCase();
          w.blankNumber = parseInt(m[2], 10);
        }
      }
      if (!w.createdAt) w.createdAt = new Date().toISOString();
      if (!w.updatedAt) w.updatedAt = w.createdAt;
      return w;
    });
}
function migrateBlanks(old: any[]): WaybillBlank[] {
    const now = new Date().toISOString();
    const list = (old ?? []).map((b) => {
      if (b.status === 'returned') b.status = 'issued';
      b.series = normalizeSeries(b.series);
      b.version = b.version ?? 0;
      b.updatedAt = b.updatedAt ?? now;
      b.updatedBy = b.updatedBy ?? 'system';
      b.ownerEmployeeId = b.ownerEmployeeId ?? null;
      b.batchId = b.batchId ?? 'migrated';
      return b;
    });
    return list;
}

let initialized = false;
async function initFromStorage() {
  if (initialized) return;
  initialized = true;

  const hasBeenSeededOrCleared = await loadJSON<boolean>(DB_KEYS.DB_SEEDED_FLAG, false);

  const [
    loadedWaybills, loadedVehicles, loadedEmployees, loadedOrgs, 
    loadedFuelTypes, loadedStockItems, loadedTransactions, 
    loadedBatches, loadedBlanks, loadedUsers,
    loadedPolicies, loadedAppSettings, loadedSeasonSettings
  ] = await Promise.all([
    loadJSON(DB_KEYS.WAYBILLS, hasBeenSeededOrCleared ? [] : initialWaybills),
    loadJSON(DB_KEYS.VEHICLES, hasBeenSeededOrCleared ? [] : initialVehicles),
    loadJSON(DB_KEYS.EMPLOYEES, hasBeenSeededOrCleared ? [] : initialDrivers),
    loadJSON(DB_KEYS.ORGANIZATIONS, hasBeenSeededOrCleared ? [] : initialOrganizations),
    loadJSON(DB_KEYS.FUEL_TYPES, hasBeenSeededOrCleared ? [] : initialFuelTypes),
    loadJSON(DB_KEYS.GARAGE_STOCK_ITEMS, hasBeenSeededOrCleared ? [] : initialGarageStockItems),
    loadJSON(DB_KEYS.STOCK_TRANSACTIONS, hasBeenSeededOrCleared ? [] : initialStockTransactions),
    loadJSON(DB_KEYS.WAYBILL_BLANK_BATCHES, []),
    loadJSON(DB_KEYS.WAYBILL_BLANKS, []),
    loadJSON(DB_KEYS.USERS, hasBeenSeededOrCleared ? [] : initialUsers),
    loadJSON(DB_KEYS.ROLE_POLICIES, DEFAULT_ROLE_POLICIES),
    loadJSON(DB_KEYS.APP_SETTINGS, null),
    loadJSON(DB_KEYS.SEASON_SETTINGS, null),
  ]);

  organizations = loadedOrgs || [];
  vehicles = loadedVehicles || [];
  drivers = loadedEmployees || [];
  fuelTypes = loadedFuelTypes || [];
  garageStockItems = loadedStockItems || [];
  stockTransactions = loadedTransactions || [];
  waybills = migrateWaybills(loadedWaybills);
  waybillBlankBatches = loadedBatches || [];
  waybillBlanks = migrateBlanks(loadedBlanks);
  users = loadedUsers || [];
  rolePolicies = loadedPolicies || clone(DEFAULT_ROLE_POLICIES);
  
  // Если объекты конфигурации отсутствуют (например, после полной очистки),
  // восстанавливаем их из значений по умолчанию и сохраняем обратно в хранилище.
  if (loadedAppSettings === null) {
    await saveJSON(DB_KEYS.APP_SETTINGS, { isParserEnabled: true, blanks: { driverCanAddBatches: false } });
  }
  if (loadedSeasonSettings === null) {
    await saveJSON(DB_KEYS.SEASON_SETTINGS, { type: 'recurring', summerDay: 1, summerMonth: 4, winterDay: 1, winterMonth: 11 });
  }

  // Migration from old employee fields
  const currentBlankIndex = new Set(waybillBlanks.map(b => `${b.organizationId}:${b.series}:${b.number}`));
  
  for (const driver of drivers) {
      if (driver.blankBatches && driver.blankBatches.length > 0) {
          for (const oldBatch of driver.blankBatches) {
              const newBatch: WaybillBlankBatch = {
                  id: oldBatch.id || generateId('bb'),
                  organizationId: driver.organizationId!,
                  series: normalizeSeries(oldBatch.series),
                  startNumber: parseInt(oldBatch.startNumber, 10),
                  endNumber: parseInt(oldBatch.endNumber, 10),
                  status: 'active',
              };
              if (!waybillBlankBatches.some(b => b.id === newBatch.id)) {
                  waybillBlankBatches.push(newBatch);
              }
              const now = new Date().toISOString();
              for (let num = newBatch.startNumber; num <= newBatch.endNumber; num++) {
                  if (!currentBlankIndex.has(`${newBatch.organizationId}:${newBatch.series}:${num}`)) {
                      waybillBlanks.push({
                          id: generateId('bl'),
                          organizationId: newBatch.organizationId,
                          series: newBatch.series,
                          number: num,
                          status: 'issued',
                          batchId: newBatch.id,
                          ownerEmployeeId: driver.id,
                          updatedAt: now,
                          updatedBy: 'migration',
                          version: 0,
                      });
                      currentBlankIndex.add(`${newBatch.organizationId}:${newBatch.series}:${num}`);
                  }
              }
          }
          delete driver.blankBatches;
      }

      if (driver.spoiledBlanks && driver.spoiledBlanks.length > 0) {
          for (const spoiled of driver.spoiledBlanks) {
              const series = normalizeSeries(spoiled.series);
              const number = parseInt(spoiled.number, 10);
              const existing = waybillBlanks.find(b => b.series === series && b.number === number);
              if (existing) {
                  existing.status = 'spoiled';
              }
          }
          delete driver.spoiledBlanks;
      }
  }

  for (const wb of waybills) {
      if(wb.blankId) {
          const existing = waybillBlanks.find(b => b.id === wb.blankId);
          if(existing) {
              if (wb.status === WaybillStatus.POSTED) existing.status = 'used';
              else if (wb.status === WaybillStatus.DRAFT) existing.status = 'reserved';
              existing.usedInWaybillId = wb.id;
          }
      }
  }

  rebuildBlankIndex();
  // This call overwrites all data with the in-memory state upon initialization, which can cause data loss
  // if another process has modified the storage.
  // Instead, we will only save the data that was actually modified during migration.
  await Promise.all([
    saveJSON(DB_KEYS.EMPLOYEES, drivers),
    saveJSON(DB_KEYS.WAYBILLS, waybills),
    saveJSON(DB_KEYS.WAYBILL_BLANK_BATCHES, waybillBlankBatches),
    saveJSON(DB_KEYS.WAYBILL_BLANKS, waybillBlanks),
  ]);

  if (!hasBeenSeededOrCleared) {
    await saveJSON(DB_KEYS.DB_SEEDED_FLAG, true);
  }
}

async function persistAll() {
  await Promise.all([
    saveJSON(DB_KEYS.ORGANIZATIONS, organizations),
    saveJSON(DB_KEYS.VEHICLES, vehicles),
    saveJSON(DB_KEYS.EMPLOYEES, drivers),
    saveJSON(DB_KEYS.FUEL_TYPES, fuelTypes),
    saveJSON(DB_KEYS.WAYBILLS, waybills),
    saveJSON(DB_KEYS.GARAGE_STOCK_ITEMS, garageStockItems),
    saveJSON(DB_KEYS.STOCK_TRANSACTIONS, stockTransactions),
    saveJSON(DB_KEYS.WAYBILL_BLANK_BATCHES, waybillBlankBatches),
    saveJSON(DB_KEYS.WAYBILL_BLANKS, waybillBlanks),
    saveJSON(DB_KEYS.USERS, users),
    saveJSON(DB_KEYS.ROLE_POLICIES, rolePolicies),
  ]);
}

async function commit(topics: Array<'waybills' | 'employees' | 'vehicles' | 'organizations' | 'stock' | 'blanks' | 'settings' | 'audit' | 'policies'>) {
  await persistAll();
  topics.forEach((t) => broadcast(t));
}

// --- NEW BLANK MANAGEMENT FUNCTIONS ---

type IssueResult = {
  issued: { blankId: string; number: number }[];
  skipped: { number: number; reason: 'not_available'|'not_found'|'not_in_batch'|'already_issued'|'reserved'|'used'|'spoiled' }[];
  auditId: string;
};

export async function issueBlanksToDriver(params: unknown, ctx: { actorId: string; deviceId: string }) : Promise<IssueResult> {
  const p = IssueBlanksSchema.parse(params);
  await initFromStorage();
  
  const inBatch = waybillBlanks.filter(b => b.batchId === p.batchId);
  if (!inBatch.length) throw new Error('Пачка не найдена');

  const batchMeta = waybillBlankBatches.find(b => b.id === p.batchId);
  const minN = batchMeta?.startNumber ?? Math.min(...inBatch.map(b => b.number));
  const maxN = batchMeta?.endNumber ?? Math.max(...inBatch.map(b => b.number));

  const numbers: number[] = [];
  for (const r of p.ranges) {
    if (r.from < minN || r.to > maxN) throw new Error(`Номера вне диапазона пачки: ${r.from}-${r.to}`);
    for (let n = r.from; n <= r.to; n++) numbers.push(n);
  }

  const now = new Date().toISOString();
  const issued: { blankId: string; number: number }[] = [];
  const skipped: IssueResult['skipped'] = [];

  numbers.sort((a,b)=>a-b);
  for (const number of numbers) {
    const blank = inBatch.find(b => b.number === number);
    if (!blank) { skipped.push({ number, reason: 'not_found' }); continue; }
    if (blank.status === 'available') {
      blank.status = 'issued';
      blank.ownerEmployeeId = p.ownerEmployeeId;
      blank.updatedAt = now;
      blank.updatedBy = ctx.actorId;
      blank.version = (blank.version ?? 0) + 1;
      issued.push({ blankId: blank.id, number });
    } else {
      const map: Record<string, IssueResult['skipped'][number]['reason']> = {
        issued: 'already_issued',
        returned: 'already_issued',
        reserved: 'reserved',
        used: 'used',
        spoiled: 'spoiled',
        available: 'not_available',
      };
      skipped.push({ number, reason: map[blank.status] ?? 'not_available' });
    }
  }

  await saveJSON(DB_KEYS.WAYBILL_BLANKS, waybillBlanks);

  const auditId = await auditBusiness('blanks.issued', {
    batchId: p.batchId,
    ownerEmployeeId: p.ownerEmployeeId,
    issuedNumbers: issued.map(i => i.number),
    skipped,
    actorId: ctx.actorId,
    deviceId: ctx.deviceId,
    at: now,
  });

  broadcast('blanks');

  return { issued, skipped, auditId };
}

function canSpoilInline(blank: WaybillBlank, ctx: {
  abilities?: Set<string>;
  actorEmployeeId?: string | null;
}) {
  const abilities = ctx.abilities ?? new Set<string>();
  const st = blank.status;

  if (st === 'reserved' || st === 'used' || st === 'spoiled') {
    return { ok: false as const, reason: 'status_forbidden' as const };
  }
  if (st === 'available') {
    return abilities.has('blanks.spoil.warehouse')
      ? { ok: true as const }
      : { ok: false as const, reason: 'no_permission' as const };
  }
  if (st === 'issued' || st === 'returned') {
    if (abilities.has('blanks.spoil.override')) return { ok: true as const };
    if (abilities.has('blanks.spoil.self') && ctx.actorEmployeeId && ctx.actorEmployeeId === blank.ownerEmployeeId) {
      return { ok: true as const };
    }
    return { ok: false as const, reason: 'not_owner' as const };
  }
  return { ok: false as const, reason: 'status_forbidden' as const };
}


export async function spoilBlank(params: unknown, ctx: { abilities: Set<string>; actorId: string; actorEmployeeId?: string|null; deviceId: string }) {
  const p = SpoilBlankSchema.parse(params);
  await initFromStorage();
  const idx = waybillBlanks.findIndex(b => b.id === p.blankId);
  if (idx < 0) throw new Error('Бланк не найден');
  const blank = waybillBlanks[idx];
  const statusBefore = blank.status;

  const perm = canSpoilInline(blank, { abilities: ctx.abilities, actorEmployeeId: ctx.actorEmployeeId ?? null });
  if (!perm.ok) {
    if (perm.reason === 'status_forbidden') throw new Error('Недопустимый статус для списания');
    if (perm.reason === 'not_owner') throw new Error('Можно списывать только свои бланки');
    throw new Error('Недостаточно прав');
  }
  const now = new Date().toISOString();

  blank.status = 'spoiled';
  blank.spoiledAt = now;
  blank.spoiledBy = ctx.actorId;
  blank.spoilReasonCode = p.reasonCode;
  blank.spoilReasonNote = p.note ?? '';
  blank.updatedAt = now;
  blank.updatedBy = ctx.actorId;
  blank.version = (blank.version ?? 0) + 1;

  await saveJSON(DB_KEYS.WAYBILL_BLANKS, waybillBlanks);

  await auditBusiness('blank.spoiled', {
    blankId: blank.id,
    series: blank.series,
    number: blank.number,
    statusBefore,
    ownerEmployeeId: blank.ownerEmployeeId,
    reasonCode: p.reasonCode,
    note: p.note ?? '',
    actorId: ctx.actorId,
    deviceId: ctx.deviceId,
    at: now,
  });
  
  broadcast('blanks');
}

export type BulkSpoilResult = {
  spoiled: { blankId: string; series: string; number: number }[];
  skipped: { blankId: string; series: string; number: number; reason: 'status_forbidden'|'not_owner'|'not_found'|'no_permission' }[];
  auditId?: string;
};

export async function bulkSpoilBlanks(
  input: unknown,
  ctx: { abilities?: Set<string>; actorId: string; actorEmployeeId?: string | null; deviceId: string }
): Promise<BulkSpoilResult> {
  const p = BulkSpoilInputSchema.parse(input);
  await initFromStorage();
  const now = new Date().toISOString();

  let candidateIds: string[];
  if (p.kind === 'ids') {
    candidateIds = p.blankIds;
  } else {
    const limit = p.limit ?? 2000;
    const allMatching = await searchBlanks({ ...p.filter, page: 1, pageSize: 9999 });
    const excluded = new Set(p.excludedIds || []);
    candidateIds = allMatching.items.filter(b => !excluded.has(b.id)).slice(0, limit).map(b => b.id);
  }
  
  const spoiled: BulkSpoilResult['spoiled'] = [];
  const skipped: BulkSpoilResult['skipped'] = [];

  for (const id of candidateIds) {
    const b = waybillBlanks.find(x => x.id === id);
    if (!b) { skipped.push({ blankId: id, series: '?', number: 0, reason: 'not_found' }); continue; }

    const perm = canSpoilInline(b, { abilities: ctx.abilities, actorEmployeeId: ctx.actorEmployeeId ?? null });
    if (!perm.ok) { 
        skipped.push({ blankId: id, series: b.series, number: b.number, reason: perm.reason }); 
        continue; 
    }

    if (!p.dryRun) {
      b.status = 'spoiled';
      b.spoiledAt = now;
      b.spoiledBy = ctx.actorId;
      b.spoilReasonCode = p.reasonCode;
      b.spoilReasonNote = p.note ?? '';
      b.updatedAt = now;
      b.updatedBy = ctx.actorId;
      b.version = (b.version ?? 0) + 1;
    }
    spoiled.push({ blankId: b.id, series: b.series, number: b.number });
  }

  let auditId: string | undefined;
  if (!p.dryRun && spoiled.length > 0) {
    await saveJSON(DB_KEYS.WAYBILL_BLANKS, waybillBlanks);
    auditId = await auditBusiness('blank.spoiled.bulk', {
      selectionSource: p.kind,
      filterSnapshot: p.kind === 'filter' ? p.filter : undefined,
      limit: p.kind === 'filter' ? (p.limit ?? 2000) : undefined,
      blankIds: spoiled.map(s => s.blankId),
      counts: { spoiled: spoiled.length, skipped: skipped.length },
      reasonCode: p.reasonCode,
      note: p.note ?? '',
      actorId: ctx.actorId,
      deviceId: ctx.deviceId,
      at: now,
    });
    broadcast('blanks');
  }

  return { spoiled, skipped, auditId };
}


export async function searchBlanks(filters: {
  orgId?: string;
  series?: string;
  number?: number | { from?: number; to?: number };
  status?: ('available'|'issued'|'returned'|'reserved'|'used'|'spoiled')[];
  ownerEmployeeId?: string | null;
  sort?: { by: 'series'|'number'|'status'|'owner'|'updatedAt'; dir: 'asc'|'desc' };
  page?: number; pageSize?: number;
}) {
  await initFromStorage();
  const normSeries = filters.series?.trim().toUpperCase();
  let rows = waybillBlanks.filter(b => !filters.orgId || b.organizationId === filters.orgId);
  if (normSeries) rows = rows.filter(b => b.series === normSeries);
  if (typeof filters.number === 'number') rows = rows.filter(b => b.number === filters.number);
  if (typeof filters.number === 'object' && filters.number) {
    const { from, to } = filters.number;
    rows = rows.filter(b => (from == null || b.number >= from) && (to == null || b.number <= to));
  }
  if (filters.status?.length) rows = rows.filter(b => filters.status!.includes(b.status));
  if (filters.ownerEmployeeId !== undefined) {
    rows = rows.filter(b => (filters.ownerEmployeeId === null ? b.ownerEmployeeId == null : b.ownerEmployeeId === filters.ownerEmployeeId));
  }
  const { by = 'updatedAt', dir = 'desc' } = filters.sort || {};
  rows.sort((a,b) => {
    const m = dir === 'asc' ? 1 : -1;
    if (by === 'number') return (a.number - b.number) * m;
    if (by === 'series') return a.series.localeCompare(b.series) * m;
    if (by === 'status') return a.status.localeCompare(b.status) * m;
    if (by === 'owner') return (a.ownerEmployeeId || '').localeCompare(b.ownerEmployeeId || '') * m;
    return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * m;
  });
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.max(1, Math.min(10000, filters.pageSize || 50));
  const total = rows.length;
  const items = rows.slice((page-1)*pageSize, page*pageSize);
  return { items, total, page, pageSize };
}

export async function countBlanksByFilter(filter: z.infer<typeof BlankFiltersSchema>): Promise<number> {
    const { total } = await searchBlanks({ ...filter, page: 1, pageSize: 1 });
    return total;
}

export async function listBlankIdsByFilter(filter: z.infer<typeof BlankFiltersSchema>, limit = 2000): Promise<string[]> {
  const pageSize = 500;
  let page = 1;
  const acc: string[] = [];
  while (acc.length < limit) {
    const { items } = await searchBlanks({ ...filter, page, pageSize, sort: { by: 'series', dir: 'asc' } });
    if (items.length === 0) break;
    acc.push(...items.map(b => b.id));
    if (items.length < pageSize) break;
    page++;
  }
  return acc.slice(0, limit);
}

export const getRolePolicies = async (): Promise<Record<Role, Capability[]>> => {
  await initFromStorage();
  return simulateNetwork(clone(rolePolicies));
};

export const saveRolePolicies = async (policies: Record<Role, Capability[]>): Promise<void> => {
  await initFromStorage();
  rolePolicies = clone(policies);
  await commit(['policies']);
};
