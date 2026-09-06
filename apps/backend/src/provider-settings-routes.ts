import type { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { integrationProviderSchema, providerSettingsUpdateSchema } from '@house-tracker/shared';
import type { AppVariables } from './types.js';
import {
  deleteProviderCredential,
  listProviderSettings,
  ProviderCredentialError,
  testStoredProviderCredential,
  updateProviderSettings
} from './lib/provider-credentials.js';

export function providerSettingsRoutes(db: PrismaClient) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use('*', async (c, next) => {
    if (!c.get('session')) throw new HTTPException(401, { message: 'Inicia sesión para continuar.' });
    c.header('Cache-Control', 'private, no-store');
    await next();
  });
  const owner = (c: { get: (key: 'session') => AppVariables['session'] }) => c.get('session')!.user.id;
  const provider = (value: string) => integrationProviderSchema.parse(value.toUpperCase());

  routes.get('/settings/providers', async (c) => c.json(await listProviderSettings(db, owner(c))));
  routes.put('/settings/providers/:provider', async (c) => {
    return c.json(
      await updateProviderSettings(
        db,
        owner(c),
        provider(c.req.param('provider')),
        providerSettingsUpdateSchema.parse(await c.req.json())
      )
    );
  });
  routes.post('/settings/providers/:provider/test', async (c) => {
    return c.json(await testStoredProviderCredential(db, owner(c), provider(c.req.param('provider'))));
  });
  routes.delete('/settings/providers/:provider/credential', async (c) => {
    return c.json(await deleteProviderCredential(db, owner(c), provider(c.req.param('provider'))));
  });
  routes.onError((error, c) => {
    if (error instanceof ProviderCredentialError) {
      const code = error.kind === 'UNAVAILABLE' ? 502 : 400;
      return c.json({ error: error.message }, code);
    }
    throw error;
  });
  return routes;
}
