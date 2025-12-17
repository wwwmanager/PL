
import { getDb } from '../db/db';
import { Waybill } from '../../types';
import localforage from 'localforage';
import { DB_KEYS } from '../dbKeys';

// Флаг, чтобы не запускать миграцию при каждом запросе, если она уже прошла в этой сессии
let migrationChecked = false;

async function ensureMigration() {
    if (migrationChecked) return;
    
    const db = await getDb();
    const count = await db.count('waybills');

    // Если в новой таблице пусто, проверяем старое хранилище
    if (count === 0) {
        console.log('[WaybillRepo] Store is empty, checking for legacy data...');
        try {
            // Читаем старый blob
            const legacyData = await localforage.getItem<Waybill[]>(DB_KEYS.WAYBILLS);
            
            if (legacyData && Array.isArray(legacyData) && legacyData.length > 0) {
                console.log(`[WaybillRepo] Found ${legacyData.length} legacy items. Migrating...`);
                
                const tx = db.transaction('waybills', 'readwrite');
                const store = tx.objectStore('waybills');
                
                // Используем Promise.all для параллельной записи, но в рамках одной транзакции
                await Promise.all(legacyData.map(item => store.put(item)));
                await tx.done;
                
                console.log('[WaybillRepo] Migration successful. Clearing legacy blob.');
                // Удаляем старый blob, чтобы не дублировать данные в будущем
                await localforage.removeItem(DB_KEYS.WAYBILLS);
            } else {
                console.log('[WaybillRepo] No legacy data found.');
            }
        } catch (e) {
            console.error('[WaybillRepo] Migration failed', e);
        }
    }
    migrationChecked = true;
}

