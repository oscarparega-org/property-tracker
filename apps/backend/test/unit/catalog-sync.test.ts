import { describe, expect, it } from 'vitest';
import { catalogRunRetryable, catalogScheduleState, sourceVersionUnchanged } from '../../src/lib/catalog-sync.js';

describe('catalog schedule', () => {
  it('uses the configured Mexico City calendar and becomes due at 03:00', () => {
    expect(catalogScheduleState(new Date('2026-09-09T08:59:00.000Z'), 'America/Mexico_City', 3)).toEqual({
      date: '2026-09-09',
      due: false
    });
    expect(catalogScheduleState(new Date('2026-09-09T09:00:00.000Z'), 'America/Mexico_City', 3)).toEqual({
      date: '2026-09-09',
      due: true
    });
  });

  it('retries a stale failed or interrupted run only once', () => {
    const now = new Date('2026-09-09T12:30:00.000Z');
    const stale = {
      status: 'FAILED',
      retryCount: 0,
      startedAt: new Date('2026-09-09T12:00:00.000Z'),
      completedAt: new Date('2026-09-09T12:10:00.000Z')
    };
    expect(catalogRunRetryable(stale, now)).toBe(true);
    expect(catalogRunRetryable({ ...stale, status: 'RUNNING', completedAt: null }, now)).toBe(true);
    expect(catalogRunRetryable({ ...stale, retryCount: 1 }, now)).toBe(false);
    expect(catalogRunRetryable({ ...stale, completedAt: new Date('2026-09-09T12:20:00.000Z') }, now)).toBe(false);
  });

  it('refreshes listings when the source provides no modification date', () => {
    const date = new Date('2026-09-09T00:00:00.000Z');
    expect(sourceVersionUnchanged(date, date)).toBe(true);
    expect(sourceVersionUnchanged(null, null)).toBe(false);
    expect(sourceVersionUnchanged(date, null)).toBe(false);
  });
});
