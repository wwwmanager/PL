// src/tests/smoke.test.ts
// FIX: Add imports for vitest globals
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('works', () => {
    expect(1 + 1).toBe(2);
  });
});
