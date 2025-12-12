
import { GarageStockItem, StockTransaction, Employee } from '../../types';
import { createRepo } from '../repo';
import { DB_KEYS } from '../dbKeys';
import { broadcast } from '../bus';
import { generateNextNumber } from '../sequenceService';
import { TransactionManager } from '../transactionService';
import { checkPeriodLock } from './integrity';

const stockItemRepo = createRepo<GarageStockItem>(DB_KEYS.GARAGE_STOCK_ITEMS);
const stockTxRepo = createRepo<StockTransaction>(DB_KEYS.STOCK_TRANSACTIONS);
// We need access to employees for fuel card balance read/write
const employeeRepo = createRepo<Employee>(DB_KEYS.EMPLOYEES);

export const getGarageStockItems = async () => (await stockItemRepo.list({ pageSize: 1000 })).data;

export const addGarageStockItem = async (item: Omit<GarageStockItem, 'id'>) => {
    if (!item.code || item.code.trim() === '') {
        item.code = await generateNextNumber('item');
    }
    return stockItemRepo.create(item);
};

export const updateGarageStockItem = (item: GarageStockItem) => stockItemRepo.update(item.id, item);
export const deleteGarageStockItem = (id: string) => stockItemRepo.remove(id);

export const getStockTransactions = async () => (await stockTxRepo.list({ pageSize: 1000 })).data;

// --- Transaction Lifecycle Management ---

export const addStockTransaction = async (item: Omit<StockTransaction, 'id' | 'status'>) => {
    // 1. ЗАЩИТА: Проверка периода
    if (await checkPeriodLock(item.date)) {
        throw new Error(`Период закрыт для даты ${item.date}. Создание невозможно.`);
    }

    // 0. Auto-generate Number
    if (!item.docNumber || item.docNumber.trim() === '') {
        if (item.type === 'income') {
            item.docNumber = await generateNextNumber('income', item.date);
        } else if (item.expenseReason === 'fuelCardTopUp') {
            item.docNumber = await generateNextNumber('fuelCard', item.date);
        } else {
            item.docNumber = await generateNextNumber('expense', item.date);
        }
    }

    // 2. Create with Draft status (NO side effects on stock balances yet)
    const transaction = { ...item, status: 'Draft' as const };
    
    // 3. Save the transaction record
    const result = await stockTxRepo.create(transaction);
    
    // Notify UI to refresh
    broadcast('stock');
    
    return result;
};

export const postStockTransaction = async (id: string) => {
    const tx = await stockTxRepo.getById(id);
    if (!tx) throw new Error('Transaction not found');
    
    // ЗАЩИТА: Проверка периода перед проведением
    if (await checkPeriodLock(tx.date)) {
        throw new Error(`Период закрыт для даты ${tx.date}. Проведение невозможно.`);
    }

    if (tx.status === 'Posted') throw new Error('Transaction already posted');

    const tm = new TransactionManager();

    // 1. Validate and Prepare Stock Items
    const stockItemsMap = new Map<string, GarageStockItem>();
    for (const txItem of tx.items) {
        const stockItem = await stockItemRepo.getById(txItem.stockItemId);
        if (!stockItem) throw new Error(`Товар с ID ${txItem.stockItemId} не найден.`);
        
        // Validation logic moved here from 'add'
        if (tx.type === 'expense') {
            // Разрешаем уходить в минус ТОЛЬКО если это пополнение топливной карты
            if (tx.expenseReason !== 'fuelCardTopUp' && stockItem.balance < txItem.quantity) {
                throw new Error(`Недостаточно товара "${stockItem.name}" на складе. Доступно: ${stockItem.balance}, Требуется: ${txItem.quantity}`);
            }
        }
        stockItemsMap.set(stockItem.id, stockItem);
    }

    // 2. Queue Stock Movements
    for (const txItem of tx.items) {
        const stockItem = stockItemsMap.get(txItem.stockItemId)!;
        const originalBalance = stockItem.balance;
        const originalDate = stockItem.lastTransactionDate;
        
        let newBalance = originalBalance;
        if (tx.type === 'income') {
            newBalance += txItem.quantity;
        } else {
            newBalance -= txItem.quantity;
        }

        tm.add(
            async () => {
                const item = await stockItemRepo.getById(stockItem.id);
                if(item) {
                    item.balance = newBalance;
                    if (tx.type === 'income' && txItem.unitPrice) {
                        item.lastPurchasePrice = txItem.unitPrice;
                    }
                    item.lastTransactionDate = tx.date;
                    await stockItemRepo.update(item.id, item);
                }
            },
            async () => {
                // Rollback
                const item = await stockItemRepo.getById(stockItem.id);
                if(item) {
                    item.balance = originalBalance;
                    item.lastTransactionDate = originalDate; // Imperfect rollback if interleaved updates, but sufficient for simple undo
                    await stockItemRepo.update(item.id, item);
                }
            }
        );
    }

    // 3. Queue Fuel Card Update (Side Effect)
    if (tx.type === 'expense' && tx.expenseReason === 'fuelCardTopUp' && tx.driverId) {
        const driver = await employeeRepo.getById(tx.driverId);
        if (!driver) throw new Error(`Водитель с ID ${tx.driverId} не найден.`);
        const originalBalance = driver.fuelCardBalance || 0;

        let totalFuel = 0;
        for (const txItem of tx.items) {
            const stockItem = stockItemsMap.get(txItem.stockItemId)!;
            if (stockItem.fuelTypeId || stockItem.group === 'ГСМ') {
                totalFuel += txItem.quantity;
            }
        }

        if (totalFuel > 0) {
            const newDriverBalance = originalBalance + totalFuel;
            tm.add(
                async () => {
                    const d = await employeeRepo.getById(tx.driverId!);
                    if(d) {
                        d.fuelCardBalance = newDriverBalance;
                        await employeeRepo.update(d.id, d);
                    }
                },
                async () => {
                    const d = await employeeRepo.getById(tx.driverId!);
                    if(d) {
                        d.fuelCardBalance = originalBalance;
                        await employeeRepo.update(d.id, d);
                    }
                }
            );
        }
    }

    // 4. Update Transaction Status
    tm.add(
        async () => {
            const t = await stockTxRepo.getById(id);
            if(t) {
                t.status = 'Posted';
                await stockTxRepo.update(id, t);
            }
        },
        async () => {
            const t = await stockTxRepo.getById(id);
            if(t) {
                t.status = 'Draft';
                await stockTxRepo.update(id, t);
            }
        }
    );

    await tm.execute();
    broadcast('stock');
    return await stockTxRepo.getById(id);
};

