
/**
 * Рекурсивно сортирует ключи объекта для получения стабильного JSON представления.
 * Это необходимо для детерминированного хэширования данных.
 */
export function canonicalize(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(canonicalize);
  }

  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, any> = {};

  for (const key of sortedKeys) {
    result[key] = canonicalize(obj[key]);
  }

  return result;
}

/**
 * Вычисляет SHA-256 хэш строки.
 * Использует Web Crypto API.
 */
export async function computeHash(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
