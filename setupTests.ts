import '@testing-library/jest-dom/vitest';
import { vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  vi.resetAllMocks();
  vi.clearAllTimers();

  // Mock global fetch
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    })
  ) as any;
});

// Mock URL.createObjectURL and revokeObjectURL for file operations
const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

afterEach(() => {
  createObjectURLSpy.mockClear();
  revokeObjectURLSpy.mockClear();
});