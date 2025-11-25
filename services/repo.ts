// services/repo.ts
import { loadJSON, saveJSON } from './storage';
import { clone } from '../utils/clone';

export interface ListQuery {
  page?: number; pageSize?: number;
  sortBy?: string; sortDir?: 'asc' | 'desc';
  filters?: Record<string, any>;
}
export interface ListResult<T> {
  data: T[]; page: number; pageSize: number; total: number;
  sort?: { by?: string; dir?: 'asc'|'desc' }; filters?: Record<string,any>;
}

export function createRepo<T extends { id: string }>(entityKey: string, version = 1) {
  const key = `repo:${entityKey}:v${version}`;

  async function list(query: ListQuery = {}): Promise<ListResult<T>> {
    const all = await loadJSON<T[]>(key, []);
    let data = [...all];

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
      const by = query.sortBy;
      data.sort((a: any, b: any) =>
        a[by] > b[by] ? dir : a[by] < b[by] ? -dir : 0
      );
    }

    const total = data.length;
    const pageSize = query.pageSize ?? 20;
    const page = query.page ?? 1;
    const start = (page - 1) * pageSize;
    return {
      data: data.slice(start, start + pageSize),
      page, pageSize, total,
      sort: { by: query.sortBy, dir: query.sortDir },
      filters: query.filters
    };
  }

  async function getById(id: string): Promise<T | null> {
    const all = await loadJSON<T[]>(key, []);
    return all.find(x => x.id === id) ?? null;
  }

  async function create(item: Omit<T,'id'> & Partial<Pick<T,'id'>>): Promise<T> {
    const all = await loadJSON<T[]>(key, []);
    const id = item.id ?? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const obj = { ...clone(item), id } as T;
    all.push(obj);
    await saveJSON(key, all);
    return obj;
  }

  async function update(id: string, patch: Partial<T>): Promise<T> {
    const all = await loadJSON<T[]>(key, []);
    const idx = all.findIndex(x => x.id === id);
    if (idx === -1) throw new Error(`Not found: ${entityKey}#${id}`);
    const merged = { ...all[idx], ...clone(patch) } as T;
    all[idx] = merged;
    await saveJSON(key, all);
    return merged;
  }

  async function remove(id: string): Promise<void> {
    const all = await loadJSON<T[]>(key, []);
    await saveJSON(key, all.filter(x => x.id !== id));
  }

  return { list, getById, create, update, remove, key };
}