// services/auditBusiness.ts
import { loadJSON, saveJSON } from './storage';

const KEY = 'businessAudit_v1';

export type BusinessEvent =
  | { id: string; at: string; userId?: string; type: 'waybill.created'; payload: { waybillId: string } }
  | { id: string; at: string; userId?: string; type: 'waybill.submitted'; payload: { waybillId: string } }
  | { id: string; at: string; userId?: string; type: 'waybill.posted'; payload: { waybillId: string } }
  | { id: string; at: string; userId?: string; type: 'waybill.cancelled'; payload: { waybillId: string } }
  | { id: string; at: string; userId?: string; type: 'waybill.corrected'; payload: { waybillId: string; reason: string } }
  | { id: string; at: string; userId?: string; type: 'waybill.numberUsed'; payload: { waybillId: string; series: string; number: number } }
  | { id: string; at: string; userId?: string; type: 'blanks.batchCreated'; payload: { batchId: string } }
  | { id: string; at: string; userId?: string; type: 'blanks.materialized'; payload: { batchId: string; created: number } }
  // FIX: Added optional userId to these event types for consistency.
  | { id: string; at: string; userId?: string; type: 'blanks.issued'; payload: any }
  | { id: string; at: string; userId?: string; type: 'blank.spoiled'; payload: any }
  | { id: string; at: string; userId?: string; type: 'blank.spoiled.bulk'; payload: any }
  | { id: string; at: string; userId?: string; type: 'blanks.returnedToDriver'; payload: { series: string; number: number; driverId: string } }
  | { id: string; at: string; userId?: string; type: 'blanks.spoiled'; payload: { series: string; number: number; driverId?: string; reason?: string } };


let cache: BusinessEvent[] | null = null;

export async function appendEvent(e: BusinessEvent) {
  const loadedList = cache ?? ((await loadJSON<BusinessEvent[]>(KEY, [])) ?? []);
  const newList = [e, ...loadedList];
  cache = newList;
  await saveJSON(KEY, newList);
}

export async function getEvents() {
  return cache ?? ((await loadJSON<BusinessEvent[]>(KEY, [])) ?? []);
}

export async function auditBusiness(type: BusinessEvent['type'], payload: any) {
    // FIX: Extract actorId from payload and set it as top-level userId on the event.
    const event = {
        id: `evt-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        at: new Date().toISOString(),
        userId: payload?.actorId,
        type,
        payload,
    } as BusinessEvent;
    await appendEvent(event);
    return event.id;
}