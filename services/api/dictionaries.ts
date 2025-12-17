
import { Organization, FuelType, SavedRoute, StorageLocation } from '../../types';
import { createRepo, ListQuery } from '../repo';
import { DB_KEYS } from '../dbKeys';
import { getAppSettings, saveAppSettings } from './settings';

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

/**
 * Нормализует строку адреса для поиска дубликатов.
 * Удаляет индексы, типы НП, улицы, цифры, знаки препинания, пробелы.
 * Цель: сравнить "суть" адреса (Ленина 5 == ул. Ленина, д.10).
 */
export const normalizeRouteString = (str: string): string => {
    if (!str) return '';
    return str
        .toLowerCase()
        // Удаляем почтовые индексы (6 цифр подряд, ограниченные границами слова)
        .replace(/\b\d{6}\b/g, '')
        // Удаляем общие сокращения и "мусорные" слова
        .replace(/\b(г\.|гор\.|город|п\.|пос\.|поселок|с\.|село|д\.|дер\.|деревня|ул\.|улица|пр\.|просп\.|проспект|пер\.|переулок|обл\.|область|р-н|район|россия|ru|rf|рф|сельское|поселение|мкр\.|микрорайон|тер\.|территория)\b/g, '')
        // Удаляем оставшиеся цифры (номера домов, но не индексы, так как они уже удалены)
        .replace(/\d+/g, '')
        // Удаляем знаки препинания
        .replace(/[.,\-–—/\\()"[\]]/g, '')
        // Удаляем все пробелы для сравнения "сути"
        .replace(/\s+/g, '')
        .trim();
};

/**
 * Нечеткое сравнение локаций: одна строка содержится в другой (после нормализации)
 */
export const areLocationsFuzzyEqual = (loc1: string, loc2: string): boolean => {
    const n1 = normalizeRouteString(loc1);
    const n2 = normalizeRouteString(loc2);
    if (!n1 || !n2) return false;
    // Проверяем вхождение одной "сути" в другую
    return n1.includes(n2) || n2.includes(n1);
};

/**
 * Сравнивает два маршрута на "схожесть".
 * Маршруты считаются дублями, если:
 * 1. Разница в расстоянии <= 0.5 км
 * 2. Пункты отправления и назначения нечетко совпадают (перекрестно).
 */
export const areRoutesFuzzyDuplicate = (r1: SavedRoute, r2: SavedRoute): boolean => {
    // 1. Проверка по расстоянию (допуск 0.5 км)
    if (Math.abs(r1.distanceKm - r2.distanceKm) > 0.5) return false;

    // 2. Проверка локаций
    const fromMatch = areLocationsFuzzyEqual(r1.from, r2.from);
    const toMatch = areLocationsFuzzyEqual(r1.to, r2.to);

    return fromMatch && toMatch;
};

export const addSavedRoutesFromWaybill = async (routes: any[]) => {
    // 1. Check settings
    const settings = await getAppSettings();
    if (settings.autoSaveRoutes === false) {
        return;
    }

    // 2. Load existing to check for duplicates and LIMIT
    const existing = (await savedRouteRepo.list({ pageSize: 10000 })).data;
    
    // SAFETY CHECK: If limit reached, disable auto-save and stop
    if (existing.length >= 50) {
        console.warn('Route dictionary limit (50) reached. Auto-save disabled.');
        await saveAppSettings({ ...settings, autoSaveRoutes: false });
        return;
    }

    // Используем жесткую нормализацию для ключа быстрой проверки
    const existingSet = new Set(existing.map(r => `${normalizeRouteString(r.from)}|${normalizeRouteString(r.to)}`));

    for(const r of routes) {
        if(r.from && r.to && r.distanceKm) {
            const normalizedFrom = normalizeRouteString(r.from);
            const normalizedTo = normalizeRouteString(r.to);
            
            // Если после нормализации строка стала пустой (например, маршрут "1 -> 2"), используем оригинал (в нижнем регистре без пробелов) как фоллбэк
            const keyFrom = normalizedFrom || r.from.toLowerCase().replace(/\s/g, '');
            const keyTo = normalizedTo || r.to.toLowerCase().replace(/\s/g, '');
            
            const key = `${keyFrom}|${keyTo}`;
            
            if (!existingSet.has(key)) {
                await savedRouteRepo.create({ from: r.from.trim(), to: r.to.trim(), distanceKm: r.distanceKm });
                existingSet.add(key); // Prevent adding duplicates within the same batch
                
                // Break if we hit the limit during this loop
                if (existing.length + existingSet.size >= 50) {
                     await saveAppSettings({ ...settings, autoSaveRoutes: false });
                     break;
                }
            }
        }
    }
};

// --- Storages ---
export type MockStorage = StorageLocation; 
export const fetchStorages = async (q: ListQuery = {}) => storageRepo.list(q);
export const addStorage = (item: Omit<StorageLocation, 'id'>) => storageRepo.create(item);
export const updateStorage = (item: StorageLocation) => storageRepo.update(item.id, item);
export const deleteStorage = (id: string) => storageRepo.remove(id);
