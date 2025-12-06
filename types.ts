
export type View = 'DASHBOARD' | 'WAYBILLS' | 'DICTIONARIES' | 'WAREHOUSE' | 'REPORTS' | 'ADMIN' | 'ABOUT' | 'USER_GUIDE' | 'ADMIN_GUIDE' | 'DEVELOPER_GUIDE' | 'TESTING_GUIDE' | 'BUSINESS_LOGIC_GUIDE' | 'CAPABILITIES_GUIDE' | 'BLANKS';

export type DictionaryType = 'fuelTypes' | 'organizations' | 'vehicles' | 'employees' | 'storageLocations' | 'routes';

export type AppMode = 'driver' | 'central';

export interface DashboardWidgetsSettings {
  showStatuses: boolean;
  showFleetStats: boolean;
  showCharts: boolean;
  showOverruns: boolean;
  showMaintenance: boolean;
  showBirthdays: boolean;
}

export interface AppSettings {
  isParserEnabled: boolean;
  appMode?: AppMode;
  blanks?: {
    driverCanAddBatches?: boolean;
  };
  enableWarehouseAccounting?: boolean;
  dashboardWidgets?: DashboardWidgetsSettings;
  tireDepreciationMethod?: 'seasonal' | 'usage'; // usage = по факту установки, seasonal = строго по сезону
}

export enum WaybillStatus {
  DRAFT = 'Draft',
  SUBMITTED = 'Submitted',
  POSTED = 'Posted',
  CANCELLED = 'Cancelled',
  COMPLETED = 'Completed',
}

export enum VehicleStatus {
  ACTIVE = 'Active',
  ARCHIVED = 'Archived',
}

export enum OrganizationStatus {
  ACTIVE = 'Active',
  ARCHIVED = 'Archived',
  LIQUIDATED = 'Liquidated',
}

export type StockTransactionType = 'income' | 'expense';
export type StockExpenseReason = 'waybill' | 'maintenance' | 'writeOff' | 'fuelCardTopUp' | 'inventoryAdjustment' | 'other';
export type StorageType = 'centralWarehouse' | 'remoteWarehouse' | 'vehicleTank' | 'contractorWarehouse';
export type BlankStatus = 'available' | 'issued' | 'reserved' | 'used' | 'returned' | 'spoiled';
export type SpoilReasonCode = 'damaged' | 'misprint' | 'lost' | 'other';

export type Capability = 
  | 'admin.panel'
  | 'import.run'
  | 'import.limited'
  | 'export.run'
  | 'audit.read'
  | 'audit.diff'
  | 'audit.rollback'
  | 'audit.delete'
  | 'audit.business.read'
  | 'waybill.create'
  | 'waybill.submit'
  | 'waybill.post'
  | 'waybill.cancel'
  | 'waybill.backdate'
  | 'waybill.correct'
  | 'blanks.issue'
  | 'blanks.return'
  | 'blanks.spoil.self'
  | 'blanks.spoil.warehouse'
  | 'blanks.spoil.override'
  | 'rbac.delegate'
  | 'stock.move';

export type Role = 'admin' | 'user' | 'auditor' | 'driver' | 'mechanic' | 'reviewer' | 'accountant' | 'viewer';

export interface User {
  id: string;
  role: Role;
  displayName: string;
  email?: string;
  extraCaps?: Capability[];
}

export interface FuelType {
  id: string;
  name: string;
  code: string;
  density: number;
  unit?: string;
  notes?: string;
}

export interface Organization {
  id: string;
  fullName: string;
  shortName: string;
  address?: string;
  postalAddress?: string;
  inn?: string;
  kpp?: string;
  oktmo?: string;
  ogrn?: string;
  registrationDate?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  bankAccount?: string;
  bankName?: string;
  bankBik?: string;
  correspondentAccount?: string;
  accountCurrency?: string;
  paymentPurpose?: string;
  status: OrganizationStatus;
  group?: string;
  notes?: string;
  medicalLicenseNumber?: string;
  medicalLicenseIssueDate?: string;
  storageIds?: string[];
  parentOrganizationId?: string | null;
  isOwn?: boolean;
}

