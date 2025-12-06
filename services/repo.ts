
import { loadJSON, saveJSON } from './storage';
import { clone } from '../utils/clone';
import { subscribe } from './bus';

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
  sort?: { by?: string; dir?: 'asc'|'desc' }; 
  filters?: Record<string,any>;
  hasMore: boolean;
}

// Глобальный кэш: Key -> Array of entities
const memoryCache = new Map<string, any[]>();

export const invalidateRepoCache = (key: string) => {
    if (memoryCache.has(key)) {
        console.debug(`[Repo] Explicit cache invalidation for ${key}`);
        memoryCache.delete(key);
    }
};

// Подписка на шину событий для инвалидации кэша при изменениях в других вкладках
subscribe((msg) => {
    if (msg.topic && memoryCache.has(msg.topic)) {
        console.debug(`[Repo] Cache invalidated for ${msg.topic} via bus`);
        memoryCache.delete(msg.topic);
    }
});

export function createRepo<T extends { id: string }>(entityKey: string, version = 1) {
  const key = entityKey;

  async function getAll(): Promise<T[]> {
      if (memoryCache.has(key)) {
          // PERFORMANCE FIX: Return reference directly.
          // Removing clone() here speeds up reads massively for large datasets.
          // Write operations must ensure they create new array references.
          return memoryCache.get(key) as T[];
      }

      const loaded = await loadJSON<T[]>(key, []);
      const all = Array.isArray(loaded) ? loaded : [];
      memoryCache.set(key, all);
      return all;
  }

  async function list(query: ListQuery<T> = {}): Promise<ListResult<T>> {
    const all = await getAll();
    
    // Shallow copy for filtering/sorting operations to avoid mutating the cached array
    let data = [...all];

    // 1. Custom Predicate Filtering (Advanced logic)
    if (query.predicate) {
        data = data.filter(query.predicate);
    }

    // 2. Simple Key-Value Filtering (Legacy support)
    if (query.filters) {
      for (const [k, v] of Object.entries(query.filters)) {
        if (v == null || v === '') continue;
        data = data.filter((row: any) =>
          String(row[k] ?? '').toLowerCase().includes(String(v).toLowerCase())
        );
      }
    }

    // 3. Sorting
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

    // 4. Pagination
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
    const all = await getAll();
    return all.find(x => x.id === id) ?? null;
  }

  async function create(item: Omit<T,'id'> & Partial<Pick<T,'id'>>): Promise<T> {
    const all = await getAll();
    
    const id = item.id ?? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const obj = { ...clone(item), id } as T;
    
    // Create new array to update cache immutably
    const newAll = [...all, obj];
    
    memoryCache.set(key, newAll);
    await saveJSON(key, newAll);
    
    return obj;
  }

  async function update(id: string, patch: Partial<T>): Promise<T> {
    const all = await getAll();
    
    const idx = all.findIndex(x => x.id === id);
    if (idx === -1) throw new Error(`Not found: ${entityKey}#${id}`);
    
    const merged = { ...all[idx], ...clone(patch) } as T;
    
    // Create new array to update cache immutably
    const newAll = [...all];
    newAll[idx] = merged;
    
    memoryCache.set(key, newAll);
    await saveJSON(key, newAll);
    
    return merged;
  }

  async function remove(id: string): Promise<void> {
    const all = await getAll();
    // filter creates a new array, so cache is updated immutably
    const filtered = all.filter(x => x.id !== id);
    
    memoryCache.set(key, filtered);
    await saveJSON(key, filtered);
  }

  async function removeBulk(ids: string[]): Promise<void> {
    const all = await getAll();
    const targets = new Set(ids);
    // filter creates a new array
    const filtered = all.filter(x => !targets.has(x.id));
    
    memoryCache.set(key, filtered);
    await saveJSON(key, filtered);
  }

  return { list, getById, create, update, remove, removeBulk, key };
}
