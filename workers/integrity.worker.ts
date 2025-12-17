
/// <reference lib="webworker" />

// Дублируем функцию канонизации здесь для полной автономности воркера и избежания проблем с импортами в разных сборщиках
function canonicalize(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(canonicalize);
  }
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, any> = {};
  for (const key of sortedKeys) {
    // Исключаем системные поля, которые могут меняться без изменения бизнес-сути
    // Например, если мы захотим перегенерировать ID при миграции, это сломает хэш.
    // Но для строгого аудита ID важен. Оставляем ID.
    // Исключаем только технические поля, если они есть (например, локальные флаги UI)
    if (key === '__ui_selected') continue; 
    result[key] = canonicalize(obj[key]);
  }
  return result;
}

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'calculateHash') {
    try {
      const { data } = payload; // data - массив объектов (Waybills, Transactions)

      // 1. Сортируем массив по ID, чтобы порядок записей не влиял на хэш
      const sortedData = [...data].sort((a: any, b: any) => {
        const idA = a.id || '';
        const idB = b.id || '';
        return idA.localeCompare(idB);
      });

      // 2. Канонизируем каждый объект
      const canonicalData = canonicalize(sortedData);

      // 3. Превращаем в строку
      const jsonString = JSON.stringify(canonicalData);

      // 4. Считаем хэш
      const msgBuffer = new TextEncoder().encode(jsonString);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      self.postMessage({
        type: 'hashResult',
        payload: {
          hash: hashHex,
          count: sortedData.length
        }
      });
    } catch (error) {
      self.postMessage({
        type: 'error',
        payload: { message: (error as Error).message }
      });
    }
  }
};
