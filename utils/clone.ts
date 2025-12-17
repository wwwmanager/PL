// utils/clone.ts
export const clone = <T>(obj: T): T => {
  if (obj === undefined) return obj;
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj)) as T; // для моков достаточно
};
