// services/auditLog.ts
import { loadJSON, saveJSON, removeKey } from './storage';
// FIX: Module '"./mockApi"' has no exported member 'DB_KEYS'.
import { DB_KEYS } from './dbKeys';
import { safeJSON } from '../utils/safeJSON';

// --- TYPES (moved from component) ---
export type KeyCategory = 'dict' | 'docs' | 'other' | 'unknown';
export type ImportAuditAction = 'insert' | 'update' | 'overwrite' | 'merge' | 'delete' | 'skip' | 'write' | 'unknown';

export type ImportAuditItem = {
  storageKey: string;
  key: string;
  category?: KeyCategory;
  idField?: string | null;
  idValue?: string | number;
  action: ImportAuditAction;
  label?: string;
  params?: Record<string, any>;
  beforeExists?: boolean;
  afterExists?: boolean;
  beforeSnapshot?: any;
  afterSnapshot?: any;
  purged?: boolean;
  rolledBack?: boolean;
};

export type AuditEventHeader = {
  id: string;
  at: string;
  sourceMeta: any;
  itemCount: number;
  chunk: { keys: string[]; compression: 'gzip' | 'none'; totalChars: number };
};

// --- CONSTANTS (moved from component) ---
export const UNKNOWN_STORAGE_PREFIX = 'compat:unknown:';

// Индекс событий (без items) + чанки с items
export const AUDIT_INDEX_KEY = '__import_audit_log__';
export const AUDIT_CHUNK_PREFIX = '__import_audit_chunk__:';
export const AUDIT_MAX_EVENTS = 50;
const CHUNK_SIZE = 256_000; // символов на чанк

