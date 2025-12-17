
/**
 * Выполняет асинхронную функцию в режиме эксклюзивного доступа к ресурсу (по ID).
 * Работает через Web Locks API (межвкладочная синхронизация).
 * 
 * @param resourceId - Уникальный идентификатор ресурса (например, "waybill:uuid")
 * @param callback - Функция, которую нужно выполнить
 * @param options - Дополнительные параметры (signal для отмены и т.д.)
 */
export async function withResourceLock<T>(
  resourceId: string,
  callback: () => Promise<T>,
  options: { signal?: AbortSignal; mode?: LockMode } = {}
): Promise<T> {
  // Проверка поддержки API (защита для старых браузеров и JSDOM в тестах)
  const isLocksSupported = typeof navigator !== 'undefined' && 'locks' in navigator;

  if (!isLocksSupported) {
    // Fallback: просто выполняем, надеясь на удачу (или это тесты)
    return await callback();
  }

  // Запрашиваем эксклюзивный замок. 
  // Если замок занят, промис будет ждать в очереди, пока он не освободится.
  return navigator.locks.request(
    resourceId,
    { mode: options.mode || 'exclusive', signal: options.signal },
    async () => {
      try {
        return await callback();
      } catch (error) {
        console.error(`Error inside lock for ${resourceId}:`, error);
        throw error;
      }
    }
  );
}
