import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { PrismaClient } from '@prisma/client';
import { addCatalogPropertyRequestSchema, catalogQuerySchema } from '@house-tracker/shared';
import type { AppVariables } from './types.js';
import { getCatalogProperty, listCatalog } from './lib/catalog-store.js';
import { getProperty } from './lib/property-store.js';
import { seedConfiguredAdmins } from './lib/admin.js';
import { loadEnvironment } from './lib/env.js';

export function catalogRoutes(db: PrismaClient) {
  const routes = new Hono<{ Variables: AppVariables }>();

  routes.get('/catalog/locations', async (c) =>
    c.json(
      await db.state.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          municipalities: {
            select: {
              id: true,
              name: true,
              slug: true,
              neighborhoods: { select: { id: true, name: true, slug: true }, orderBy: { name: 'asc' } }
            },
            orderBy: { name: 'asc' }
          }
        },
        orderBy: { name: 'asc' }
      })
    )
  );
  routes.get('/catalog/status', async (c) => {
    const staleBefore = new Date(Date.now() - loadEnvironment().catalogStaleAfterHours * 60 * 60_000);
    const sources = await db.catalogSource.findMany({
      where: { enabled: true },
      select: {
        id: true,
        name: true,
        lastSuccessfulSyncAt: true,
        _count: { select: { listings: { where: { status: 'ACTIVE' } } } },
        syncRuns: {
          take: 1,
          orderBy: { startedAt: 'desc' },
          select: { status: true, startedAt: true, completedAt: true, failedCount: true }
        }
      },
      orderBy: { name: 'asc' }
    });
    return c.json(
      sources.map((source) => {
        const lastRun = source.syncRuns[0] ?? null;
        const stale = !source.lastSuccessfulSyncAt || source.lastSuccessfulSyncAt < staleBefore;
        return {
          sourceId: source.id,
          name: source.name,
          healthy: !stale && lastRun?.status !== 'FAILED',
          stale,
          activeListings: source._count.listings,
          lastSuccessfulSyncAt: source.lastSuccessfulSyncAt?.toISOString() ?? null,
          lastRun: lastRun
            ? {
                ...lastRun,
                startedAt: lastRun.startedAt.toISOString(),
                completedAt: lastRun.completedAt?.toISOString() ?? null
              }
            : null
        };
      })
    );
  });
  routes.get('/catalog/properties', async (c) =>
    c.json(await listCatalog(db, catalogQuerySchema.parse(c.req.query())))
  );
  routes.get('/catalog/properties/:id', async (c) => {
    const property = await getCatalogProperty(db, c.req.param('id'));
    if (!property) throw new HTTPException(404, { message: 'Propiedad no encontrada en el catálogo.' });
    return c.json(property);
  });
  routes.get('/capabilities', async (c) => {
    const session = c.get('session');
    if (!session) return c.json({ authenticated: false, role: 'USER' as const });
    await seedConfiguredAdmins(db);
    const user = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
    return c.json({ authenticated: true, role: user?.role ?? 'USER' });
  });

  routes.post('/searches/:searchId/properties', async (c) => {
    const session = c.get('session');
    if (!session) throw new HTTPException(401, { message: 'Inicia sesión para continuar.' });
    const { propertyId } = addCatalogPropertyRequestSchema.parse(await c.req.json());
    const search = await db.search.findFirst({ where: { id: c.req.param('searchId'), ownerId: session.user.id } });
    if (!search) throw new HTTPException(404, { message: 'Búsqueda no encontrada.' });
    const property = await db.property.findFirst({
      where: { id: propertyId, catalogListing: { is: { status: 'ACTIVE' } } },
      select: { id: true }
    });
    if (!property) throw new HTTPException(409, { message: 'La propiedad ya no está disponible en el catálogo.' });
    await db.searchProperty.createMany({
      data: [{ ownerId: session.user.id, searchId: search.id, propertyId }],
      skipDuplicates: true
    });
    return c.json(await getProperty(db, propertyId, session.user.id, search.id), 201);
  });

  routes.delete('/searches/:searchId/properties/:propertyId', async (c) => {
    const session = c.get('session');
    if (!session) throw new HTTPException(401, { message: 'Inicia sesión para continuar.' });
    const result = await db.searchProperty.deleteMany({
      where: { searchId: c.req.param('searchId'), propertyId: c.req.param('propertyId'), ownerId: session.user.id }
    });
    if (!result.count) throw new HTTPException(404, { message: 'Propiedad no encontrada en esta búsqueda.' });
    return c.json({ removed: true });
  });

  return routes;
}