export const unpostStockTransaction = async (id: string) => {
    const tx = await stockTxRepo.getById(id);
    if (!tx) throw new Error('Transaction not found');
    
    // ЗАЩИТА: Проверка периода перед отменой проведения
    if (await checkPeriodLock(tx.date)) {
        throw new Error(`Период закрыт для даты ${tx.date}. Отмена проведения невозможна.`);
    }

    // Handle legacy records where status might be undefined (treat as Posted)
    if (tx.status && tx.status !== 'Posted') throw new Error('Transaction is not posted');

    const tm = new TransactionManager();

    // 1. Prepare Reversals
    
    // Fuel Card Reversal Check
    if (tx.type === 'expense' && tx.expenseReason === 'fuelCardTopUp' && tx.driverId) {
        const driver = await employeeRepo.getById(tx.driverId);
        if (driver) {
            let totalFuelAdded = 0;
            for (const txItem of tx.items) {
                const stockItem = await stockItemRepo.getById(txItem.stockItemId);
                if (stockItem && (stockItem.fuelTypeId || stockItem.group === 'ГСМ')) {
                    totalFuelAdded += txItem.quantity;
                }
            }
            
            // Check if driver has enough balance to rollback
            if ((driver.fuelCardBalance || 0) < totalFuelAdded) {
                throw new Error(`Невозможно отменить пополнение: водитель уже израсходовал это топливо. Баланс: ${driver.fuelCardBalance}, нужно списать: ${totalFuelAdded}`);
            }

            const originalBalance = driver.fuelCardBalance || 0;
            const newBalance = originalBalance - totalFuelAdded;

            tm.add(
                async () => {
                    const d = await employeeRepo.getById(tx.driverId!);
                    if(d) {
                        d.fuelCardBalance = newBalance;
                        await employeeRepo.update(d.id, d);
                    }
                },
                async () => {
                    const d = await employeeRepo.getById(tx.driverId!);
                    if(d) {
                        d.fuelCardBalance = originalBalance;
                        await employeeRepo.update(d.id, d);
                    }
                }
            );
        }
    }

    // Stock Items Reversal
    if (tx.expenseReason !== 'inventoryAdjustment') {
        for (const txItem of tx.items) {
            const stockItem = await stockItemRepo.getById(txItem.stockItemId);
            if (stockItem) {
                const originalBalance = stockItem.balance;
                let newBalance = originalBalance;

                if (tx.type === 'income') {
                    // Rolling back income -> Decrease balance
                    if (stockItem.balance < txItem.quantity) {
                        throw new Error(`Невозможно отменить приход "${stockItem.name}": товар уже был списан. Остаток: ${stockItem.balance}`);
                    }
                    newBalance -= txItem.quantity;
                } else {
                    // Rolling back expense -> Increase balance
                    newBalance += txItem.quantity;
                }

                tm.add(
                    async () => {
                        const item = await stockItemRepo.getById(stockItem.id);
                        if(item) {
                            item.balance = newBalance;
                            await stockItemRepo.update(item.id, item);
                        }
                    },
                    async () => {
                        const item = await stockItemRepo.getById(stockItem.id);
                        if(item) {
                            item.balance = originalBalance;
                            await stockItemRepo.update(item.id, item);
                        }
                    }
                );
            }
        }
    }

    // Update Status
    tm.add(
        async () => {
            const t = await stockTxRepo.getById(id);
            if(t) {
                t.status = 'Draft';
                await stockTxRepo.update(id, t);
            }
        },
        async () => {
            const t = await stockTxRepo.getById(id);
            if(t) {
                t.status = 'Posted'; // Revert to Posted if failure
                await stockTxRepo.update(id, t);
            }
        }
    );

    await tm.execute();
    broadcast('stock');
    return await stockTxRepo.getById(id);
};

