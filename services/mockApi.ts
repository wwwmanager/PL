
export * from './api/core';
export * from './api/settings';
export * from './api/dictionaries';
export * from './api/vehicles';
export * from './api/employees';
export * from './api/users';
export * from './api/inventory';
export * from './api/blanks';
export * from './api/waybills';
// Explicitly export recalculateVehicleStats and validateBatchCorrection to be available for UI components
export { recalculateVehicleStats, validateBatchCorrection } from './api/waybills';
export * from './api/dashboard';
export * from './api/system';
export * from './api/tires';
export { invalidateRepoCache } from './repo';