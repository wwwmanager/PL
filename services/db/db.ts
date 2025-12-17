
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Waybill } from '../../types';

// Описываем структуру БД для TypeScript
export interface AppDB extends DBSchema {
  waybills: {
    key: string;
    value: Waybill;
    indexes: { 
      'by-date': string; 
      'by-vehicle': string;
      'by-status': string;
    };
  };
}

const DB_NAME = 'AppDB';
// Минимально требуемая версия кодом. 
// Если в браузере версия меньше — сработает upgrade.
// Если в браузере версия больше — просто подключимся к ней без ошибки.
const MIN_CODE_VERSION = 56;

let dbPromise: Promise<IDBPDatabase<AppDB>> | null = null;

// Функция для получения "реальной" версии базы в браузере
async function getActualDbVersion(name: string, defaultVer: number): Promise<number> {
    try {
        // @ts-ignore: window.indexedDB.databases is standard but might be missing in older TS libs
        if (window.indexedDB && window.indexedDB.databases) {
            // @ts-ignore
            const dbs = await window.indexedDB.databases();
            const existing = dbs.find((db: any) => db.name === name);
            if (existing && existing.version) {
                // Если в браузере версия ВЫШЕ -> используем версию браузера (избегаем ошибки downgrade)
                // Если в браузере версия НИЖЕ -> используем версию кода (сработает upgrade)
                return Math.max(existing.version, defaultVer);
            }
        }
    } catch (e) {
        console.warn('[DB] Не удалось определить версию БД динамически, используем дефолтную', e);
    }
    return defaultVer;
}

export const getDb = () => {
  if (!dbPromise) {
    dbPromise = (async () => {
        // 1. Динамически вычисляем версию
        const targetVersion = await getActualDbVersion(DB_NAME, MIN_CODE_VERSION);
        
        console.log(`[DB] Connecting to ${DB_NAME}. Code requires v${MIN_CODE_VERSION}, Browser has v${targetVersion}. Opening v${targetVersion}.`);

        return openDB<AppDB>(DB_NAME, targetVersion, {
          upgrade(db, oldVersion, newVersion, transaction) {
            console.log(`[DB] Migrating from v${oldVersion} to v${newVersion}`);

            // 1. Создаем или получаем store
            let store;
            if (!db.objectStoreNames.contains('waybills')) {
              store = db.createObjectStore('waybills', { keyPath: 'id' });
            } else {
              store = transaction.objectStore('waybills');
            }

            // 2. Безопасно добавляем индексы, если их нет
            if (!store.indexNames.contains('by-date')) {
                store.createIndex('by-date', 'date');
            }
            if (!store.indexNames.contains('by-vehicle')) {
                store.createIndex('by-vehicle', 'vehicleId');
            }
            if (!store.indexNames.contains('by-status')) {
                store.createIndex('by-status', 'status');
            }
          },
          blocked(currentVersion, blockedVersion, event) {
            console.warn(`[DB] Database blocked: current=${currentVersion}, blocked=${blockedVersion}`);
          },
          blocking(currentVersion, blockedVersion, event) {
            console.warn(`[DB] Database blocking update: current=${currentVersion}, blocked=${blockedVersion}. Closing connection.`);
            const db = (event.target as any).result;
            if (db) {
                db.close();
            }
            // Force reload might be too aggressive, better to let the app handle it or just reconnect next time
            // window.location.reload(); 
          },
          terminated() {
            console.error('[DB] Database terminated unexpectedly');
            dbPromise = null;
          },
        });
    })();
  }
  return dbPromise;
};
