
// services/auditBusiness.ts
import { createRepo } from './repo';
import { DB_KEYS } from './dbKeys';

export type BusinessEvent =
  | { id: string; at: string; userId?: string; type: 'waybill.created'; payload: { waybillId: string } }
  | { id: string; at: string; userId?: string; type: 'waybill.submitted'; payload: { waybillId: string } }
  | { id: string; at: string; userId?: string; type: 'waybill.posted'; payload: { waybillId: string } }
  | { id: string; at: string; userId?: string; type: 'waybill.cancelled'; payload: { waybillId: string } }
  | { id: string; at: string; userId?: string; type: 'waybill.corrected'; payload: { waybillId: string; reason: string } }
  | { id: string; at: string; userId?: string; type: 'waybill.numberUsed'; payload: { waybillId: string; series: string; number: number } }
  | { id: string; at: string; userId?: string; type: 'blanks.batchCreated'; payload: { batchId: string } }
  | { id: string; at: string; userId?: string; type: 'blanks.materialized'; payload: { batchId: string; created: number } }
  | { id: string; at: string; userId?: string; type: 'blanks.issued'; payload: any }
  | { id: string; at: string; userId?: string; type: 'blank.spoiled'; payload: any }
  | { id: string; at: string; userId?: string; type: 'blank.spoiled.bulk'; payload: any }
  | { id: string; at: string; userId?: string; type: 'blanks.returnedToDriver'; payload: { series: string; number: number; driverId: string } }
  | { id: string; at: string; userId?: string; type: 'blanks.spoiled'; payload: { series: string; number: number; driverId?: string; reason?: string } }
  | { id: string; at: string; userId?: string; type: 'employee.fuelReset'; payload: { employeeId: string; oldBalance: number } };

// Use Repository instance (cached internally by createRepo factory)
const repo = createRepo<BusinessEvent>(DB_KEYS.BUSINESS_AUDIT);

/**
 * Appends a new event to the audit log.
 * Uses repository pattern for storage.
 */
export async function appendEvent(e: BusinessEvent) {
  // Use create. The repository handles auto-migration from blob on first access if needed.
  await repo.create(e);
}

/**
 * Retrieves all events sorted by date (newest first).
 */
export async function getEvents() {
   const result = await repo.list({
       pageSize: 10000,
       sortBy: 'at',
       sortDir: 'desc'
   });
   return result.data;
}

export async function auditBusiness(type: BusinessEvent['type'], payload: any) {
    const event = {
        id: `evt-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        at: new Date().toISOString(),
        userId: payload?.actorId, // Extract actorId if present
        type,
        payload,
    } as BusinessEvent;
    
    await appendEvent(event);
    return event.id;
}
