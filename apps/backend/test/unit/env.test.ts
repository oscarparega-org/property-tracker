import { describe, expect, it } from 'vitest';
import { loadEnvironment } from '../../src/lib/env.js';

const valid = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/app',
  FRONTEND_URL: 'https://web.example.test',
  BETTER_AUTH_URL: 'https://api.example.test',
  BETTER_AUTH_SECRET: 'a-secure-test-secret-with-32-characters'
};

describe('loadEnvironment', () => {
  it('loads and deduplicates trusted origins', () => {
    const result = loadEnvironment({ ...valid, TRUSTED_ORIGINS: 'https://web.example.test, https://web.example.test' });
    expect(result.trustedOrigins).toEqual(['https://web.example.test']);
  });

  it('rejects a short auth secret', () => {
    expect(() => loadEnvironment({ ...valid, BETTER_AUTH_SECRET: 'short' })).toThrow(/32 characters/);
  });

  it('requires a database URL', () => {
    expect(() => loadEnvironment({ ...valid, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });
});