// SPECIAL FUNCTION: Adds a correction transaction AND POSTS IT immediately.
// Used for "Reset Balance" feature to fix driver's history
export const addBalanceCorrection = async (
    driverId: string, 
    deltaQuantity: number, 
    organizationId: string,
    notes: string
) => {
    // We need at least one stock item to attach the transaction to (DB requirement)
    // Prefer a FUEL item, otherwise take the first available.
    const allItems = await getGarageStockItems();
    const fuelItem = allItems.find(i => i.group === 'ГСМ' || i.fuelTypeId) || allItems[0];
    
    if (!fuelItem) {
        console.warn("No stock items found to attach correction transaction.");
        return; 
    }

    const docNumber = await generateNextNumber('fuelCard', new Date().toISOString().split('T')[0]);

    const txItem: Omit<StockTransaction, 'id' | 'status'> = {
        docNumber: docNumber,
        date: new Date().toISOString().split('T')[0],
        type: 'expense',
        expenseReason: 'inventoryAdjustment', // Special reason
        driverId: driverId,
        organizationId: organizationId,
        items: [{
            stockItemId: fuelItem.id,
            quantity: deltaQuantity
        }],
        notes: notes
    };

    // 1. Create Draft (Check period lock inside addStockTransaction)
    const tx = await addStockTransaction(txItem);
    
    // 2. Post
    if (tx) {
        tx.status = 'Posted';
        await stockTxRepo.update(tx.id, tx);
    }

    broadcast('stock');
};

export const updateStockTransaction = async (item: StockTransaction) => {
    const oldTx = await stockTxRepo.getById(item.id);
    if (!oldTx) throw new Error('Document not found');

    if (item.status === 'Posted') {
        throw new Error('Нельзя редактировать проведенный документ. Сначала отмените проведение.');
    }

    // ЗАЩИТА: Проверка старой даты
    if (await checkPeriodLock(oldTx.date)) {
        throw new Error(`Период ${oldTx.date} закрыт. Редактирование невозможно.`);
    }

    // ЗАЩИТА: Проверка новой даты (перенос)
    if (item.date !== oldTx.date) {
        if (await checkPeriodLock(item.date)) {
            throw new Error(`Период ${item.date} закрыт. Перенос невозможен.`);
        }
    }

    const result = await stockTxRepo.update(item.id, item);
    broadcast('stock'); 
    return result;
};

export const deleteStockTransaction = async (id: string) => {
    const tx = await stockTxRepo.getById(id);
    if (!tx) throw new Error('Document not found');

    if (tx.status === 'Posted' || (!tx.status && tx.status !== 'Draft')) {
         throw new Error('Нельзя удалить проведенный документ. Сначала отмените проведение.');
    }

    // ЗАЩИТА: Проверка периода
    if (await checkPeriodLock(tx.date)) {
        throw new Error(`Период ${tx.date} закрыт. Удаление невозможно.`);
    }

    // If it's a Draft, we can safely delete
    await stockTxRepo.remove(id);
    
    // Notify UI
    broadcast('stock');
};

export const getAvailableFuelExpenses = async (driverId: string, waybillId: string | null) => {
    const all = await stockTxRepo.list({ pageSize: 10000, filters: { driverId, type: 'expense' } });
    // Filter only POSTED transactions that are expenses and not yet linked
    return all.data.filter(tx => 
        (tx.status === 'Posted' || tx.status === undefined) && 
        (!tx.waybillId || tx.waybillId === waybillId)
    );
};

export const getFuelCardBalance = async (driverId: string) => {
    const emp = await employeeRepo.getById(driverId);
    return emp?.fuelCardBalance || 0;
};
