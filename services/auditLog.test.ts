// services/auditLog.test.ts
// FIX: Add imports for vitest globals
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
    appendAuditEventChunked,
    readAuditIndex,
    writeAuditIndex,
    loadEventItems,
    saveEventItemsChunks,
    rollbackAuditItems,
    purgeAuditItems,
    ImportAuditItem,
    AuditEventHeader,
    AUDIT_INDEX_KEY,
    AUDIT_CHUNK_PREFIX
} from './auditLog';
import * as storage from './storage';

vi.mock('./storage', () => ({
  loadJSON: vi.fn(),
  saveJSON: vi.fn(),
  removeKey: vi.fn(),
}));

const mockedStorage = vi.mocked(storage);

// Mocking compression streams because they are not available in node env by default
const mockCompressionStream = {
    writable: {
        getWriter: () => ({
            write: vi.fn(),
            close: vi.fn(),
        }),
    },
    readable: {},
};
// FIX: Replaced `global` with `globalThis` for cross-environment compatibility.
if (typeof (globalThis as any).CompressionStream === 'undefined') {
    (globalThis as any).CompressionStream = vi.fn().mockImplementation(() => mockCompressionStream) as any;
}
if (typeof (globalThis as any).DecompressionStream === 'undefined') {
    (globalThis as any).DecompressionStream = vi.fn() as any;
}


describe('auditLog', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockedStorage.loadJSON.mockResolvedValue([]);
    mockedStorage.saveJSON.mockResolvedValue(undefined);
    mockedStorage.removeKey.mockResolvedValue(undefined);
  });

  describe('Index Management', () => {
    it('readAuditIndex should return an empty array if nothing is stored', async () => {
      mockedStorage.loadJSON.mockResolvedValue(null);
      const index = await readAuditIndex();
      expect(index).toEqual([]);
    });

    it('writeAuditIndex should save the index', async () => {
      const index: AuditEventHeader[] = [{ id: 'evt-1', at: '2024-01-01', sourceMeta: {}, itemCount: 1, chunk: { keys: [], compression: 'none', totalChars: 0 } }];
      await writeAuditIndex(index);
      expect(mockedStorage.saveJSON).toHaveBeenCalledWith(AUDIT_INDEX_KEY, index);
    });
  });

  describe('Chunking and Compression', () => {
    it('saveEventItemsChunks should save items into chunks without compression if stream is unavailable', async () => {
        const items: ImportAuditItem[] = [{ storageKey: 'key', key: 'key', action: 'insert' }];
        const header: AuditEventHeader = { id: 'evt-test', at: '2024-01-01', sourceMeta: {}, itemCount: 0, chunk: { keys: [], compression: 'none', totalChars: 0 } };

        // Mock compression to be 'none' to simplify test
        vi.spyOn(globalThis, 'CompressionStream', 'get').mockReturnValue(undefined as any);

        await saveEventItemsChunks(header, items);
        
        expect(mockedStorage.saveJSON).toHaveBeenCalled();
        const call = mockedStorage.saveJSON.mock.calls[0];
        expect(call[0]).toContain(`${AUDIT_CHUNK_PREFIX}evt-test:0`);
        expect(call[1]).toBe(JSON.stringify(items));
        expect(header.chunk.keys.length).toBe(1);
        expect(header.chunk.compression).toBe('none');
    });

    it('loadEventItems should reconstruct items from chunks', async () => {
        const items: ImportAuditItem[] = [{ storageKey: 'key', key: 'key', action: 'insert' }];
        const header: AuditEventHeader = { 
            id: 'evt-test', 
            at: '2024-01-01', 
            sourceMeta: {}, 
            itemCount: 1, 
            chunk: { keys: [`${AUDIT_CHUNK_PREFIX}evt-test:0`], compression: 'none', totalChars: 100 } 
        };
        
        mockedStorage.loadJSON.mockResolvedValue(JSON.stringify(items));

        const loadedItems = await loadEventItems(header);

        expect(mockedStorage.loadJSON).toHaveBeenCalledWith(`${AUDIT_CHUNK_PREFIX}evt-test:0`, null, true);
        expect(loadedItems).toEqual(items);
    });
  });

  describe('Main Logic', () => {
    it('appendAuditEventChunked should create header, save chunks, and update index', async () => {
        const items: ImportAuditItem[] = Array(5).fill({ storageKey: 'key', key: 'key', action: 'insert' });
        const event = { id: 'evt-new', at: new Date().toISOString(), sourceMeta: { file: 'test.json' }, items };
        
        vi.spyOn(globalThis, 'CompressionStream', 'get').mockReturnValue(undefined as any);
        mockedStorage.loadJSON.mockResolvedValue([]); // For reading the index

        await appendAuditEventChunked(event);

        // 1. Saved chunk
        expect(mockedStorage.saveJSON).toHaveBeenCalledWith(
            expect.stringContaining(`${AUDIT_CHUNK_PREFIX}evt-new:0`),
            JSON.stringify(items),
            true
        );

        // 2. Updated index
        const indexCall = mockedStorage.saveJSON.mock.calls.find(c => c[0] === AUDIT_INDEX_KEY);
        expect(indexCall).toBeDefined();
        const newIndex = indexCall![1] as AuditEventHeader[];
        expect(newIndex.length).toBe(1);
        expect(newIndex[0].id).toBe('evt-new');
        expect(newIndex[0].itemCount).toBe(5);
    });
  });

  describe('Rollback and Purge', () => {
    it('rollbackAuditItems should restore previous state', async () => {
        const itemsToRollback: ImportAuditItem[] = [
            { // Item to be updated back to its 'before' state
                storageKey: 'vehicles',
                key: 'vehicles',
                idField: 'id',
                idValue: 'veh-1',
                action: 'update',
                beforeExists: true,
                beforeSnapshot: { id: 'veh-1', brand: 'Lada' },
                afterSnapshot: { id: 'veh-1', brand: 'VAZ' },
            },
            { // Item to be deleted because it was newly inserted
                storageKey: 'vehicles',
                key: 'vehicles',
                idField: 'id',
                idValue: 'veh-2',
                action: 'insert',
                beforeExists: false,
                afterSnapshot: { id: 'veh-2', brand: 'Moskvich' },
            },
        ];

        const initialDbState = [
            { id: 'veh-1', brand: 'VAZ' },
            { id: 'veh-2', brand: 'Moskvich' },
        ];
        mockedStorage.loadJSON.mockResolvedValue(initialDbState);

        await rollbackAuditItems(itemsToRollback);

        expect(mockedStorage.saveJSON).toHaveBeenCalledOnce();
        const finalDbState = mockedStorage.saveJSON.mock.calls[0][1] as any[];
        
        expect(finalDbState.length).toBe(1);
        expect(finalDbState[0]).toEqual({ id: 'veh-1', brand: 'Lada' });
    });

    it('purgeAuditItems should remove items from storage', async () => {
        const itemsToPurge: ImportAuditItem[] = [
            { storageKey: 'vehicles', key: 'vehicles', idField: 'id', idValue: 'veh-2', action: 'insert' }
        ];

        const initialDbState = [
            { id: 'veh-1', brand: 'Lada' },
            { id: 'veh-2', brand: 'VAZ' },
        ];
        mockedStorage.loadJSON.mockResolvedValue(initialDbState);

        await purgeAuditItems(itemsToPurge);

        expect(mockedStorage.saveJSON).toHaveBeenCalledOnce();
        const finalDbState = mockedStorage.saveJSON.mock.calls[0][1] as any[];
        
        expect(finalDbState.length).toBe(1);
        expect(finalDbState[0].id).toBe('veh-1');
    });
  });
});