
import { Tire, GarageStockItem } from '../../types';
import { createRepo } from '../repo';
import { DB_KEYS } from '../dbKeys';
import { addStockTransaction, postStockTransaction } from './inventory';

const tireRepo = createRepo<Tire>(DB_KEYS.TIRES);
const stockItemRepo = createRepo<GarageStockItem>(DB_KEYS.GARAGE_STOCK_ITEMS);

// Helper to generate a short unique string for doc numbers
const genSuffix = () => Math.floor(Math.random() * 10000).toString().padStart(4, '0');

export const getTires = async () => (await tireRepo.list({ pageSize: 1000 })).data;

export const addTire = async (item: Omit<Tire, 'id'>) => {
    const tire = await tireRepo.create({
        ...item,
        summerMileage: 0,
        winterMileage: 0,
    });
    
    // Если шина создается на основе складской позиции, списываем 1 шт. со склада через транзакцию расхода
    if (tire.stockItemId) {
        const stockItem = await stockItemRepo.getById(tire.stockItemId);
        if (stockItem) {
            const tx = await addStockTransaction({
                docNumber: `TO-${genSuffix()}`,
                date: new Date().toISOString().split('T')[0],
                type: 'expense',
                organizationId: stockItem.organizationId || 'unknown',
                items: [{ stockItemId: stockItem.id, quantity: 1 }],
                expenseReason: 'maintenance',
                notes: `Ввод в эксплуатацию шины: ${tire.brand} ${tire.model} (ID: ${tire.id})`
            });
            await postStockTransaction(tx.id);
        }
    }
    return tire;
};

export const updateTire = async (item: Tire) => {
    const oldTire = await tireRepo.getById(item.id);
    
    // Lifecycle logic: Если статус меняется на 'Mounted', устанавливаем дату установки
    if (oldTire && oldTire.status !== 'Mounted' && item.status === 'Mounted') {
        if (!item.installDate) item.installDate = new Date().toISOString().split('T')[0];
    }
    
    // Если статус меняется на 'Disposed', устанавливаем дату списания
    if (oldTire && oldTire.status !== 'Disposed' && item.status === 'Disposed') {
        if (!item.disposalDate) item.disposalDate = new Date().toISOString().split('T')[0];
    }

    const updatedTire = await tireRepo.update(item.id, item);
    return updatedTire;
};

export const deleteTire = async (id: string) => {
    const tire = await tireRepo.getById(id);
    // Если шина была привязана к складу, возвращаем её на склад через транзакцию прихода
    if (tire && tire.stockItemId) {
        const stockItem = await stockItemRepo.getById(tire.stockItemId);
        if (stockItem) {
            const tx = await addStockTransaction({
                docNumber: `TR-${genSuffix()}`,
                date: new Date().toISOString().split('T')[0],
                type: 'income',
                organizationId: stockItem.organizationId || 'unknown',
                items: [{ stockItemId: stockItem.id, quantity: 1 }],
                supplier: 'Возврат из эксплуатации',
                notes: `Возврат при удалении шины: ${tire.brand} ${tire.model}`
            });
            await postStockTransaction(tx.id);
        }
    }
    return tireRepo.remove(id);
};

export const bulkDeleteTires = async (ids: string[]) => {
    for (const id of ids) {
        // Повторяем логику возврата для каждого элемента
        const tire = await tireRepo.getById(id);
        if (tire && tire.stockItemId) {
            const stockItem = await stockItemRepo.getById(tire.stockItemId);
            if (stockItem) {
                const tx = await addStockTransaction({
                    docNumber: `TR-${genSuffix()}`,
                    date: new Date().toISOString().split('T')[0],
                    type: 'income',
                    organizationId: stockItem.organizationId || 'unknown',
                    items: [{ stockItemId: stockItem.id, quantity: 1 }],
                    supplier: 'Возврат из эксплуатации',
                    notes: `Возврат при массовом удалении шины: ${tire.brand} ${tire.model}`
                });
                await postStockTransaction(tx.id);
            }
        }
    }
    return tireRepo.removeBulk(ids);
};
