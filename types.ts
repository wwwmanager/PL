
export type View = 'DASHBOARD' | 'WAYBILLS' | 'DICTIONARIES' | 'WAREHOUSE' | 'REPORTS' | 'ADMIN' | 'ABOUT' | 'USER_GUIDE' | 'ADMIN_GUIDE' | 'DEVELOPER_GUIDE' | 'BLANKS' | 'TESTING_GUIDE' | 'MEDICAL_REPORT';

export type DictionaryType = 'fuelTypes' | 'organizations' | 'vehicles' | 'employees' | 'storageLocations' | 'routes' | 'calendar' | 'tires' | 'schedule';

export enum WaybillStatus {
  DRAFT = 'Draft',
  SUBMITTED = 'Submitted',
  POSTED = 'Posted',
  CANCELLED = 'Cancelled',
  COMPLETED = 'Completed'
}

export enum OrganizationStatus {
  ACTIVE = 'Active',
  ARCHIVED = 'Archived',
  LIQUIDATED = 'Liquidated'
}

export enum VehicleStatus {
  ACTIVE = 'Active',
  ARCHIVED = 'Archived',
  MAINTENANCE = 'Maintenance'
}

export type StockTransactionType = 'income' | 'expense';
export type StockExpenseReason = 'waybill' | 'maintenance' | 'writeOff' | 'fuelCardTopUp' | 'inventoryAdjustment' | 'other';
export type StorageType = 'centralWarehouse' | 'remoteWarehouse' | 'vehicleTank' | 'contractorWarehouse';
export type BlankStatus = 'available' | 'issued' | 'reserved' | 'used' | 'returned' | 'spoiled';
export type SpoilReasonCode = 'damaged' | 'misprint' | 'lost' | 'other';
export type Role = 'admin' | 'user' | 'auditor' | 'driver' | 'mechanic' | 'reviewer' | 'accountant' | 'viewer';
export type Capability = string;
export type EmployeeType = 'driver' | 'dispatcher' | 'mechanic' | 'controller' | 'accountant' | 'manager' | 'other';
export type WaybillCalculationMethod = 'by_total' | 'by_segment';
export type TireSeason = 'Summer' | 'Winter' | 'AllSeason';
export type TireStatus = 'InStock' | 'Mounted' | 'Disposed';
export type StockTransactionStatus = 'Draft' | 'Posted';

export interface Route {
  id: string;
  from: string;
  to: string;
  distanceKm: number;
  isCityDriving: boolean;
  isWarming: boolean;
  date?: string;
  departureTime?: string;
  arrivalTime?: string;
  notes?: string;
}

export interface Attachment {
  name: string;
  size: number;
  type: string;
  content: string;
  userId: string;
}

export interface Waybill {
  id: string;
  number: string;
  date: string;
  vehicleId: string;
  driverId: string;
  status: WaybillStatus;
  odometerStart: number;
  odometerEnd?: number;
  fuelAtStart: number;
  fuelFilled?: number;
  fuelAtEnd?: number;
  fuelPlanned?: number;
  routes: Route[];
  organizationId: string;
  dispatcherId?: string;
  controllerId?: string;
  validFrom: string;
  validTo: string;
  attachments?: Attachment[];
  reviewerComment?: string;
  deviationReason?: string;
  calculationMethod?: WaybillCalculationMethod;
  blankId?: string | null;
  blankSeries?: string | null;
  blankNumber?: number | null;
  postedAt?: string;
  postedBy?: string;
  linkedStockTransactionIds?: string[];
  notes?: string;
}

export interface Vehicle {
  id: string;
  plateNumber: string;
  brand: string;
  vin?: string;
  mileage: number;
  currentFuel?: number;
  fuelTypeId?: string;
  assignedDriverId?: string | null;
  organizationId?: string | null;
  status: VehicleStatus;
  fuelConsumptionRates: {
    summerRate: number;
    winterRate: number;
    cityIncreasePercent?: number;
    warmingIncreasePercent?: number;
  };
  useCityModifier?: boolean;
  useWarmingModifier?: boolean;
  fuelTankCapacity?: number | null;
  disableFuelCapacityCheck?: boolean;
  osagoSeries?: string | null;
  osagoNumber?: string | null;
  osagoStartDate?: string | null;
  osagoEndDate?: string | null;
  diagnosticCardNumber?: string | null;
  diagnosticCardIssueDate?: string | null;
  diagnosticCardExpiryDate?: string | null;
  maintenanceIntervalKm?: number | null;
  lastMaintenanceMileage?: number | null;
  year?: number | null;
  vehicleType?: string | null;
  notes?: string | null;
  maintenanceHistory?: any[]; // Simplified
}

export interface Employee {
  id: string;
  fullName: string;
  shortName: string;
  employeeType: EmployeeType;
  position?: string;
  organizationId?: string | null;
  status: 'Active' | 'Inactive';
  fuelCardBalance?: number;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  notes?: string | null;
  snils?: string | null;
  personnelNumber?: string | null;
  licenseCategory?: string;
  documentNumber?: string | null;
  documentExpiry?: string | null;
  fuelCardNumber?: string | null;
  medicalCertificateSeries?: string | null;
  medicalCertificateNumber?: string | null;
  medicalCertificateIssueDate?: string | null;
  medicalCertificateExpiryDate?: string | null;
  medicalInstitutionId?: string;
  blankBatches?: string[];
  dispatcherId?: string;
  controllerId?: string;
}

