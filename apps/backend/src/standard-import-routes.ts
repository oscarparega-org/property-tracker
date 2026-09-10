import type { PrismaClient } from '@prisma/client';
import { Hono, type MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { canonicalizeListingUrl, importRequestSchema } from '@house-tracker/shared';
import type { AppVariables } from './types.js';
import { assertSafePublicUrl } from './lib/import-extraction.js';
import { importDebug } from './lib/import-debug.js';
import { ensurePrimarySearch, validateSearchIds } from './lib/search-store.js';

export function standardImportRoutes(db: PrismaClient) {
  const routes = new Hono<{ Variables: AppVariables }>();
  const authenticated: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
    if (!c.get('session')) throw new HTTPException(401, { message: 'Inicia sesión para continuar.' });
    c.header('Cache-Control', 'private, no-store');
    await next();
  };
  routes.use('/imports', authenticated);
  routes.use('/imports/*', authenticated);
  const owner = (c: { get: (key: 'session') => AppVariables['session'] }) => c.get('session')!.user.id;

  routes.post('/imports', async (c) => {
    const ownerId = owner(c);
    const { url, searchIds: requested } = importRequestSchema.parse(await c.req.json());
    const canonicalUrl = canonicalizeListingUrl(url);
    try {
      await assertSafePublicUrl(canonicalUrl);
    } catch {
      throw new HTTPException(400, { message: 'La URL debe apuntar a una página pública HTTP o HTTPS.' });
    }
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${ownerId}:search-limit`}, 0))::text`;
      const primary = requested?.length ? null : await ensurePrimarySearch(tx, ownerId, true);
      const searchIds = requested?.length ? requested : primary ? [primary.id] : [];
      if (!searchIds.length)
        throw new HTTPException(409, { message: 'Crea una búsqueda antes de agregar propiedades.' });
      if (!(await validateSearchIds(tx, ownerId, searchIds)))
        throw new HTTPException(404, { message: 'Una de las búsquedas no existe.' });
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${ownerId}:${canonicalUrl}`}, 0))::text`;
      const existing = await tx.property.findFirst({ where: { ownerId, sourceUrl: canonicalUrl } });
      if (existing) {
        await tx.searchProperty.createMany({
          data: searchIds.map((searchId) => ({ ownerId, searchId, propertyId: existing.id })),
          skipDuplicates: true
        });
        return { existing: true as const, propertyId: existing.id, publicationStatus: existing.publicationStatus };
      }
      const active = await tx.propertyImport.findFirst({
        where: {
          ownerId,
          canonicalUrl,
          kind: 'STANDARD',
          status: { in: ['QUEUED', 'FETCHING', 'RENDERING', 'EXTRACTING'] }
        }
      });
      if (active) {
        await tx.propertyImportTarget.createMany({
          data: searchIds.map((searchId) => ({ ownerId, importId: active.id, searchId })),
          skipDuplicates: true
        });
        return { importId: active.id, status: active.status };
      }
      const job = await tx.propertyImport.create({
        data: {
          ownerId,
          url,
          canonicalUrl,
          kind: 'STANDARD',
          targets: { create: searchIds.map((searchId) => ({ ownerId, searchId })) }
        }
      });
      importDebug(job.id, 'import.queued', { kind: job.kind, sourceHost: new URL(canonicalUrl).hostname });
      return { importId: job.id, status: job.status };
    });
    return c.json(result, 'existing' in result ? 200 : 202);
  });

  routes.get('/imports/:id', async (c) => {
    const job = await db.propertyImport.findFirst({
      where: { id: c.req.param('id'), ownerId: owner(c), kind: 'STANDARD' },
      select: { id: true, status: true, propertyId: true, errorMessage: true, retryCount: true }
    });
    if (!job) throw new HTTPException(404, { message: 'Importación no encontrada.' });
    return c.json(job);
  });
  return routes;
}
