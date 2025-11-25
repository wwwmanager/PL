import { z } from 'zod';
import { OrganizationStatus, VehicleStatus, WaybillStatus } from '../types';
import { DB_KEYS } from './dbKeys';

// --- NEW BLANK SCHEMAS ---

export const RangeSchema = z.object({
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
}).refine(v => v.from <= v.to, 'Диапазон: from ≤ to');

export const IssueBlanksSchema = z.object({
  batchId: z.string(),
  ownerEmployeeId: z.string(),
  ranges: z.array(RangeSchema).min(1),
}).superRefine((val, ctx) => {
  const ranges = [...val.ranges].sort((a,b) => a.from - b.from);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i-1].to >= ranges[i].from) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Диапазоны пересекаются/повторяются' });
      break;
    }
  }
});

export const SpoilBlankSchema = z.object({
  blankId: z.string(),
  reasonCode: z.enum(['damaged','misprint','lost','other']),
  note: z.string().max(256).optional().default(''),
});

export const BlankFiltersSchema = z.object({
  orgId: z.string().optional(),
  series: z.string().optional(),
  number: z.union([z.number().int(), z.object({ from: z.number().int().optional(), to: z.number().int().optional() })]).optional(),
  status: z.array(z.enum(['available','issued','returned','reserved','used','spoiled'])).optional(),
  ownerEmployeeId: z.string().nullable().optional(),
});
export type BlankFilters = z.infer<typeof BlankFiltersSchema>;


const BulkSpoilByIdsSchema = z.object({
  kind: z.literal('ids'),
  blankIds: z.array(z.string()).min(1),
  reasonCode: z.enum(['damaged','misprint','lost','other']),
  note: z.string().max(256).optional().default(''),
  dryRun: z.boolean().optional().default(false),
});

const BulkSpoilByFilterSchema = z.object({
  kind: z.literal('filter'),
  filter: BlankFiltersSchema,
  limit: z.number().int().positive().max(2000).optional(),
  excludedIds: z.array(z.string()).optional(),
  reasonCode: z.enum(['damaged','misprint','lost','other']),
  note: z.string().max(256).optional().default(''),
  dryRun: z.boolean().optional().default(false),
});

export const BulkSpoilInputSchema = z.union([BulkSpoilByIdsSchema, BulkSpoilByFilterSchema]);
export type BulkSpoilInput = z.infer<typeof BulkSpoilInputSchema>;


// --- EXISTING SCHEMAS ---

// Enums
const organizationStatusSchema = z.nativeEnum(OrganizationStatus);
const vehicleStatusSchema = z.nativeEnum(VehicleStatus);
const waybillStatusSchema = z.nativeEnum(WaybillStatus);
// FIX: Expanded to match EmployeeType
const employeeTypeSchema = z.enum(['driver', 'dispatcher', 'controller', 'accountant', 'mechanic', 'reviewer']);

// Schemas
const fuelTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  density: z.number(),
  // FIX: Added optional fields from type
  unit: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const savedRouteSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  distanceKm: z.number(),
});

const organizationSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  shortName: z.string(),
  inn: z.string().optional().nullable(),
  kpp: z.string().optional().nullable(),
  ogrn: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  registrationDate: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  bankAccount: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankBik: z.string().optional().nullable(),
  correspondentAccount: z.string().optional().nullable(),
  paymentPurpose: z.string().optional().nullable(),
  accountCurrency: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: organizationStatusSchema,
  group: z.string().optional().nullable(),
  medicalLicenseNumber: z.string().optional().nullable(),
  medicalLicenseIssueDate: z.string().optional().nullable(),
  // FIX: Added storageIds from type
  storageIds: z.array(z.string()).optional().nullable(),
});

const maintenanceRecordSchema = z.object({
  id: z.string(),
  date: z.string(),
  workType: z.string(),
  mileage: z.number(),
  description: z.string().optional().nullable(),
  performer: z.string().optional().nullable(),
  cost: z.number().optional().nullable(),
});

const fuelConsumptionRatesSchema = z.object({
  summerRate: z.number(),
  winterRate: z.number(),
  cityIncreasePercent: z.number().optional().nullable(),
  warmingIncreasePercent: z.number().optional().nullable(),
});

const waybillBlankBatchSchema = z.object({
    id: z.string(),
    series: z.string(),
    startNumber: z.string(),
    endNumber: z.string(),
});

