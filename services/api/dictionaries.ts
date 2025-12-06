
import { Organization, FuelType, SavedRoute, StorageLocation } from '../../types';
import { createRepo, ListQuery } from '../repo';
import { DB_KEYS } from '../dbKeys';

const orgRepo = createRepo<Organization>(DB_KEYS.ORGANIZATIONS);
const fuelTypeRepo = createRepo<FuelType>(DB_KEYS.FUEL_TYPES);
const savedRouteRepo = createRepo<SavedRoute>(DB_KEYS.SAVED_ROUTES);
const storageRepo = createRepo<StorageLocation>(DB_KEYS.STORAGES);

// --- Organizations ---
export const getOrganizations = async () => (await orgRepo.list({ pageSize: 1000 })).data;
export const addOrganization = (item: Omit<Organization, 'id'>) => orgRepo.create(item);
export const updateOrganization = (item: Organization) => orgRepo.update(item.id, item);
export const deleteOrganization = (id: string) => orgRepo.remove(id);

// --- Fuel Types ---
export const getFuelTypes = async () => (await fuelTypeRepo.list({ pageSize: 1000 })).data;
export const addFuelType = (item: Omit<FuelType, 'id'>) => fuelTypeRepo.create(item);
export const updateFuelType = (item: FuelType) => fuelTypeRepo.update(item.id, item);
export const deleteFuelType = (id: string) => fuelTypeRepo.remove(id);

// --- Saved Routes ---
export const getSavedRoutes = async () => (await savedRouteRepo.list({ pageSize: 1000 })).data;
export const addSavedRoute = (item: Omit<SavedRoute, 'id'>) => savedRouteRepo.create(item);
export const updateSavedRoute = (item: SavedRoute) => savedRouteRepo.update(item.id, item);
export const deleteSavedRoute = (id: string) => savedRouteRepo.remove(id);
export const deleteSavedRoutesBulk = (ids: string[]) => savedRouteRepo.removeBulk(ids);
export const addSavedRoutesFromWaybill = async (routes: any[]) => {
    for(const r of routes) {
        if(r.from && r.to && r.distanceKm) {
            await savedRouteRepo.create({ from: r.from, to: r.to, distanceKm: r.distanceKm });
        }
    }
};

// --- Storages ---
export type MockStorage = StorageLocation; 
export const fetchStorages = async (q: ListQuery = {}) => storageRepo.list(q);
export const addStorage = (item: Omit<StorageLocation, 'id'>) => storageRepo.create(item);
export const updateStorage = (item: StorageLocation) => storageRepo.update(item.id, item);
export const deleteStorage = (id: string) => storageRepo.remove(id);
