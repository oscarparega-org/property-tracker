import { describe, expect, it } from 'vitest';
import { importRetryAt } from '../../src/lib/import-jobs.js';

describe('importRetryAt', () => {
  const now = new Date('2026-09-10T00:00:00.000Z');

  it('backs retries off exponentially and caps the delay', () => {
    expect(importRetryAt(1, now).toISOString()).toBe('2026-09-10T00:01:00.000Z');
    expect(importRetryAt(2, now).toISOString()).toBe('2026-09-10T00:02:00.000Z');
    expect(importRetryAt(8, now).toISOString()).toBe('2026-09-10T00:15:00.000Z');
  });
});
