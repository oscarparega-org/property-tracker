import { describe, expect, it } from 'vitest';
import { configuredAdminBootstrap, loadEnvironment } from '../../src/lib/env.js';

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

  it('normalizes the admin email and validates the catalog schedule', () => {
    const result = loadEnvironment({
      ...valid,
      ADMIN_EMAIL: ' Admin@Example.Test ',
      CATALOG_SYNC_HOUR: '3',
      CATALOG_SYNC_TIME_ZONE: 'America/Mexico_City'
    });
    expect(result.adminEmail).toBe('admin@example.test');
    expect(result.catalogSyncHour).toBe(3);
    expect(result.catalogStaleAfterHours).toBe(36);
    expect(() => loadEnvironment({ ...valid, CATALOG_SYNC_HOUR: '25' })).toThrow(/CATALOG_SYNC_HOUR/);
    expect(() => loadEnvironment({ ...valid, CATALOG_STALE_AFTER_HOURS: '0' })).toThrow(/CATALOG_STALE/);
  });

  it('rejects multiple configured admin emails', () => {
    expect(() => loadEnvironment({ ...valid, ADMIN_EMAIL: 'one@example.test,two@example.test' })).toThrow(
      /exactly one email address/
    );
  });

  it('validates the optional initial admin bootstrap as one complete configuration', () => {
    expect(
      configuredAdminBootstrap({
        ADMIN_EMAIL: ' Admin@Example.Test ',
        ADMIN_NAME: ' Admin User ',
        ADMIN_PASSWORD: 'strong-password'
      })
    ).toEqual({ email: 'admin@example.test', name: 'Admin User', password: 'strong-password' });
    expect(() => configuredAdminBootstrap({ ADMIN_NAME: 'Admin', ADMIN_PASSWORD: 'strong-password' })).toThrow(
      /ADMIN_EMAIL/
    );
    expect(() => configuredAdminBootstrap({ ADMIN_EMAIL: 'admin@example.test', ADMIN_NAME: 'Admin' })).toThrow(
      /configured together/
    );
    expect(() =>
      configuredAdminBootstrap({
        ADMIN_EMAIL: 'admin@example.test',
        ADMIN_NAME: 'Admin',
        ADMIN_PASSWORD: 'short'
      })
    ).toThrow(/between 8 and 128/);
  });

  it('requires a strong provider encryption key in production', () => {
    expect(() => loadEnvironment({ ...valid, NODE_ENV: 'production' })).toThrow(/PROVIDER_CREDENTIAL_ENCRYPTION_KEY/);
    expect(() =>
      loadEnvironment({
        ...valid,
        NODE_ENV: 'production',
        PROVIDER_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64')
      })
    ).not.toThrow();
  });
});
