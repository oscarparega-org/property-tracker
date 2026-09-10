import { Prisma, type PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { canonicalizeListingUrl, importRequestSchema } from '@house-tracker/shared';
import type { AppVariables } from './types.js';
import { requireAdmin } from './lib/admin.js';
import { assertSafePublicUrl } from './lib/import-extraction.js';
import { importDebug } from './lib/import-debug.js';
import { saveProperty } from './lib/property-editor.js';
import { getProperty } from './lib/property-store.js';

export function adminCatalogRoutes(db: PrismaClient) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use('/admin/catalog/*', async (c, next) => {
    const session = c.get('session');
    if (!session) throw new HTTPException(401, { message: 'Inicia sesión para continuar.' });
    c.header('Cache-Control', 'private, no-store');
    await requireAdmin(db, session.user.id);
    await next();
  });
  const owner = (c: { get: (key: 'session') => AppVariables['session'] }) => c.get('session')!.user.id;

  routes.post('/admin/catalog/imports', async (c) => {
    const { url } = importRequestSchema.pick({ url: true }).parse(await c.req.json());
    const canonicalUrl = canonicalizeListingUrl(url);
    try {
      await assertSafePublicUrl(canonicalUrl);
    } catch {
      throw new HTTPException(400, { message: 'La URL debe apuntar a una página pública HTTP o HTTPS.' });
    }
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`catalog:${canonicalUrl}`}, 0))::text`;
      const active = await tx.propertyImport.findFirst({
        where: {
          ownerId: owner(c),
          canonicalUrl,
          kind: 'CATALOG',
          status: { in: ['QUEUED', 'FETCHING', 'RENDERING', 'EXTRACTING'] }
        }
      });
      if (active) return { importId: active.id, status: active.status };
      const job = await tx.propertyImport.create({
        data: { ownerId: owner(c), url, canonicalUrl, kind: 'CATALOG' }
      });
      importDebug(job.id, 'import.queued', { kind: job.kind, sourceHost: new URL(canonicalUrl).hostname });
      return { importId: job.id, status: job.status };
    });
    return c.json(result, 202);
  });

  routes.get('/admin/catalog/imports/:id', async (c) => {
    const job = await db.propertyImport.findFirst({
      where: { id: c.req.param('id'), ownerId: owner(c), kind: 'CATALOG' },
      select: { id: true, kind: true, status: true, propertyId: true, errorMessage: true, retryCount: true }
    });
    if (!job) throw new HTTPException(404, { message: 'Importación no encontrada.' });
    return c.json(job);
  });

  routes.get('/admin/catalog/properties/:id', async (c) => {
    const listing = await db.catalogListing.findUnique({ where: { propertyId: c.req.param('id') } });
    if (!listing) throw new HTTPException(404, { message: 'Propiedad de catálogo no encontrada.' });
    const property = await getProperty(db, listing.propertyId, null);
    if (!property) throw new HTTPException(404, { message: 'Propiedad de catálogo no encontrada.' });
    return c.json(property);
  });

  routes.put('/admin/catalog/properties/:id', async (c) => {
    const listing = await db.catalogListing.findUnique({ where: { propertyId: c.req.param('id') } });
    if (!listing) throw new HTTPException(404, { message: 'Propiedad de catálogo no encontrada.' });
    const form = await c.req.formData();
    const property = await db.$transaction(async (tx) => {
      const saved = await saveProperty(tx, null, form, listing.propertyId);
      await tx.catalogListing.update({
        where: { propertyId: listing.propertyId },
        data: { status: saved.publicationStatus === 'PUBLISHED' ? 'ACTIVE' : 'DRAFT' }
      });
      return getProperty(tx, listing.propertyId, null);
    });
    return c.json(property);
  });

  routes.onError((error, c) => {
    if (error instanceof SyntaxError) return c.json({ error: 'El cuerpo de la solicitud no es válido.' }, 400);
    if (error instanceof z.ZodError) return c.json({ error: error.issues[0]?.message || 'Datos inválidos.' }, 400);
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
      return c.json({ error: 'Propiedad no encontrada.' }, 404);
    console.error('Admin catalog API error', error instanceof Error ? error.name : 'unknown');
    return c.json({ error: 'No fue posible completar la operación.' }, 500);
  });
  return routes;
}
