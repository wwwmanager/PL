// utils/safeJSON.ts
export const safeJSON = {
  parse<T>(value: any, fallback: T): T {
    try {
      if (value == null) return fallback;
      if (typeof value === 'string') return JSON.parse(value) as T;
      return value as T;
    } catch {
      return fallback;
    }
  },
  stringify(value: any, fallback = '{}'): string {
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
};