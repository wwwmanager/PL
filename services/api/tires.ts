
import { Tire, GarageStockItem } from '../../types';
import { createRepo } from '../repo';
import { DB_KEYS } from '../dbKeys';
import { broadcast } from '../bus';

const tireRepo = createRepo<Tire>(DB_KEYS.TIRES);
const stockItemRepo = createRepo<GarageStockItem>(DB_KEYS.GARAGE_STOCK_ITEMS);

// Helper to update stock balance
const updateStockBalance = async (stockItemId: string | undefined, delta: number) => {
    if (!stockItemId) return;
    const item = await stockItemRepo.getById(stockItemId);
    if (item) {
        item.balance = (item.balance || 0) + delta;
        await stockItemRepo.update(item.id, item);
        broadcast('stock'); // Notify UI that stock changed
    }
};

export const getTires = async () => (await tireRepo.list({ pageSize: 1000 })).data;

export const addTire = async (item: Omit<Tire, 'id'>) => {
    const tire = await tireRepo.create({
        ...item,
        summerMileage: 0,
        winterMileage: 0,
    });
    
    // When creating a specific tire record linked to a generic stock item,
    // we decrement the generic stock balance (converting generic item -> specific tire record).
    if (tire.stockItemId) {
        await updateStockBalance(tire.stockItemId, -1);
    }
    return tire;
};

export const updateTire = async (item: Tire) => {
    const oldTire = await tireRepo.getById(item.id);
    
    // Lifecycle logic: If status changes to 'Mounted', set install date if missing
    if (oldTire && oldTire.status !== 'Mounted' && item.status === 'Mounted') {
        if (!item.installDate) item.installDate = new Date().toISOString().split('T')[0];
    }
    
    // If status changes to 'Disposed', set disposal date
    if (oldTire && oldTire.status !== 'Disposed' && item.status === 'Disposed') {
        if (!item.disposalDate) item.disposalDate = new Date().toISOString().split('T')[0];
    }
    
    // Logic for Stock Balance when Status changes
    // 1. InStock -> Mounted/Disposed: -1 to Stock Balance?
    //    Actually, 'InStock' here means it is tracked as a unique Tire item but sitting in warehouse.
    //    The 'stockItemId' link is usually for the INITIAL creation from bulk stock.
    //    So we typically don't move it back/forth to bulk stock based on status unless specifically requested.
    //    However, if we are implementing strict tracking:
    //    If a Tire is created from Stock, stock balance -1.
    //    If Tire is deleted, stock balance +1.
    //    Changing status 'InStock' <-> 'Mounted' is internal to Tire module, doesn't affect Bulk Stock Item count usually.
    
    // BUT, if user wants to "Return to Bulk Stock" (delete unique tire), that's deleteTire.
    
    // If we want to support logic:
    // "InStock" unique tire = Does NOT count towards Bulk Stock Item balance (because it's now a unique asset).
    // So no changes needed here for status updates regarding stock balance.

    const updatedTire = await tireRepo.update(item.id, item);
    return updatedTire;
};

export const deleteTire = async (id: string) => {
    const tire = await tireRepo.getById(id);
    // If the tire was linked to stock, return it to stock balance upon deletion
    if (tire && tire.stockItemId) {
        await updateStockBalance(tire.stockItemId, 1);
    }
    return tireRepo.remove(id);
};

export const bulkDeleteTires = async (ids: string[]) => {
    for (const id of ids) {
        const tire = await tireRepo.getById(id);
        if (tire && tire.stockItemId) {
            await updateStockBalance(tire.stockItemId, 1);
        }
    }
    return tireRepo.removeBulk(ids);
};
