
import { DB_KEYS } from '../dbKeys';
import { loadJSON, storageClear } from '../storage';
import { createRepo } from '../repo';
import { getDb } from '../db/db';

// Keys that are stored as single objects (Blob), not Tables
const SINGLETON_KEYS = new Set([
    DB_KEYS.APP_SETTINGS,
    DB_KEYS.SEASON_SETTINGS,
    DB_KEYS.PRINT_POSITIONS,
    DB_KEYS.PRINT_EDITOR_PREFS,
    DB_KEYS.ROLE_POLICIES,
    DB_KEYS.DB_SEEDED_FLAG,
    'dashboard_filters_v1'
]);

export const dumpAllDataForExport = async () => {
    const keys = Object.values(DB_KEYS);
    const data: Record<string, any> = {};
    
    for (const k of keys) {
        if (SINGLETON_KEYS.has(k)) {
            // Read as single object
            data[k] = await loadJSON(k, null);
        } else {
            // Read as Collection from Table-like store
            // We use createRepo which knows how to read from specific stores
            try {
                const repo = createRepo(k);
                // We use list() because getAll() is internal, but list() calls getAll()
                const result = await repo.list({ pageSize: 999999 });
                data[k] = result.data;
            } catch (e) {
                // Fallback for keys that might not be migrated yet or are empty
                console.warn(`Failed to export repo for key ${k}, trying raw load`, e);
                data[k] = await loadJSON(k, null);
            }
        }
    }
    return data;
};

export const resetMockApiState = async () => {
    await storageClear();
    // Also clear all known repositories explicitly since they are in different stores now
    const keys = Object.values(DB_KEYS);
    for (const k of keys) {
        if (!SINGLETON_KEYS.has(k)) {
             try {
                 const repo = createRepo(k);
                 // We can't easily clear the store via repo, but iterating list and deleting is safe
                 // Ideally localforage.dropInstance should be used but repo doesn't expose it.
                 // For mock reset, this is acceptable.
                 const all = await repo.list({ pageSize: 99999 });
                 if (all.data.length > 0) {
                     await repo.removeBulk(all.data.map((i: any) => i.id));
                 }
             } catch (e) {
                 console.error(`Failed to clear repo ${k}`, e);
             }
        }
    }
};

/**
 * Исправляет формат дат в базе данных (с DD.MM.YYYY на YYYY-MM-DD).
 * Критично для корректной работы индексов IndexedDB после импорта старых данных.
 */
export const fixWaybillDates = async () => {
    console.log('🚑 Начинаем лечение данных...');
    const db = await getDb();
    
    // Используем транзакцию для безопасности
    const tx = db.transaction('waybills', 'readwrite');
    // Читаем все записи напрямую (мимо индексов, так как индексы могут быть сломаны из-за формата)
    const allDocs = await tx.store.getAll();
    
    let count = 0;
    
    for (const doc of allDocs) {
        let needsUpdate = false;
        let newDate = doc.date;
        
        // 1. Лечение формата DD.MM.YYYY -> YYYY-MM-DD
        if (typeof doc.date === 'string' && doc.date.includes('.')) {
             const parts = doc.date.split('.'); // ['25', '05', '2023']
             if (parts.length === 3) {
                 // Переворачиваем в ISO
                 newDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                 needsUpdate = true;
             }
        }
        
        // 2. Если даты нет вообще
        if (!newDate) {
            newDate = new Date().toISOString().split('T')[0];
            needsUpdate = true;
        }

        // 3. Лечение числовых ID (если вдруг есть)
        let newId = doc.id;
        if (typeof doc.id === 'number') {
            // Приводим к строке, иначе getById(string) не найдет
            newId = String(doc.id);
            needsUpdate = true;
        }
        
        if (needsUpdate) {
            // Если изменился ID, нужно удалить старый и добавить новый (но это сложно внутри итерации по getAll,
            // так как getAll возвращает снепшот значений, а ключи могут быть другими).
            // Для простоты здесь мы предполагаем, что ID обычно строковые (UUID), а проблема только в дате.
            // put перезапишет объект по ключу (doc.id).
            
            const fixedDoc = { ...doc, id: newId, date: newDate };
            
            // Если ID был числом, а стал строкой, это новая запись для хранилища. Старую (числовую) надо удалить.
            if (doc.id !== newId) {
                await tx.store.delete(doc.id);
                await tx.store.add(fixedDoc);
            } else {
                await tx.store.put(fixedDoc);
            }
            
            count++;
        }
    }
    
    await tx.done;
    return count;
};