export type EmployeeType = 'driver' | 'dispatcher' | 'mechanic' | 'controller' | 'accountant' | 'manager' | 'other';

export const EMPLOYEE_TYPE_TRANSLATIONS: Record<EmployeeType, string> = {
    driver: 'Водитель',
    dispatcher: 'Диспетчер',
    mechanic: 'Механик',
    controller: 'Контролер',
    accountant: 'Бухгалтер',
    manager: 'Руководитель',
    other: 'Другое',
};

export interface Employee {
  id: string;
  fullName: string;
  shortName: string;
  employeeType: EmployeeType;
  organizationId?: string | null;
  status: 'Active' | 'Inactive';
  position?: string;
  personnelNumber?: string;
  dateOfBirth?: string;
  address?: string;
  phone?: string;
  snils?: string;
  notes?: string;
  email?: string;
  
  // Driver specific
  licenseCategory?: string;
  documentNumber?: string;
  documentExpiry?: string;
  fuelCardNumber?: string;
  fuelCardBalance?: number;
  medicalCertificateSeries?: string;
  medicalCertificateNumber?: string;
  medicalCertificateIssueDate?: string;
  medicalCertificateExpiryDate?: string;
  medicalInstitutionId?: string;
  
  // Responsible persons
  dispatcherId?: string;
  controllerId?: string;
  
  blankBatches?: string[]; // IDs of assigned batches
}

export interface Vehicle {
  id: string;
  plateNumber: string;
  brand: string;
  vin: string;
  status: VehicleStatus;
  organizationId?: string | null;
  assignedDriverId?: string | null;
  
  year?: number;
  vehicleType?: string;
  
  // Fuel
  fuelTypeId: string;
  fuelTankCapacity?: number | null;
  currentFuel: number;
  disableFuelCapacityCheck?: boolean;
  fuelConsumptionRates: {
    summerRate: number;
    winterRate: number;
    cityIncreasePercent?: number | null;
    warmingIncreasePercent?: number | null;
  };
  useCityModifier?: boolean;
  useWarmingModifier?: boolean;
  
  // Mileage
  mileage: number;
  
  // Docs
  ptsType?: 'PTS' | 'EPTS';
  ptsSeries?: string;
  ptsNumber?: string;
  eptsNumber?: string;
  
  osagoSeries?: string;
  osagoNumber?: string;
  osagoStartDate?: string;
  osagoEndDate?: string;
  
  diagnosticCardNumber?: string;
  diagnosticCardIssueDate?: string;
  diagnosticCardExpiryDate?: string;
  
  // Maintenance
  maintenanceIntervalKm?: number | null;
  lastMaintenanceMileage?: number | null;
  maintenanceHistory?: any[]; // Simplified
  
  storageLocationId?: string | null;
  notes?: string;
}

export interface Route {
  id: string;
  from: string;
  to: string;
  distanceKm: number;
  isCityDriving: boolean;
  isWarming: boolean;
  date?: string;
  notes?: string;
}

export interface SavedRoute {
  id: string;
  from: string;
  to: string;
  distanceKm: number;
}

export interface Attachment {
  name: string;
  size: number;
  type: string;
  content: string; // base64
  userId: string;
}

export interface Waybill {
  id: string;
  number: string;
  date: string; // YYYY-MM-DD
  status: WaybillStatus;
  
  vehicleId: string;
  driverId: string;
  organizationId: string;
  dispatcherId: string;
  controllerId?: string;
  
  blankId?: string | null;
  blankSeries?: string | null;
  blankNumber?: number | null;
  
  validFrom: string; // ISO datetime
  validTo: string; // ISO datetime
  