export const waybillRepository = {
  // --- Basic CRUD via idb direct access ---
  
  async getById(id: string): Promise<Waybill | undefined> {
    await ensureMigration();
    const db = await getDb();
    return db.get('waybills', id);
  },

  async save(waybill: Waybill): Promise<void> {
    const db = await getDb();
    // Используем put, чтобы перезаписать или создать.
    // Это автоматически обновит индексы.
    await db.put('waybills', waybill);
  },

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('waybills', id);
  },

  // --- 🚀 НОВАЯ ЛОГИКА: Списки через In-Memory Sort ---
  // Для поддержки сортировки по любому полю (например validFrom) с пагинацией,
  // мы загружаем отфильтрованные данные в память, сортируем и режем на страницы.
  // Для объемов до 10-20 тыс. записей это работает достаточно быстро (<50ms).
  
  async list({ 
    page = 1, 
    pageSize = 20, 
    filters = {},
    sortBy = 'date',
    sortDir = 'desc'
  }: { 
    page?: number; 
    pageSize?: number; 
    filters?: { vehicleId?: string; dateFrom?: string; dateTo?: string; status?: string; driverId?: string };
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
  }): Promise<Waybill[]> {
    await ensureMigration();
    
    const db = await getDb();
    const tx = db.transaction('waybills', 'readonly');
    
    // 1. Выбираем стратегию выборки кандидатов (используем индексы для фильтрации)
    let source: any = tx.store;
    let range: IDBKeyRange | null = null;
    let indexUsed = false;

    // Стратегия 1: Фильтр по дате (самый селективный)
    if (filters.dateFrom || filters.dateTo) {
        source = tx.store.index('by-date');
        indexUsed = true;
        if (filters.dateFrom && filters.dateTo) {
            range = IDBKeyRange.bound(filters.dateFrom, filters.dateTo);
        } else if (filters.dateFrom) {
            range = IDBKeyRange.lowerBound(filters.dateFrom);
        } else {
            range = IDBKeyRange.upperBound(filters.dateTo);
        }
    } 
    // Стратегия 2: Фильтр по машине
    else if (filters.vehicleId) {
        source = tx.store.index('by-vehicle');
        indexUsed = true;
        range = IDBKeyRange.only(filters.vehicleId);
    }
    // Стратегия 3: Фильтр по статусу
    else if (filters.status) {
        source = tx.store.index('by-status');
        indexUsed = true;
        range = IDBKeyRange.only(filters.status);
    }

    // 2. Получаем всех кандидатов
    let allMatches: Waybill[] = [];
    if (indexUsed) {
        allMatches = await source.getAll(range);
    } else {
        allMatches = await tx.store.getAll();
    }

    // 3. Остаточная фильтрация в JS
    const filtered = allMatches.filter(doc => {
        // Если шли по индексу, некоторые проверки избыточны, но безопасны
        if (filters.vehicleId && doc.vehicleId !== filters.vehicleId) return false;
        if (filters.dateFrom && doc.date < filters.dateFrom) return false;
        if (filters.dateTo && doc.date > filters.dateTo) return false;
        if (filters.status && doc.status !== filters.status) return false;
        if (filters.driverId && doc.driverId !== filters.driverId) return false;
        return true;
    });

    // 4. Сортировка в памяти
    filtered.sort((a, b) => {
        const valA = (a as any)[sortBy];
        const valB = (b as any)[sortBy];

        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1; // nulls last
        if (valB === null || valB === undefined) return -1;

        if (valA < valB) return sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });

    // 5. Пагинация
    const startIndex = (page - 1) * pageSize;
    return filtered.slice(startIndex, startIndex + pageSize);
  },

  async count(filters: { vehicleId?: string; dateFrom?: string; dateTo?: string; status?: string; driverId?: string } = {}): Promise<number> {
    await ensureMigration();
    const db = await getDb();
    const tx = db.transaction('waybills', 'readonly');
    
    // Упрощенный count: если фильтры сложные, проще получить все и посчитать длину массива.
    // Для IDB getAllKeys быстрее, чем getAll.
    
    // Повторяем логику выбора индекса
    let source: any = tx.store;
    let range: IDBKeyRange | null = null;
    let indexUsed = false;

    if (filters.dateFrom || filters.dateTo) {
        source = tx.store.index('by-date');
        indexUsed = true;
        if (filters.dateFrom && filters.dateTo) range = IDBKeyRange.bound(filters.dateFrom, filters.dateTo);
        else if (filters.dateFrom) range = IDBKeyRange.lowerBound(filters.dateFrom);
        else range = IDBKeyRange.upperBound(filters.dateTo);
    } else if (filters.vehicleId) {
        source = tx.store.index('by-vehicle');
        indexUsed = true;
        range = IDBKeyRange.only(filters.vehicleId);
    } else if (filters.status) {
        source = tx.store.index('by-status');
        indexUsed = true;
        range = IDBKeyRange.only(filters.status);
    }

    // Если фильтры совпадают с индексом 1-в-1, используем нативный count
    const hasResidualFilters = 
        (indexUsed && filters.vehicleId && !source.name.includes('vehicle')) ||
        (indexUsed && (filters.dateFrom || filters.dateTo) && !source.name.includes('date')) ||
        (indexUsed && filters.status && !source.name.includes('status')) ||
        filters.driverId;

    if (!hasResidualFilters && indexUsed) {
        return await source.count(range);
    }
    
    if (!hasResidualFilters && !indexUsed && Object.keys(filters).length === 0) {
        return await source.count();
    }

    // Иначе читаем все и фильтруем (getAll чуть медленнее, но надежнее)
    // Используем cursor для memory efficiency при подсчете
    let count = 0;
    let cursor = await source.openCursor(range);
    while (cursor) {
        const doc = cursor.value as Waybill;
        let match = true;
        if (filters.vehicleId && doc.vehicleId !== filters.vehicleId) match = false;
        if (filters.dateFrom && doc.date < filters.dateFrom) match = false;
        if (filters.dateTo && doc.date > filters.dateTo) match = false;
        if (filters.status && doc.status !== filters.status) match = false;
        if (filters.driverId && doc.driverId !== filters.driverId) match = false;
        
        if (match) count++;
        cursor = await cursor.continue();
    }
    return count;
  }
};
