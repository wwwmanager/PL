
import { createRepo } from './repo';
import { DB_KEYS } from './dbKeys';
import { Waybill, WaybillStatus } from '../types';
import { readAuditIndex, deleteAuditEvent } from './auditLog';

const waybillRepo = createRepo<Waybill>(DB_KEYS.WAYBILLS);

export interface ArchiveStats {
    waybillsByYear: Record<string, { total: number; posted: number; size: number }>;
    auditEvents: number;
}

export const getArchiveStats = async (): Promise<ArchiveStats> => {
    // This loads all into memory - inevitable for now to analyze distribution
    const waybills = (await waybillRepo.list({ pageSize: 100000 })).data;
    
    const stats: ArchiveStats['waybillsByYear'] = {};
    
    for (const w of waybills) {
        const year = w.date ? w.date.substring(0, 4) : 'Unknown';
        if (!stats[year]) stats[year] = { total: 0, posted: 0, size: 0 };
        
        stats[year].total++;
        if (w.status === WaybillStatus.POSTED || w.status === WaybillStatus.COMPLETED) {
            stats[year].posted++;
        }
        // Rough size estimation
        stats[year].size += JSON.stringify(w).length;
    }

    const auditIndex = await readAuditIndex();

    return {
        waybillsByYear: stats,
        auditEvents: auditIndex.length
    };
};

export const archiveYear = async (year: string) => {
    const allWaybills = (await waybillRepo.list({ pageSize: 100000 })).data;
    
    const toArchive = allWaybills.filter(w => {
        const wYear = w.date ? w.date.substring(0, 4) : 'Unknown';
        // Archive only finalized documents
        return wYear === year && (w.status === WaybillStatus.POSTED || w.status === WaybillStatus.COMPLETED);
    });

    if (toArchive.length === 0) return { count: 0, blob: null };

    // Create export object
    const archiveData = {
        meta: {
            type: 'archive',
            entity: 'waybills',
            year,
            count: toArchive.length,
            createdAt: new Date().toISOString()
        },
        data: toArchive
    };

    const blob = new Blob([JSON.stringify(archiveData, null, 2)], { type: 'application/json' });
    
    // Delete from DB
    const ids = toArchive.map(w => w.id);
    await waybillRepo.removeBulk(ids);

    return { count: toArchive.length, blob };
};

export const pruneAuditLog = async (keepLast: number) => {
    const index = await readAuditIndex();
    if (index.length <= keepLast) return 0;

    // index is sorted newest first. slice(keepLast) gives the older ones.
    const toDelete = index.slice(keepLast);

    let count = 0;
    for (const event of toDelete) {
        await deleteAuditEvent(event);
        count++;
    }
    return count;
};
