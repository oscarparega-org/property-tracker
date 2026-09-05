import type { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { auth as defaultAuth } from './lib/auth.js';
import { loadEnvironment } from './lib/env.js';
import { prisma as defaultPrisma } from './lib/prisma.js';
import type { AppVariables } from './types.js';

type AuthInstance = typeof defaultAuth;

export function createApp(auth: AuthInstance = defaultAuth, database: PrismaClient = defaultPrisma) {
  const environment = loadEnvironment();
  const app = new Hono<{ Variables: AppVariables }>();

  app.use('*', cors({
    origin: (origin) => environment.trustedOrigins.includes(origin) ? origin : environment.frontendUrl,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
  }));

  app.all('/api/auth/*', (context) => auth.handler(context.req.raw));

  app.get('/health', async (context) => {
    await database.$queryRaw`SELECT 1`;
    return context.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  });

  app.use('/api/protected', async (context, next) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    context.set('session', session);
    if (!session) throw new HTTPException(401, { message: 'Authentication required' });
    await next();
  });

  app.get('/api/protected', (context) => {
    const session = context.get('session');
    if (!session) throw new HTTPException(401);
    return context.json({
      message: `Welcome, ${session.user.name}`,
      user: { id: session.user.id, name: session.user.name, email: session.user.email }
    });
  });

  app.notFound((context) => context.json({ error: 'Not found' }, 404));
  app.onError((error, context) => {
    if (error instanceof HTTPException) return context.json({ error: error.message }, error.status);
    console.error('Unhandled request error', error);
    return context.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
