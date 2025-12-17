
import localforage from 'localforage';
import { clone } from '../utils/clone';
import { subscribe } from './bus';

/**
 * Безопасная генерация UUID.
 * Работает даже в старых браузерах и в небезопасном контексте (HTTP),
 * где crypto.randomUUID недоступен.
 */
function safeUUID(): string {
  // 1. Попытка использовать нативный crypto (если доступен и контекст безопасный)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // Игнорируем ошибку и идем к фоллбэку
    }
  }

  // 2. Fallback: Генерация UUID v4 через Math.random
  // Формат: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface ListQuery<T = any> {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  filters?: Record<string, any>;
  predicate?: (item: T) => boolean;
}

export interface ListResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  sort?: { by?: string; dir?: 'asc' | 'desc' };
  filters?: Record<string, any>;
  hasMore: boolean;
}

// Глобальный кэш: Key -> Array of entities
const memoryCache = new Map<string, any[]>();
// Promise-кэш, чтобы не запускать загрузку дважды
const loadingPromises = new Map<string, Promise<any[]>>();

export const invalidateRepoCache = (key: string) => {
  if (memoryCache.has(key)) {
    console.debug(`[Repo] Explicit cache invalidation for ${key}`);
    memoryCache.delete(key);
    loadingPromises.delete(key);
  }
};

subscribe((msg) => {
  if (msg.topic && memoryCache.has(msg.topic)) {
    console.debug(`[Repo] Cache invalidated for ${msg.topic} via bus`);
    memoryCache.delete(msg.topic);
    loadingPromises.delete(msg.topic);
  }
});

