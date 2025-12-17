
import { WaybillBlankBatch, WaybillBlank } from '../../types';
import { createRepo } from '../repo';
import { DB_KEYS } from '../dbKeys';
import { auditBusiness } from '../auditBusiness';

const batchRepo = createRepo<WaybillBlankBatch>(DB_KEYS.WAYBILL_BLANK_BATCHES);
const blankRepo = createRepo<WaybillBlank>(DB_KEYS.WAYBILL_BLANKS);

export const getBlankBatches = async () => (await batchRepo.list({ pageSize: 1000 })).data;
export const createBlankBatch = (item: Omit<WaybillBlankBatch, 'id'|'status'>) => batchRepo.create({ ...item, status: 'active' });
export const getBlanks = async () => (await blankRepo.list({ pageSize: 10000 })).data;

export const materializeBatch = async (batchId: string) => {
    const batch = await batchRepo.getById(batchId);
    if(!batch) throw new Error('Batch not found');
    let count = 0;
    for(let i = batch.startNumber; i <= batch.endNumber; i++) {
        await blankRepo.create({ 
            organizationId: batch.organizationId, 
            batchId: batch.id, 
            series: batch.series, 
            number: i, 
            status: 'available', 
            ownerEmployeeId: null,
            version: 1,
            updatedAt: new Date().toISOString(),
            updatedBy: 'system'
        });
        count++;
    }
    return { created: count };
};

export const issueBlanksToDriver = async (params: any, ctx: any) => {
    const { batchId, ownerEmployeeId, ranges } = params;
    const issued = [];
    const allBlanks = await blankRepo.list({ pageSize: 10000 });
    for(const r of ranges) {
        const targets = allBlanks.data.filter(b => b.batchId === batchId && b.number >= r.from && b.number <= r.to);
        for(const b of targets) {
            b.status = 'issued';
            b.ownerEmployeeId = ownerEmployeeId;
            await blankRepo.update(b.id, b);
            issued.push(b.id);
        }
    }
    await auditBusiness('blanks.issued', { params, ...ctx });
    return { issued, skipped: [] };
};

export const searchBlanks = async (query: any) => {
    const { series, number, status, ownerEmployeeId, page, pageSize } = query;

    const all = await blankRepo.list({ 
        pageSize: pageSize || 50, 
        page: page || 1,
        predicate: (b) => {
            // Фильтр по серии (частичное совпадение)
            if (series && !b.series.toLowerCase().includes(series.toLowerCase())) return false;
            
            // Фильтр по номеру (точное совпадение)
            if (number !== undefined && b.number !== number) return false;
            
            // Фильтр по статусу (массив)
            if (status && Array.isArray(status) && status.length > 0 && !status.includes(b.status)) return false;
            
            // Фильтр по владельцу
            if (ownerEmployeeId && b.ownerEmployeeId !== ownerEmployeeId) return false;
            
            return true;
        }
    });
    return { items: all.data, total: all.total };
};

export const spoilBlank = async (params: any, ctx: any) => {
    const all = await blankRepo.list({ pageSize: 10000 });
    const b = all.data.find(x => x.id === params.blankId);
    if(b) {
        b.status = 'spoiled';
        b.spoilReasonCode = params.reasonCode;
        b.spoilReasonNote = params.note;
        b.spoiledAt = new Date().toISOString();
        await blankRepo.update(b.id, b);
        await auditBusiness('blank.spoiled', { params, ...ctx });
    }
};

export const bulkSpoilBlanks = async (params: any, ctx: any) => {
    return { spoiled: [], skipped: [] };
};

export const countBlanksByFilter = async (filter: any) => 0; 

export const getNextBlankForDriver = async (driverId: string, orgId: string) => {
    const all = (await blankRepo.list({ pageSize: 10000 })).data;
    // Find first issued blank
    // Sort by series then number to ensure sequential usage
    const driverBlanks = all.filter(b => b.ownerEmployeeId === driverId && b.status === 'issued');
    driverBlanks.sort((a, b) => a.series.localeCompare(b.series) || a.number - b.number);
    
    return driverBlanks[0] || null;
};

export const reserveBlank = async (blankId: string, waybillId: string) => {
    const b = await blankRepo.getById(blankId);
    if (b && b.status === 'issued') {
        b.status = 'reserved';
        b.reservedByWaybillId = waybillId;
        b.reservedAt = new Date().toISOString();
        await blankRepo.update(b.id, b);
    }
};

export const useBlankForWaybill = async (blankId: string, waybillId: string) => {
    const b = await blankRepo.getById(blankId);
    if(b) {
        b.status = 'used';
        b.usedInWaybillId = waybillId;
        await blankRepo.update(b.id, b);
    }
};

export const releaseBlank = async (blankId: string) => {
    const b = await blankRepo.getById(blankId);
    if (b) {
        b.status = 'issued';
        b.usedInWaybillId = null;
        b.reservedByWaybillId = null;
        b.reservedAt = null;
        await blankRepo.update(b.id, b);
    }
};

export const markBlankAsSpoiled = async (blankId: string, reason: string = 'Отмена путевого листа') => {
    const b = await blankRepo.getById(blankId);
    if (b) {
        b.status = 'spoiled';
        b.spoilReasonCode = 'other';
        b.spoilReasonNote = reason;
        b.spoiledAt = new Date().toISOString();
        // Clear linkage to waybill as it's now spoiled independently
        b.usedInWaybillId = null; 
        b.reservedByWaybillId = null;
        await blankRepo.update(b.id, b);
    }
};