  odometerStart: number;
  odometerEnd?: number;
  
  fuelAtStart: number;
  fuelAtEnd?: number;
  fuelFilled?: number;
  fuelPlanned?: number;
  
  routes: Route[];
  
  linkedStockTransactionIds?: string[];
  
  attachments?: Attachment[];
  
  notes?: string;
  reviewerComment?: string;
  deviationReason?: string;
  
  postedAt?: string;
  postedBy?: string;
}

export interface GarageStockItem {
  id: string;
  name: string;
  code?: string;
  itemType: 'Товар' | 'Услуга';
  group: string;
  unit: string;
  balance: number;
  storageLocation?: string;
  notes?: string;
  balanceAccount?: string;
  budgetCode?: string;
  isActive: boolean;
  
  // Fuel specific
  fuelTypeId?: string;
  
  organizationId?: string;
  lastPurchasePrice?: number;
  lastTransactionDate?: string;
}

export interface StockTransactionItem {
  stockItemId: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
  serialNumber?: string;
}

export interface StockTransaction {
  id: string;
  docNumber: string;
  date: string; // YYYY-MM-DD
  type: StockTransactionType;
  items: StockTransactionItem[];
  
  organizationId: string;
  
  // For expense
  expenseReason?: StockExpenseReason;
  vehicleId?: string;
  driverId?: string;
  waybillId?: string | null;
  
  // For income
  supplier?: string;
  supplierOrganizationId?: string;
  
  notes?: string;
}

export interface WaybillBlankBatch {
  id: string;
  organizationId: string;
  series: string;
  startNumber: number;
  endNumber: number;
  status: 'active' | 'exhausted';
  notes?: string;
}

export interface WaybillBlank {
  id: string;
  batchId: string;
  organizationId: string;
  series: string;
  number: number;
  status: BlankStatus;
  ownerEmployeeId?: string | null;
  
  usedInWaybillId?: string | null;
  reservedByWaybillId?: string | null;
  reservedAt?: string | null;
  
  spoiledAt?: string | null;
  spoilReasonCode?: SpoilReasonCode;
  spoilReasonNote?: string | null;
  
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export interface StorageLocation {
  id: string;
  name: string;
  type: StorageType;
  organizationId: string;
  address?: string;
  responsiblePerson?: string;
  description?: string;
  status: 'active' | 'archived';
}

export type TireSeason = 'Summer' | 'Winter' | 'AllSeason';
export type TireStatus = 'InStock' | 'Mounted' | 'Disposed';

export interface Tire {
  id: string;
  brand: string;
  model: string;
  size: string;
  season: TireSeason;
  status: TireStatus;
  condition: 'New' | 'Used' | 'Retread';
  
  stockItemId?: string; // Link to warehouse stock item
  
  currentVehicleId?: string | null;
  storageLocationId?: string | null;
  
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  
  startDepth?: number | null;
  currentDepth?: number | null;
  
  // Lifecycle Tracking
  installDate?: string | null;
  installOdometer?: number | null;
  
  summerMileage?: number; // Accumulated Summer Mileage
  winterMileage?: number; // Accumulated Winter Mileage
  
  estimatedLifespanKm?: number | null; // Planned resource in KM
  
  disposalDate?: string | null; // Date when status became Disposed
  utilizationDate?: string | null; // Physical disposal date
  
  notes?: string | null;
}

export interface PrintPositions {
  [key: string]: { x: number; y: number };
}

export interface KpiData {
  totalMileage: number;
  totalFuel: number;
  issues: number;
  fuelMonth: number;
  fuelQuarter: number;
  fuelYear: number;
}

export type SeasonSettings =
  | {
      type: 'recurring';
      summerDay: number;
      summerMonth: number;
      winterDay: number;
      winterMonth: number;
    }
  | {
      type: 'manual';
      winterStartDate: string;
      winterEndDate: string;
    };
