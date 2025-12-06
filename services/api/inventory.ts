
import { GarageStockItem, StockTransaction, Employee } from '../../types';
import { createRepo } from '../repo';
import { DB_KEYS } from '../dbKeys';
import { broadcast } from '../bus';

const stockItemRepo = createRepo<GarageStockItem>(DB_KEYS.GARAGE_STOCK_ITEMS);
const stockTxRepo = createRepo<StockTransaction>(DB_KEYS.STOCK_TRANSACTIONS);
// We need access to employees for fuel card balance read/write
const employeeRepo = createRepo<Employee>(DB_KEYS.EMPLOYEES);

export const getGarageStockItems = async () => (await stockItemRepo.list({ pageSize: 1000 })).data;
export const addGarageStockItem = (item: Omit<GarageStockItem, 'id'>) => stockItemRepo.create(item);
export const updateGarageStockItem = (item: GarageStockItem) => stockItemRepo.update(item.id, item);
export const deleteGarageStockItem = (id: string) => stockItemRepo.remove(id);

export const getStockTransactions = async () => (await stockTxRepo.list({ pageSize: 1000 })).data;

export const addStockTransaction = async (item: Omit<StockTransaction, 'id'>) => {
    // 1. Validate Stock Items availability first
    const stockItemsMap = new Map<string, GarageStockItem>();
    
    for (const txItem of item.items) {
        const stockItem = await stockItemRepo.getById(txItem.stockItemId);
        if (!stockItem) {
            throw new Error(`Товар с ID ${txItem.stockItemId} не найден.`);
        }
        
        if (item.type === 'expense') {
            if (stockItem.balance < txItem.quantity) {
                throw new Error(`Недостаточно товара "${stockItem.name}" на складе. Доступно: ${stockItem.balance}, Требуется: ${txItem.quantity}`);
            }
        }
        stockItemsMap.set(stockItem.id, stockItem);
    }

    // 2. Perform Stock Movements (Update Balances)
    for (const txItem of item.items) {
        const stockItem = stockItemsMap.get(txItem.stockItemId)!;
        if (item.type === 'income') {
            stockItem.balance += txItem.quantity;
            if (txItem.unitPrice) {
                stockItem.lastPurchasePrice = txItem.unitPrice;
            }
            stockItem.lastTransactionDate = item.date;
        } else {
            stockItem.balance -= txItem.quantity;
            stockItem.lastTransactionDate = item.date;
        }
        await stockItemRepo.update(stockItem.id, stockItem);
    }

    // 3. Handle Fuel Card Top-Up Side Effect (INCOME to Driver Card)
    // FIX: Using expenseReason 'fuelCardTopUp' which is an expense from Warehouse perspective but Income for Driver
    if (item.type === 'expense' && item.expenseReason === 'fuelCardTopUp' && item.driverId) {
        // Must fetch FRESH driver data to avoid overwriting parallel updates
        const driver = await employeeRepo.getById(item.driverId);
        if (!driver) {
            throw new Error(`Водитель с ID ${item.driverId} не найден.`);
        }

        let totalFuel = 0;
        for (const txItem of item.items) {
            const stockItem = stockItemsMap.get(txItem.stockItemId)!;
            // Check if item is essentially fuel
            if (stockItem.fuelTypeId || stockItem.group === 'ГСМ') {
                totalFuel += txItem.quantity;
            }
        }

        if (totalFuel > 0) {
            driver.fuelCardBalance = (driver.fuelCardBalance || 0) + totalFuel;
            await employeeRepo.update(driver.id, driver);
        }
    }

    // 4. Save the transaction record
    const result = await stockTxRepo.create(item);
    
    // Notify UI to refresh stock balances
    broadcast('stock');
    
    return result;
};

export const updateStockTransaction = async (item: StockTransaction) => {
    const result = await stockTxRepo.update(item.id, item);
    broadcast('stock'); // Update might change details affecting views
    return result;
};

export const deleteStockTransaction = async (id: string) => {
    const tx = await stockTxRepo.getById(id);
    if (!tx) throw new Error('Document not found');

    // 1. Check if rollback is possible (especially for fuel cards)
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
                throw new Error(`Невозможно удалить пополнение карты: водитель уже израсходовал это топливо. Текущий баланс: ${driver.fuelCardBalance}, нужно списать: ${totalFuelAdded}`);
            }
        }
    }

    // 2. Rollback Stock Items
    for (const txItem of tx.items) {
        const stockItem = await stockItemRepo.getById(txItem.stockItemId);
        if (stockItem) {
            if (tx.type === 'income') {
                // Rolling back income means removing items. Check for negative balance.
                if (stockItem.balance < txItem.quantity) {
                     throw new Error(`Невозможно удалить приход "${stockItem.name}": товар уже был списан. Текущий остаток: ${stockItem.balance}`);
                }
                stockItem.balance -= txItem.quantity;
            } else {
                // Rolling back expense means returning items to stock.
                stockItem.balance += txItem.quantity;
            }
            await stockItemRepo.update(stockItem.id, stockItem);
        }
    }

    // 3. Rollback Driver Fuel Balance
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
            driver.fuelCardBalance = (driver.fuelCardBalance || 0) - totalFuelAdded;
            await employeeRepo.update(driver.id, driver);
        }
    }

    // 4. Remove record
    await stockTxRepo.remove(id);
    
    // Notify UI
    broadcast('stock');
};

export const getAvailableFuelExpenses = async (driverId: string, waybillId: string | null) => {
    // Find expense transactions for this driver that are not yet fully linked to *other* waybills
    // For simplicity: Find expenses where driverId matches, type is 'expense', and waybillId is null OR equal to current
    const all = await stockTxRepo.list({ pageSize: 10000, filters: { driverId, type: 'expense' } });
    return all.data.filter(tx => !tx.waybillId || tx.waybillId === waybillId);
};

export const getFuelCardBalance = async (driverId: string) => {
    const emp = await employeeRepo.getById(driverId);
    return emp?.fuelCardBalance || 0;
};
