
export class TransactionManager {
    private steps: Array<{ action: () => Promise<any>, rollback: () => Promise<any> }> = [];

    /**
     * Регистрирует шаг транзакции.
     * @param action Действие, которое нужно выполнить (например, запись в БД).
     * @param rollback Обратное действие, которое нужно выполнить в случае ошибки (например, возврат старого значения).
     */
    add(action: () => Promise<any>, rollback: () => Promise<any>) {
        this.steps.push({ action, rollback });
    }

    /**
     * Выполняет все зарегистрированные шаги последовательно.
     * В случае ошибки выполняет rollback для всех УСПЕШНО выполненных шагов в обратном порядке.
     */
    async execute() {
        const completed: Array<() => Promise<any>> = [];
        try {
            for (const step of this.steps) {
                await step.action();
                completed.push(step.rollback);
            }
        } catch (error) {
            console.error("[TransactionManager] Transaction failed. Rolling back...", error);
            // Execute rollbacks in reverse order (LIFO)
            for (let i = completed.length - 1; i >= 0; i--) {
                try {
                    await completed[i]();
                } catch (rbError) {
                    console.error(`[TransactionManager] Rollback failed at step ${i}:`, rbError);
                    // We continue attempting other rollbacks even if one fails
                }
            }
            throw error; // Re-throw the original error to the caller
        }
    }
}