const vehicleSchema = z.object({
  id: z.string(),
  plateNumber: z.string(),
  brand: z.string(),
  vin: z.string(),
  mileage: z.number(),
  fuelTypeId: z.string(),
  fuelConsumptionRates: fuelConsumptionRatesSchema,
  assignedDriverId: z.string().nullable(),
  organizationId: z.string(),
  currentFuel: z.number().optional().nullable(),
  year: z.number().optional().nullable(),
  vehicleType: z.enum(['Легковой', 'Тягач', 'Прицеп', 'Автобус', 'Спецтехника']).optional().nullable(),
  status: vehicleStatusSchema,
  notes: z.string().optional().nullable(),
  ptsType: z.enum(['PTS', 'EPTS']).optional().nullable(),
  ptsSeries: z.string().optional().nullable(),
  ptsNumber: z.string().optional().nullable(),
  eptsNumber: z.string().optional().nullable(),
  diagnosticCardNumber: z.string().optional().nullable(),
  diagnosticCardIssueDate: z.string().optional().nullable(),
  diagnosticCardExpiryDate: z.string().optional().nullable(),
  maintenanceHistory: z.array(maintenanceRecordSchema).optional().nullable(),
  useCityModifier: z.boolean().optional().nullable(),
  useWarmingModifier: z.boolean().optional().nullable(),
  fuelTankCapacity: z.number().optional().nullable(),
  disableFuelCapacityCheck: z.boolean().optional().nullable(),
  osagoSeries: z.string().optional().nullable(),
  osagoNumber: z.string().optional().nullable(),
  osagoStartDate: z.string().optional().nullable(),
  osagoEndDate: z.string().optional().nullable(),
  storageLocationId: z.string().optional().nullable(),
});

const employeeSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  shortName: z.string(),
  employeeType: employeeTypeSchema,
  position: z.string().optional().nullable(),
  organizationId: z.string().nullable(),
  status: z.enum(['Active', 'Inactive']),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  licenseCategory: z.string().optional().nullable(),
  documentNumber: z.string().optional().nullable(),
  documentExpiry: z.string().optional().nullable(),
  snils: z.string().optional().nullable(),
  personnelNumber: z.string().optional().nullable(),
  driverCardType: z.enum(['SKZI', 'ESTR']).optional().nullable(),
  driverCardNumber: z.string().optional().nullable(),
  driverCardStartDate: z.string().optional().nullable(),
  driverCardExpiryDate: z.string().optional().nullable(),
  medicalCertificateSeries: z.string().optional().nullable(),
  medicalCertificateNumber: z.string().optional().nullable(),
  medicalCertificateIssueDate: z.string().optional().nullable(),
  medicalCertificateExpiryDate: z.string().optional().nullable(),
  dispatcherId: z.string().optional().nullable(),
  controllerId: z.string().optional().nullable(),
  medicalInstitutionId: z.string().optional().nullable(),
  // FIX: Added missing fields from type
  fuelCardNumber: z.string().optional().nullable(),
  fuelCardBalance: z.number().optional().nullable(),
  email: z.string().email().optional().nullable(),
  blankBatches: z.array(waybillBlankBatchSchema).optional().nullable(),
  spoiledBlanks: z.array(z.object({series: z.string(), number: z.string()})).optional().nullable(),
});

export const userSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string().email().optional().nullable(),
  // FIX: Expanded role enum to match all possible Role types from types.ts.
  role: z.enum(['admin', 'user', 'auditor', 'driver', 'mechanic', 'reviewer', 'accountant', 'viewer']),
  extraCaps: z.array(z.string()).optional().nullable(),
});

const attachmentSchema = z.object({
  name: z.string(),
  size: z.number(),
  type: z.string(),
  content: z.string(),
  userId: z.string(),
});

const routeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  distanceKm: z.number(),
  isCityDriving: z.boolean().optional().nullable(),
  isWarming: z.boolean().optional().nullable(),
  date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const waybillSchema = z.object({
  id: z.string(),
  number: z.string(),
  date: z.string(),
  vehicleId: z.string(),
  driverId: z.string(),
  status: waybillStatusSchema,
  odometerStart: z.number(),
  odometerEnd: z.number().optional().nullable(),
  fuelPlanned: z.number().optional().nullable(),
  fuelAtStart: z.number().optional().nullable(),
  fuelFilled: z.number().optional().nullable(),
  fuelAtEnd: z.number().optional().nullable(),
  routes: z.array(routeSchema),
  organizationId: z.string(),
  dispatcherId: z.string(),
  controllerId: z.string().optional().nullable(),
  validFrom: z.string(),
  validTo: z.string(),
  attachments: z.array(attachmentSchema).optional().nullable(),
  reviewerComment: z.string().optional().nullable(),
  deviationReason: z.string().optional().nullable(),
  // FIX: Added linkedStockTransactionIds and notes from type
  linkedStockTransactionIds: z.array(z.string()).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const seasonSettingsSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('recurring'),
        summerMonth: z.number(),
        summerDay: z.number(),
        winterMonth: z.number(),
        winterDay: z.number(),
    }),
    z.object({
        type: z.literal('manual'),
        winterStartDate: z.string(),
        winterEndDate: z.string(),
    }),
]);

const printPositionsSchema = z.record(z.string(), z.object({
    x: z.number(),
    y: z.number(),
}));

// --- NEW/UPDATED SCHEMAS FOR WAREHOUSE ---

const garageStockItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  itemType: z.enum(['Товар', 'Услуга']),
  group: z.enum(['ГСМ', 'Запчасти', 'Шины', 'Прочее']),
  unit: z.string(),
  balance: z.number(),
  reserved: z.number().optional().nullable(),
  incoming: z.number().optional().nullable(),
  reorderPoint: z.number().optional().nullable(),
  minBalance: z.number().optional().nullable(),
  maxBalance: z.number().optional().nullable(),
  averagePrice: z.number().optional().nullable(),
  lastPurchasePrice: z.number().optional().nullable(),
  lastInventoryDate: z.string().optional().nullable(),
  lastTransactionDate: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  storageType: z.enum(['centralWarehouse', 'remoteWarehouse', 'vehicleTank', 'contractorWarehouse']),
  storageLocation: z.string().optional().nullable(),
  storageRack: z.string().optional().nullable(),
  balanceAccount: z.string().optional().nullable(),
  budgetCode: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  fuelTypeId: z.string().optional().nullable(),
  density: z.number().optional().nullable(),
  isActive: z.boolean(),
  organizationId: z.string().optional().nullable(),
  responsibleEmployeeId: z.string().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  expirationDate: z.string().optional().nullable(),
  // FIX: The error "Expected 2-3 arguments, but got 1" likely originates from this z.record call.
  // Explicitly providing the key type (z.string) resolves potential ambiguity.
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

const stockTransactionItemSchema = z.object({
  stockItemId: z.string(),
  quantity: z.number(),
  unit: z.string().optional().nullable(),
  unitPrice: z.number().optional().nullable(),
  totalAmount: z.number().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  vehicleId: z.string().optional().nullable(),
});

const stockTransactionSchema = z.object({
  id: z.string(),
  docNumber: z.string(),
  date: z.string(),
  type: z.enum(['income', 'expense']),
  items: z.array(stockTransactionItemSchema),
  expenseReason: z.enum(['waybill', 'maintenance', 'writeOff', 'fuelCardTopUp', 'inventoryAdjustment', 'other']).optional().nullable(),
  vehicleId: z.string().optional().nullable(),
  driverId: z.string().optional().nullable(),
  issuedForEmployeeId: z.string().optional().nullable(),
  isFuelCardTopUp: z.boolean().optional().nullable(),
  supplier: z.string().optional().nullable(),
  supplierOrganizationId: z.string().optional().nullable(),
  recipientOrganizationId: z.string().optional().nullable(),
  sourceStorageId: z.string().optional().nullable(),
  targetStorageId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  waybillId: z.string().optional().nullable(),
  createdByUserId: z.string().optional().nullable(),
  approvedByUserId: z.string().optional().nullable(),
  attachments: z.array(attachmentSchema).optional().nullable(),
  createdAt: z.string().optional().nullable(),
  updatedAt: z.string().optional().nullable(),
  // FIX: The error "Expected 2-3 arguments, but got 1" likely originates from this z.record call.
  // Explicitly providing the key type (z.string) resolves potential ambiguity.
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  organizationId: z.string(),
});

const appSettingsSchema = z.object({
    isParserEnabled: z.boolean(),
    enableWarehouseAccounting: z.boolean().optional().nullable(),
    defaultStorageType: z.enum(['centralWarehouse', 'remoteWarehouse', 'vehicleTank', 'contractorWarehouse']).optional().nullable(),
});

const rolePoliciesSchema = z.record(z.string(), z.array(z.string()));

// Main Database Schema for validation on import
export const databaseSchema = z.object({
  [DB_KEYS.WAYBILLS]: z.array(waybillSchema).optional().nullable(),
  [DB_KEYS.VEHICLES]: z.array(vehicleSchema).optional().nullable(),
  [DB_KEYS.EMPLOYEES]: z.array(employeeSchema).optional().nullable(),
  [DB_KEYS.FUEL_TYPES]: z.array(fuelTypeSchema).optional().nullable(),
  [DB_KEYS.ORGANIZATIONS]: z.array(organizationSchema).optional().nullable(),
  [DB_KEYS.SAVED_ROUTES]: z.array(savedRouteSchema).optional().nullable(),
  [DB_KEYS.USERS]: z.array(userSchema).optional().nullable(),
  [DB_KEYS.DB_SEEDED_FLAG]: z.string().or(z.boolean()).optional().nullable(),
  [DB_KEYS.SEASON_SETTINGS]: seasonSettingsSchema.optional().nullable(),
  [DB_KEYS.PRINT_POSITIONS]: printPositionsSchema.optional().nullable(),
  [DB_KEYS.ROLE_POLICIES]: rolePoliciesSchema.optional().nullable(),
  // FIX: Added new schemas for warehouse and settings
  [DB_KEYS.GARAGE_STOCK_ITEMS]: z.array(garageStockItemSchema).optional().nullable(),
  [DB_KEYS.STOCK_TRANSACTIONS]: z.array(stockTransactionSchema).optional().nullable(),
  [DB_KEYS.APP_SETTINGS]: appSettingsSchema.optional().nullable(),
}).passthrough(); // allows other properties that are not specified in the schema.