// services/storage.ts
// Надёжная обёртка над хранилищем: localforage --> localStorage --> in-memory
// Поддержка "сырой" записи (raw: true) для больших строк (gzip-чанки аудита).

import { safeJSON } from '../utils/safeJSON';

type Adapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, val: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  keys: () => Promise<string[]>;
  clear: () => Promise<void>;
};

let adapter: Adapter;

// Пытаемся использовать localforage, если он подключён глобально
function detectLocalForage(): any | null {
  try {
    // @ts-ignore
    return (globalThis as any).localforage || null;
  } catch {
    return null;
  }
}

try {
  const lf = detectLocalForage();
  if (lf) {
    adapter = {
      getItem: (k) => lf.getItem(k),
      setItem: (k, v) => lf.setItem(k, v),
      removeItem: (k) => lf.removeItem(k),
      keys: () => lf.keys(),
      clear: () => lf.clear(),
    };
  } else if (typeof localStorage !== 'undefined') {
    adapter = {
      getItem: async (k) => Promise.resolve(localStorage.getItem(k)),
      setItem: async (k, v) => Promise.resolve(localStorage.setItem(k, v)),
      removeItem: async (k) => Promise.resolve(localStorage.removeItem(k)),
      keys: async () => Promise.resolve(Object.keys(localStorage)),
      clear: async () => Promise.resolve(localStorage.clear()),
    };
  } else {
    // SSR/Node или среда без Storage
    const mem = new Map<string, string>();
    adapter = {
      getItem: async (k) => mem.get(k) ?? null,
      setItem: async (k, v) => void mem.set(k, v),
      removeItem: async (k) => void mem.delete(k),
      keys: async () => Array.from(mem.keys()),
      clear: async () => void mem.clear(),
    };
  }
} catch {
  const mem = new Map<string, string>();
  adapter = {
    getItem: async (k) => mem.get(k) ?? null,
    setItem: async (k, v) => void mem.set(k, v),
    removeItem: async (k) => void mem.delete(k),
    keys: async () => Array.from(mem.keys()),
    clear: async () => void mem.clear(),
  };
}

// При желании можно централизованно включить префикс
const PREFIX: string = ''; // например: 'app:' — если хочется изоляции ключей

function fullKey(key: string) {
  return PREFIX ? `${PREFIX}${key}` : key;
}

/**
 * Считывает значение из хранилища.
 * @param key ключ
 * @param fallback значение по умолчанию при ошибке/отсутствии
 * @param raw если true — хранится/читается сырая строка без JSON.parse
 */
export async function loadJSON<T>(key: string, fallback: T, raw = false): Promise<T> {
  try {
    const rawVal = await adapter.getItem(fullKey(key));
    if (raw) {
      // Возвращаем строку как есть
      return (rawVal as any) ?? fallback;
    }
    return safeJSON.parse<T>(rawVal, fallback);
  } catch {
    return fallback;
  }
}

/**
 * Сохраняет значение в хранилище.
 * @param key ключ
 * @param value значение
 * @param raw если true — сохранить как сырую строку (value должен быть string)
 */
export async function saveJSON(key: string, value: any, raw = false): Promise<void> {
  try {
    const v = raw ? String(value ?? '') : safeJSON.stringify(value, 'null');
    await adapter.setItem(fullKey(key), v);
  } catch {
    // глотаем — хранилище может быть read-only / квота
  }
}

/**
 * Удаляет ключ.
 * @param key ключ
 * @param _raw необязательный флаг совместимости (игнорируется)
 */
export async function removeKey(key: string, _raw = false): Promise<void> {
  try {
    await adapter.removeItem(fullKey(key));
  } catch {
    // no-op
  }
}

/**
 * Clears the entire storage.
 */
export async function storageClear(): Promise<void> {
  try {
    await adapter.clear();
  } catch {
    // no-op
  }
}

export async function storageKeys(): Promise<string[]> {
  try {
    const keysResult = await adapter.keys();

    if (!Array.isArray(keysResult)) {
      // Handle cases where the storage adapter doesn't return an array.
      return [];
    }
    
    const result: string[] = [];
    // FIX: Explicitly typing PREFIX as string prevents it from being narrowed to `never`
    // inside the conditional block, which was causing a compile-time error.
    for (const k of keysResult) {
      if (typeof k !== 'string') {
        continue; // Skip non-string keys
      }

      if (PREFIX) {
        if (k.startsWith(PREFIX)) {
          result.push(k.slice(PREFIX.length));
        }
      } else {
        result.push(k);
      }
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * На всякий случай экспортируем "storageKeys" — чтобы импорты не падали.
 * Можно расширять при необходимости.
 */
export const storageKeyConstants = {
  AUDIT_INDEX: '__import_audit_log__',
  AUDIT_CHUNK_PREFIX: '__import_audit_chunk__:',
};
