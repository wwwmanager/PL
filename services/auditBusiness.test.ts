// services/auditBusiness.test.ts
// FIX: Add imports for vitest globals
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appendEvent, getEvents, auditBusiness, BusinessEvent } from './auditBusiness';
import * as storage from './storage';

vi.mock('./storage', () => ({
  loadJSON: vi.fn(),
  saveJSON: vi.fn(),
}));

const mockedStorage = vi.mocked(storage);

describe('auditBusiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Сбрасываем кэш внутри модуля, если он используется
    vi.resetModules();
  });

  it('appendEvent should add a new event to the beginning of the log', async () => {
    const existingEvents: BusinessEvent[] = [
      { id: 'evt-1', at: '2024-01-01T12:00:00Z', type: 'waybill.created', payload: { waybillId: 'wb-1' } }
    ];
    mockedStorage.loadJSON.mockResolvedValue(existingEvents);

    const newEvent: BusinessEvent = { id: 'evt-2', at: '2024-01-02T12:00:00Z', type: 'waybill.posted', payload: { waybillId: 'wb-1' } };
    
    // Перезагружаем модуль, чтобы кэш был чист
    const { appendEvent } = await import('./auditBusiness');
    await appendEvent(newEvent);

    expect(mockedStorage.saveJSON).toHaveBeenCalledWith('businessAudit_v1', [
      newEvent,
      ...existingEvents
    ]);
  });

  it('getEvents should retrieve the event log from storage', async () => {
    const events: BusinessEvent[] = [
      { id: 'evt-1', at: '2024-01-01T12:00:00Z', type: 'waybill.created', payload: { waybillId: 'wb-1' } }
    ];
    mockedStorage.loadJSON.mockResolvedValue(events);
    const { getEvents } = await import('./auditBusiness');

    const result = await getEvents();

    expect(mockedStorage.loadJSON).toHaveBeenCalledWith('businessAudit_v1', []);
    expect(result).toEqual(events);
  });

  it('auditBusiness should create and append a correctly structured event', async () => {
    mockedStorage.loadJSON.mockResolvedValue([]);
    const payload = { waybillId: 'wb-3', reason: 'test reason' };
    const actorId = 'user-123';
    
    const { auditBusiness } = await import('./auditBusiness');
    await auditBusiness('waybill.corrected', { ...payload, actorId });

    expect(mockedStorage.saveJSON).toHaveBeenCalledOnce();
    const savedEvents = mockedStorage.saveJSON.mock.calls[0][1] as BusinessEvent[];
    expect(savedEvents.length).toBe(1);
    const savedEvent = savedEvents[0];

    expect(savedEvent.type).toBe('waybill.corrected');
    expect(savedEvent.userId).toBe(actorId);
    expect(savedEvent.payload).toEqual({ ...payload, actorId });
    expect(savedEvent.id).toBeDefined();
    expect(savedEvent.at).toBeDefined();
  });
});