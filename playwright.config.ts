import { defineConfig } from '@playwright/test';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database ending in _test.');

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 90_000,
  use: { baseURL: 'http://localhost:5179', channel: process.env.PLAYWRIGHT_CHANNEL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node_modules/.bin/tsx apps/backend/test/browser-server.ts', url: 'http://localhost:3000/health', reuseExistingServer: false,
      env: { DATABASE_URL: databaseUrl, FRONTEND_URL: 'http://localhost:5179', TRUSTED_ORIGINS: 'http://localhost:5179', BETTER_AUTH_URL: 'http://localhost:3000', BETTER_AUTH_SECRET: 'browser-test-secret-with-at-least-32-characters', PROVIDER_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64') } },
    { command: 'npm exec --workspace=template-frontend -- next start --port 5179', url: 'http://localhost:5179/sign-in', reuseExistingServer: false },
  ],
});