export interface Organization {
  id: string;
  shortName: string;
  fullName?: string;
  status: OrganizationStatus;
  inn?: string | null;
  kpp?: string | null;
  ogrn?: string | null;
  address?: string | null;
  postalAddress?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  bankAccount?: string | null;
  correspondentAccount?: string | null;
  bankName?: string | null;
  bankBik?: string | null;
  accountCurrency?: string | null;
  paymentPurpose?: string | null;
  group?: string | null;
  notes?: string | null;
  medicalLicenseNumber?: string | null;
  medicalLicenseIssueDate?: string | null;
  parentOrganizationId?: string | null;
  isOwn?: boolean;
  oktmo?: string | null;
  registrationDate?: string | null;
}

export interface FuelType {
  id: string;
  name: string;
  code: string;
  density?: number;
}

export interface SavedRoute {
  id: string;
  from: string;
  to: string;
  distanceKm: number;
}

export interface GarageStockItem {
  id: string;
  name: string;
  itemType?: string;
  group: string;
  unit: string;
  balance: number;
  code: string;
  storageLocation?: string;
  notes?: string;
  balanceAccount?: string;
  budgetCode?: string;
  isFuel?: boolean;
  fuelTypeId?: string;
  isActive: boolean;
  organizationId?: string;
  lastPurchasePrice?: number;
  lastTransactionDate?: string;
}

export interface StockTransaction {
  id: string;
  docNumber: string;
  date: string;
  type: StockTransactionType;
  status?: StockTransactionStatus;
  items: { stockItemId: string; quantity: number; unitPrice?: number; serialNumber?: string }[];
  vehicleId?: string;
  driverId?: string;
  supplier?: string;
  notes?: string;
  organizationId: string;
  expenseReason?: StockExpenseReason;
  supplierOrganizationId?: string;
  waybillId?: string | null;
}

export interface FuelCardSchedule {
  id: string;
  driverId: string;
  stockItemId: string;
  quantity: number;
  frequency: 'monthly' | 'quarterly';
  isActive: boolean;
  notes?: string;
  lastExecutedAt?: string;
}

export interface CalendarEvent {
  id: string;
  date: string;
  type: 'workday' | 'holiday' | 'short';
  note?: string;
}

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
  appMode: 'driver' | 'central';
  autoSaveRoutes?: boolean;
  customLogo?: string | null;
  blanks?: {
    driverCanAddBatches?: boolean;
  };
  dashboardWidgets?: DashboardWidgetsSettings;
  enableWarehouseAccounting?: boolean;
  tireDepreciationMethod?: 'usage' | 'seasonal';
}

export interface PeriodLock {
  id: string;
  period: string;
  lockedAt: string;
  lockedByUserId: string;
  dataHash: string;
  recordCount: number;
  notes?: string;
}

export interface WaybillBlankBatch {
  id: string;
  organizationId: string;
  series: string;
  startNumber: number;
  endNumber: number;
  status: string;
  notes?: string;
  isMaterialized?: boolean;
  issuedCount?: number;
  totalCount?: number;
}

export interface WaybillBlank {
  id: string;
  organizationId: string;
  batchId: string;
  series: string;
  number: number;
  status: BlankStatus;
  ownerEmployeeId?: string | null;
  version?: number;
  updatedAt?: string;
  updatedBy?: string;
  spoilReasonCode?: SpoilReasonCode;
  spoilReasonNote?: string;
  spoiledAt?: string;
  reservedByWaybillId?: string | null;
  reservedAt?: string | null;
  usedInWaybillId?: string | null;
}

export interface Tire {
  id: string;
  stockItemId?: string;
  quantity?: number;
  brand: string;
  model: string;
  size: string;
  season: TireSeason;
  status: TireStatus;
  condition: string;
  currentVehicleId?: string | null;
  storageLocationId?: string | null;
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  startDepth?: number | null;
  currentDepth?: number | null;
  installDate?: string | null;
  installOdometer?: number | null;
  estimatedLifespanKm?: number | null;
  disposalDate?: string | null;
  utilizationDate?: string | null;
  notes?: string | null;
  summerMileage?: number;
  winterMileage?: number;
}

export interface User {
  id: string;
  displayName: string;
  role: Role;
  extraCaps?: Capability[];
  email?: string;
}

export interface BalanceSnapshot {
  id: string;
  driverId: string;
  date: string;
  balance: number;
  createdAt: string;
}

export interface PrintPositions {
  [key: string]: { x: number; y: number; width?: number; height?: number };
}

export interface KpiData {
  totalMileage: number;
  totalFuel: number;
  totalFuelCardBalance: number;
  issues: number;
  fuelMonth: number;
  fuelQuarter: number;
  fuelYear: number;
}

export interface SeasonSettings {
    type: 'recurring' | 'manual';
    summerDay?: number;
    summerMonth?: number;
    winterDay?: number;
    winterMonth?: number;
    winterStartDate?: string;
    winterEndDate?: string;
}

export interface StorageLocation {
    id: string;
    name: string;
    type: StorageType;
    organizationId: string;
    address?: string | null;
    responsiblePerson?: string | null;
    description?: string | null;
    status: 'active' | 'archived';
}

export const EMPLOYEE_TYPE_TRANSLATIONS: Record<EmployeeType, string> = {
    driver: 'Водитель',
    dispatcher: 'Диспетчер',
    mechanic: 'Механик',
    controller: 'Контролер',
    accountant: 'Бухгалтер',
    manager: 'Менеджер',
    other: 'Другое'
};