export function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// base64 <-> Uint8
function uint8ToBase64(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function base64ToUint8(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Попытка взять pako из глобального контекста (необязательная зависимость)
function getPako(): any | undefined {
  try {
    return (globalThis as any).pako;
  } catch {
    return undefined;
  }
}

// Компрессия
async function compressString(str: string): Promise<{ data: string; compression: 'gzip' | 'none' }> {
  try {
    const CompressionStreamCtor = (globalThis as any).CompressionStream;
    if (typeof CompressionStreamCtor === 'function') {
      const readable = new Blob([str]).stream().pipeThrough(new CompressionStreamCtor('gzip'));
      const ab = await new Response(readable).arrayBuffer();
      const b64 = uint8ToBase64(new Uint8Array(ab));
      return { data: b64, compression: 'gzip' };
    }
    const pako = getPako();
    if (pako?.gzip) {
      const gz: Uint8Array = pako.gzip(str);
      const b64 = uint8ToBase64(gz);
      return { data: b64, compression: 'gzip' };
    }
  } catch {
    // ignore -> вернём без компрессии
  }
  return { data: str, compression: 'none' };
}

async function decompressToString(data: string, compression: 'gzip' | 'none'): Promise<string> {
  if (compression !== 'gzip') {
    return data;
  }

  try {
    const DecompressionStreamCtor = (globalThis as any).DecompressionStream;
    if (typeof DecompressionStreamCtor === 'function') {
      const readable = new Blob([base64ToUint8(data)]).stream().pipeThrough(new DecompressionStreamCtor('gzip'));
      return await new Response(readable).text();
    }
    const pako = getPako();
    if (pako?.ungzip) {
      const out: string = pako.ungzip(base64ToUint8(data), { to: 'string' });
      return out;
    }
    throw new Error('Gzip decompressor not found (DecompressionStream or pako).');
  } catch (e) {
    console.error('Decompression error:', e);
    throw new Error('Не удалось распаковать gzip-данные журнала. Обновите браузер или подключите pako.');
  }
}


function chunkString(str: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out;
}

// Работа с индексом/чанками
// Было:
// export async function readAuditIndex(): Promise<AuditEventHeader[]> {
//   return await loadJSON<AuditEventHeader[]>(AUDIT_INDEX_KEY, [], true);
// }
// export async function writeAuditIndex(index: AuditEventHeader[]) {
//   await saveJSON(AUDIT_INDEX_KEY, index, true);
// }

// Стало: устойчиво к “старому” формату и пишет нормально (без raw)
 // если ещё не импортирован сверху — добавь

export async function readAuditIndex(): Promise<AuditEventHeader[]> {
  // 1) пробуем нормальное чтение JSON (без raw)
  const jsonVal = await loadJSON<unknown>(AUDIT_INDEX_KEY, null);
  if (Array.isArray(jsonVal)) {
    return jsonVal as AuditEventHeader[];
  }

  // 2) fallback: мог быть сохранён как "raw string"
  const rawVal = await loadJSON<string | null>(AUDIT_INDEX_KEY, null, true);
  if (typeof rawVal === 'string' && rawVal.trim()) {
    const parsed = safeJSON.parse<AuditEventHeader[]>(rawVal, []);
    if (Array.isArray(parsed)) return parsed;
  }

  return [];
}

export async function writeAuditIndex(index: AuditEventHeader[]) {
  // Сохраняем как обычный JSON, а не raw
  await saveJSON(AUDIT_INDEX_KEY, index);
}

export async function saveEventItemsChunks(header: AuditEventHeader, items: ImportAuditItem[]) {
  if (header.chunk?.keys?.length) {
    await Promise.all(header.chunk.keys.map((k) => removeKey(k, true)));
  }
  const raw = JSON.stringify(items);
  const { data, compression } = await compressString(raw);
  const parts = chunkString(data, CHUNK_SIZE);
  const keys = parts.map((_, i) => `${AUDIT_CHUNK_PREFIX}${header.id}:${i}`);
  await Promise.all(parts.map((part, i) => saveJSON(keys[i], part, true)));
  header.itemCount = items.length;
  header.chunk = { keys, compression, totalChars: data.length };
}

export async function loadEventItems(header: AuditEventHeader): Promise<ImportAuditItem[]> {
  const parts = await Promise.all(header.chunk.keys.map((k) => loadJSON<string | null>(k, null, true)));
  const joined = parts.map((p) => p || '').join('');
  if (!joined) return [];

  const text = await decompressToString(joined, header.chunk.compression);
  
  if (typeof text !== 'string' || text.trim() === '') return [];

  try {
    return JSON.parse(text) as ImportAuditItem[];
  } catch (parseError) {
    console.error("Failed to parse audit log items:", parseError, "Raw text:", text);
    throw new Error("Не удалось разобрать данные журнала аудита. Данные могут быть повреждены.");
  }
}

export async function appendAuditEventChunked(event: { id: string; at: string; sourceMeta: any; items: ImportAuditItem[] }) {
  const header: AuditEventHeader = {
    id: event.id,
    at: event.at,
    sourceMeta: event.sourceMeta,
    itemCount: 0,
    chunk: { keys: [], compression: 'none', totalChars: 0 },
  };
  await saveEventItemsChunks(header, event.items);

  const index = await readAuditIndex();
  index.unshift(header);

  const excess = index.splice(AUDIT_MAX_EVENTS);
  for (const h of excess) for (const k of h.chunk.keys) try { await removeKey(k, true); } catch {}
  await writeAuditIndex(index);
}

export async function saveEventItems(header: AuditEventHeader, items: ImportAuditItem[]) {
  await saveEventItemsChunks(header, items);
  const index = await readAuditIndex();
  const pos = index.findIndex((h) => h.id === header.id);
  if (pos >= 0) {
    index[pos] = header;
    await writeAuditIndex(index);
  }
}

// Категории/лейблы/params
export function inferCategoryByKeyName(key: string): KeyCategory {
  if (key.startsWith(UNKNOWN_STORAGE_PREFIX) || key.startsWith('__')) {
    return 'unknown';
  }
  const k = key.toLowerCase();
  if (k.includes('waybill') || k.includes('order') || k.includes('doc') || (k.endsWith('s') && k.includes('bill'))) return 'docs';
  if (k.includes('route')) return 'dict';
  if (k.includes('dict') || k.includes('directory') || k.includes('ref') || k.includes('spr')
    || k.includes('type') || k.includes('employee') || k.includes('driver') || k.includes('vehicle')
    || k.includes('org') || k.includes('organization') || k.includes('fuel')) return 'dict';
  return 'other';
}
export function makeLabel(obj: any) {
  if (!obj || typeof obj !== 'object') return undefined;
  return obj.name || obj.title || obj.fullName || obj.number || obj.plateNumber || obj.brand || obj.code || obj.id || undefined;
}

export const PARAMS_CONFIG = {
  waybills: [
    'id', 'number', 'date',
    { field: 'routeCount', derive: (o: any) => Array.isArray(o?.routes) ? o.routes.length : 0 },
  ],
  vehicles: ['id', 'plateNumber', 'brand', 'year', 'fuelTankCapacity'],
  employees: ['id', 'fullName', 'position', 'employeeType'],
  organizations: ['id', 'fullName', 'inn'],
  fuelTypes: ['id','code','name','density'],
  savedRoutes: ['id', 'from', 'to', 'distanceKm'],
  seasonSettings: ['type','summerMonth','winterMonth'],
} as const;

export function buildParams(key: string, obj: any) {
  const defs = (PARAMS_CONFIG as any)[key] || [];
  const out: Record<string, any> = {};
  for (const d of defs) {
    if (typeof d === 'string') {
      if (obj?.[d] !== undefined) out[d] = obj[d];
    } else {
      const val = d.derive ? d.derive(obj) : obj?.[d.field];
      if (val !== undefined) out[d.field] = val;
    }
  }
  if (!Object.keys(out).length) {
    const fallback = ['id','code','name','number','fullName','plateNumber','brand'];
    for (const f of fallback) if (obj?.[f] !== undefined) { out[f] = obj[f]; break; }
  }
  return out;
}

export function isEntityArray(val: unknown): val is Array<Record<string, any>> {
  if (!Array.isArray(val)) return false;
  if (val.length === 0) return true;
  const sample = val.slice(0, Math.min(5, val.length));
  return sample.every((x) => x && typeof x === 'object' && (('id' in x) || ('code' in x)));
}
export function entityIdField(arr: Array<Record<string, any>>): 'id' | 'code' | null {
  if (arr.length === 0) return 'id';
  const a = arr[0];
  if ('id' in a) return 'id';
  if ('code' in a) return 'code';
  return null;
}

// --- New Export/Delete Functions ---

type AuditEventHeaderLike = {
  id: string;
  at?: string; // Changed from createdAt
  chunk?: { keys: string[] };
};

function formatTsForFileName(ts?: string) {
  const d = ts ? new Date(ts) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

async function resolveHeader(ref: string | AuditEventHeaderLike): Promise<AuditEventHeader> {
  if (typeof ref !== 'string') return ref as AuditEventHeader;
  const index = await readAuditIndex();
  const header = index?.find((e: any) => e.id === ref);
  if (!header) throw new Error(`Audit event not found: ${ref}`);
  return header;
}

export async function exportAuditEvent(ref: string | AuditEventHeaderLike): Promise<{ blob: Blob; fileName: string }> {
  const header = await resolveHeader(ref);
  const items = await loadEventItems(header as AuditEventHeader);

  const payload = {
    meta: {
      app: 'waybill-app',
      kind: 'audit-event',
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      sourceEventId: header.id,
      sourceEventCreatedAt: header.at ?? null,
    },
    header,
    items,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const ts = formatTsForFileName(header.at);
  const fileName = `audit-event-${header.id}-${ts}.json`;

  return { blob, fileName };
}

export async function deleteAuditEvent(ref: string | AuditEventHeaderLike): Promise<void> {
  const header = await resolveHeader(ref);

  const chunkKeys = header.chunk?.keys || [];
  await Promise.all(
    chunkKeys.map((k) => removeKey(k, true).catch(() => {})),
  );

  const index = await readAuditIndex();
  const nextEvents = index.filter((e: any) => e.id !== header.id);
  
  await writeAuditIndex(nextEvents);
}

// --- NEW FUNCTIONS (from storage.ts) ---

const DEFAULT_ID_FIELD = 'id';

function groupByStorageKey(items: ImportAuditItem[]) {
  const byKey = new Map<string, ImportAuditItem[]>();
  for (const item of items) {
    const bucket = byKey.get(item.storageKey);
    if (bucket) {
      bucket.push(item);
    } else {
      byKey.set(item.storageKey, [item]);
    }
  }
  return byKey;
}

export async function purgeAuditItems(items: ImportAuditItem[]) {
  const byKey = groupByStorageKey(items);
  let success = 0;
  let failed = 0;

  for (const [storageKey, arr] of byKey.entries()) {
    try {
      const current = await loadJSON<unknown>(storageKey, null, true);
      if (Array.isArray(current)) {
        const idField = arr.find((x) => x.idField)?.idField || DEFAULT_ID_FIELD;
        const ids = new Set(arr.map((x) => x.idValue));
        const filtered = (current as Record<string, unknown>[]).filter((entry) => !ids.has(entry?.[idField] as (string | number | undefined)));
        await saveJSON(storageKey, filtered, true);
        success += arr.length;
      } else {
        await removeKey(storageKey, true);
        success += arr.length;
      }
    } catch {
      failed += arr.length;
    }
  }

  return { success, failed };
}

export async function rollbackAuditItems(items: ImportAuditItem[]) {
  const byKey = groupByStorageKey(items);
  let success = 0;
  let failed = 0;

  for (const [storageKey, arr] of byKey.entries()) {
    try {
      const current = await loadJSON<unknown>(storageKey, null, true);
      if (Array.isArray(current)) {
        const idField = arr.find((x) => x.idField)?.idField || DEFAULT_ID_FIELD;
        const map = new Map<any, any>(
          (current as any[]).map((entry) => [entry?.[idField], entry]),
        );

        for (const it of arr) {
          const id = it.idValue;
          if (id === undefined) continue;

          if (it.beforeExists) {
            if (it.beforeSnapshot !== undefined) {
              map.set(id, it.beforeSnapshot as Record<string, unknown>);
            } else {
              map.delete(id);
            }
          } else {
            map.delete(id);
          }
          success += 1;
        }

        await saveJSON(storageKey, Array.from(map.values()), true);
      } else {
        const first = arr.find((x) => x.beforeSnapshot !== undefined);
        await saveJSON(storageKey, first ? first.beforeSnapshot ?? null : null, true);
        success += arr.length;
      }
    } catch {
      failed += arr.length;
    }
  }

  return { success, failed };
}