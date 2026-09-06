import type { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { auth as defaultAuth } from './lib/auth.js';
import { loadEnvironment } from './lib/env.js';
import { prisma as defaultPrisma } from './lib/prisma.js';
import type { AppVariables } from './types.js';
import { propertyRoutes } from './property-routes.js';
import { bodyLimit } from 'hono/body-limit';
import { providerSettingsRoutes } from './provider-settings-routes.js';
import { searchRoutes } from './search-routes.js';

type AuthInstance = typeof defaultAuth;

export function createApp(auth: AuthInstance = defaultAuth, database: PrismaClient = defaultPrisma) {
  const environment = loadEnvironment();
  const app = new Hono<{ Variables: AppVariables }>();

  app.use(
    '*',
    cors({
      origin: (origin) => (environment.trustedOrigins.includes(origin) ? origin : environment.frontendUrl),
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true
    })
  );

  app.all('/api/auth/*', (context) => auth.handler(context.req.raw));

  app.use('/api/*', bodyLimit({ maxSize: 1024 * 1024 }));
  app.use('/api/*', async (context, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) {
      const origin = context.req.header('Origin');
      if (origin && !environment.trustedOrigins.includes(origin))
        throw new HTTPException(403, { message: 'Origen no permitido.' });
      if (!origin && context.req.header('Sec-Fetch-Site') === 'cross-site') throw new HTTPException(403);
    }
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    context.set('session', session);
    await next();
  });
  app.route('/api', propertyRoutes(database));
  app.route('/api', searchRoutes(database));
  app.route('/api', providerSettingsRoutes(database));

  app.get('/health', async (context) => {
    await database.$queryRaw`SELECT 1`;
    return context.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  });

  app.notFound((context) => context.json({ error: 'Not found' }, 404));
  app.onError((error, context) => {
    if (error instanceof HTTPException) return context.json({ error: error.message }, error.status);
    console.error('Unhandled request error', error);
    return context.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
