
import { createRepo } from '../repo';
import { DB_KEYS } from '../dbKeys';
import { PeriodLock, Waybill, StockTransaction, WaybillStatus, StockTransactionStatus } from '../../types';
import { generateId } from './core';

const periodLockRepo = createRepo<PeriodLock>(DB_KEYS.PERIOD_LOCKS);
const waybillRepo = createRepo<Waybill>(DB_KEYS.WAYBILLS);
const transactionRepo = createRepo<StockTransaction>(DB_KEYS.STOCK_TRANSACTIONS);

interface WorkerResponse {
    type: 'hashResult' | 'error';
    payload: {
        hash?: string;
        count?: number;
        message?: string;
    };
}

// INLINE WORKER CODE
// Мы встраиваем код воркера сюда, чтобы избежать проблем с разрешением путей (new URL) 
// в различных средах сборки и песочницах.
const WORKER_SCRIPT = `
function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(canonicalize);
  }
  const sortedKeys = Object.keys(obj).sort();
  const result = {};
  for (const key of sortedKeys) {
    // Исключаем UI-специфичные поля
    if (key === '__ui_selected') continue; 
    result[key] = canonicalize(obj[key]);
  }
  return result;
}

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === 'calculateHash') {
    try {
      const { data } = payload; 

      // 1. Сортировка по ID
      const sortedData = [...data].sort((a, b) => {
        const idA = a.id || '';
        const idB = b.id || '';
        return idA.localeCompare(idB);
      });

      // 2. Канонизация
      const canonicalData = canonicalize(sortedData);

      // 3. Строка
      const jsonString = JSON.stringify(canonicalData);

      // 4. Хэш
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
        payload: { message: error.message }
      });
    }
  }
};
`;

// Helper to run calculations in a worker
const calculateHashInWorker = (data: any[]): Promise<{ hash: string; count: number }> => {
    return new Promise((resolve, reject) => {
        // Create worker from Blob
        const blob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);

        worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
            const { type, payload } = e.data;
            if (type === 'hashResult' && payload.hash && payload.count !== undefined) {
                resolve({ hash: payload.hash, count: payload.count });
            } else {
                reject(new Error(payload.message || 'Unknown worker error'));
            }
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
        };

        worker.onerror = (err) => {
            reject(err);
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
        };

        worker.postMessage({ type: 'calculateHash', payload: { data } });
    });
};

/**
 * Получает данные за период (месяц), подлежащие защите.
 * Включает: Путевые листы (только проведенные) и Складские операции (только проведенные).
 * @param period Строка формата YYYY-MM
 */
const getDataForPeriod = async (period: string) => {
    const [allWaybills, allTransactions] = await Promise.all([
        waybillRepo.list({ pageSize: 50000 }),
        transactionRepo.list({ pageSize: 50000 })
    ]);

    const periodWaybills = allWaybills.data.filter(w => 
        w.date.startsWith(period) && w.status === WaybillStatus.POSTED
    );

    const periodTransactions = allTransactions.data.filter(t => 
        t.date.startsWith(period) && t.status === 'Posted'
    );

    // Объединяем данные в один массив для хэширования.
    return [...periodWaybills, ...periodTransactions];
};

/**
 * Закрывает период: вычисляет хэш и сохраняет блокировку.
 */
export const closePeriod = async (period: string, userId: string, notes?: string): Promise<PeriodLock> => {
    // 1. Проверка: не закрыт ли уже?
    const existing = await periodLockRepo.list({ filters: { period } });
    if (existing.data.length > 0) {
        throw new Error(`Период ${period} уже закрыт.`);
    }

    // 2. Сбор данных
    const data = await getDataForPeriod(period);
    if (data.length === 0) {
        throw new Error(`Нет данных (проведенных документов) за период ${period} для закрытия.`);
    }

    // 3. Вычисление хэша в воркере
    const { hash, count } = await calculateHashInWorker(data);

    // 4. Создание записи блокировки
    const lock: PeriodLock = {
        id: generateId(),
        period,
        lockedAt: new Date().toISOString(),
        lockedByUserId: userId,
        dataHash: hash,
        recordCount: count,
        notes
    };

    await periodLockRepo.create(lock);
    return lock;
};

/**
 * Проверяет целостность периода.
 * Возвращает true, если текущий хэш совпадает с сохраненным.
 */
export const verifyPeriod = async (periodLockId: string): Promise<{ isValid: boolean; currentHash: string; storedHash: string; details?: string }> => {
    const lock = await periodLockRepo.getById(periodLockId);
    if (!lock) throw new Error('Блокировка периода не найдена');

    const data = await getDataForPeriod(lock.period);
    
    // Если количество записей отличается, даже хэш можно не считать (быстрая проверка)
    if (data.length !== lock.recordCount) {
        return { 
            isValid: false, 
            currentHash: 'count_mismatch', 
            storedHash: lock.dataHash,
            details: `Количество записей изменилось: было ${lock.recordCount}, стало ${data.length}`
        };
    }

    const { hash } = await calculateHashInWorker(data);

    return {
        isValid: hash === lock.dataHash,
        currentHash: hash,
        storedHash: lock.dataHash
    };
};

/**
 * Проверяет, закрыт ли период для указанной даты.
 * Используется в UI/API для блокировки редактирования.
 * @param dateStr Дата в формате YYYY-MM-DD
 */
export const checkPeriodLock = async (dateStr: string): Promise<boolean> => {
    if (!dateStr || dateStr.length < 7) return false;
    const period = dateStr.substring(0, 7); // YYYY-MM
    
    // Оптимизация: можно кэшировать список закрытых периодов в памяти (как в repo.ts),
    // но repo.list уже достаточно быстр для in-memory запросов.
    const locks = await periodLockRepo.list({ filters: { period } });
    return locks.data.length > 0;
};

export const getPeriodLocks = async () => (await periodLockRepo.list({ pageSize: 1000, sortBy: 'period', sortDir: 'desc' })).data;

export const deletePeriodLock = async (id: string) => {
    return periodLockRepo.remove(id);
};
