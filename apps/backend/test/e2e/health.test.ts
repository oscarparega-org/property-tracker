import { describe, expect, it } from 'vitest';

describe('database health contract', () => {
  it('requires a configured e2e database', () => {
    if (!process.env.TEST_DATABASE_URL) {
      console.warn('TEST_DATABASE_URL is not configured; database-backed auth e2e runs in CI Compose verification');
      return;
    }
    expect(process.env.TEST_DATABASE_URL).toMatch(/^postgres/);
  });
});
