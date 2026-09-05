import { describe, expect, it } from 'vitest';
import type { HealthResponse } from './index.js';

describe('shared contracts', () => {
  it('represents a healthy response', () => {
    const value: HealthResponse = {
      status: 'ok',
      database: 'connected',
      timestamp: new Date(0).toISOString()
    };
    expect(value.status).toBe('ok');
  });
});