export function createRepo<T extends { id: string }>(entityKey: string, version = 1) {
  // Создаем изолированное хранилище ("таблицу") для этой сущности
  const store = localforage.createInstance({
    name: 'AppDB',        // Имя базы данных IndexedDB
    storeName: entityKey, // Имя таблицы (ObjectStore)
    // ВАЖНО: Мы НЕ указываем version здесь.
    // Если указать version: 1, а база уже обновлена через idb до v56, 
    // localforage может вызвать ошибку или заблокировать базу.
    // Без версии он просто подключится к текущей.
  });

  /**
   * АВТО-МИГРАЦИЯ:
   * Проверяем, есть ли данные в старом формате (Blob JSON) в основном хранилище.
   * Если есть - переносим в новую структуру и удаляем старое.
   */
  async function checkMigration() {
    // Используем дефолтный инстанс для проверки старых данных
    const oldData = await localforage.getItem<T[]>(entityKey);
    if (oldData && Array.isArray(oldData) && oldData.length > 0) {
      console.warn(`[Repo] Migrating ${entityKey} from JSON-Blob to Granular Storage...`);
      // Пишем параллельно для скорости
      await Promise.all(oldData.map(item => store.setItem(item.id, item)));
      // Удаляем старый blob
      await localforage.removeItem(entityKey);
      console.log(`[Repo] Migration for ${entityKey} finished. Items moved: ${oldData.length}`);
    }
  }

  // Запуск миграции (не блокируем создание, но гарантируем выполнение перед чтением)
  const migrationPromise = checkMigration().catch(err => console.error('Migration failed', err));

  async function getAll(): Promise<T[]> {
    if (memoryCache.has(entityKey)) {
      return memoryCache.get(entityKey) as T[];
    }

    if (loadingPromises.has(entityKey)) {
      return loadingPromises.get(entityKey) as Promise<T[]>;
    }

    const loadTask = (async () => {
      await migrationPromise;

      const items: T[] = [];
      await store.iterate((value: T) => {
        items.push(value);
      });

      memoryCache.set(entityKey, items);
      loadingPromises.delete(entityKey);
      return items;
    })();

    loadingPromises.set(entityKey, loadTask);
    return loadTask;
  }

  async function list(query: ListQuery<T> = {}): Promise<ListResult<T>> {
    const all = await getAll();
    let data = all;

    if (query.predicate || query.filters || query.sortBy) {
      data = [...all];
    }

    if (query.predicate) {
      data = data.filter(query.predicate);
    }

    if (query.filters) {
      for (const [k, v] of Object.entries(query.filters)) {
        if (v == null || v === '') continue;
        data = data.filter((row: any) =>
          String(row[k] ?? '').toLowerCase().includes(String(v).toLowerCase())
        );
      }
    }

    if (query.sortBy) {
      const dir = query.sortDir === 'desc' ? -1 : 1;
      const by = query.sortBy as keyof T;
      data.sort((a: T, b: T) => {
        const valA = a[by];
        const valB = b[by];
        if (valA == null) return 1;
        if (valB == null) return -1;
        return valA > valB ? dir : valA < valB ? -dir : 0;
      });
    }

    const total = data.length;
    const pageSize = query.pageSize ?? 20;
    const page = query.page ?? 1;
    const start = (page - 1) * pageSize;
    const slice = data.slice(start, start + pageSize);

    return {
      data: slice,
      page,
      pageSize,
      total,
      sort: { by: query.sortBy, dir: query.sortDir },
      filters: query.filters,
      hasMore: start + pageSize < total
    };
  }

  async function getById(id: string): Promise<T | null> {
    // Оптимизация: Сначала ищем в кэше
    if (memoryCache.has(entityKey)) {
      const cache = memoryCache.get(entityKey) as T[];
      return cache.find(x => x.id === id) ?? null;
    }
    // Fallback: читаем с диска одну запись
    return await store.getItem<T>(id);
  }

  async function create(item: Omit<T, 'id'> & Partial<Pick<T, 'id'>>): Promise<T> {
    const id = item.id ?? safeUUID();
    const obj = { ...clone(item), id } as T;

    // 1. Write to DB (Atomic)
    await store.setItem(id, obj);

    // 2. Update Cache
    if (memoryCache.has(entityKey)) {
      const currentCache = memoryCache.get(entityKey) as T[];
      memoryCache.set(entityKey, [...currentCache, obj]);
    }

    return obj;
  }

  async function update(id: string, patch: Partial<T>): Promise<T> {
    let existing = await getById(id);
    if (!existing) {
      existing = await store.getItem<T>(id);
      if (!existing) throw new Error(`Not found: ${entityKey}#${id}`);
    }

    const merged = { ...existing, ...clone(patch) } as T;

    await store.setItem(id, merged);

    if (memoryCache.has(entityKey)) {
      const currentCache = memoryCache.get(entityKey) as T[];
      const idx = currentCache.findIndex(x => x.id === id);
      if (idx !== -1) {
        const newCache = [...currentCache];
        newCache[idx] = merged;
        memoryCache.set(entityKey, newCache);
      } else {
        memoryCache.set(entityKey, [...currentCache, merged]);
      }
    }

    return merged;
  }

  // Optimized bulk update
  async function updateBulk(items: T[]): Promise<void> {
    if (items.length === 0) return;

    // 1. Parallel write to IndexedDB (Much faster than sequential await)
    await Promise.all(items.map(item => store.setItem(item.id, item)));

    // 2. Update Cache efficiently
    if (memoryCache.has(entityKey)) {
      const currentCache = memoryCache.get(entityKey) as T[];
      const updatesMap = new Map(items.map(i => [i.id, i]));

      // Rebuild cache array replacing updated items
      const newCache = currentCache.map(item =>
        updatesMap.has(item.id) ? updatesMap.get(item.id)! : item
      );

      // Note: If updateBulk contains new items not in cache, they won't be added here.
      // This method assumes 'update', not 'upsert' for cache consistency in this context.
      memoryCache.set(entityKey, newCache);
    }
  }

  async function remove(id: string): Promise<void> {
    await store.removeItem(id);

    if (memoryCache.has(entityKey)) {
      const currentCache = memoryCache.get(entityKey) as T[];
      const newCache = currentCache.filter(x => x.id !== id);
      memoryCache.set(entityKey, newCache);
    }
  }

  async function removeBulk(ids: string[]): Promise<void> {
    await Promise.all(ids.map(id => store.removeItem(id)));

    if (memoryCache.has(entityKey)) {
      const set = new Set(ids);
      const currentCache = memoryCache.get(entityKey) as T[];
      const newCache = currentCache.filter(x => !set.has(x.id));
      memoryCache.set(entityKey, newCache);
    }
  }

  return { list, getById, create, update, updateBulk, remove, removeBulk, key: entityKey };
}
