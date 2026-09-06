import type { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { createSearchRequestSchema } from '@house-tracker/shared';
import type { AppVariables } from './types.js';
import { listSearches, ownedSearch, searchNameKey } from './lib/search-store.js';

const deleteSchema = z.object({
  confirmationName: z.string(),
  expectedMembershipCount: z.number().int().nonnegative(),
  expectedOrphanCount: z.number().int().nonnegative()
});

export function searchRoutes(db: PrismaClient) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use('*', async (c, next) => {
    if (!c.get('session')) throw new HTTPException(401, { message: 'Inicia sesión para continuar.' });
    c.header('Cache-Control', 'private, no-store');
    await next();
  });
  const owner = (c: { get: (key: 'session') => AppVariables['session'] }) => c.get('session')!.user.id;

  routes.get('/searches', async (c) => c.json(await listSearches(db, owner(c))));

  routes.post('/searches', async (c) => {
    const { name } = createSearchRequestSchema.parse(await c.req.json());
    const ownerId = owner(c);
    const search = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${ownerId}:search-limit`}, 0))::text`;
      const count = await tx.search.count({ where: { ownerId } });
      if (count >= 3) throw new HTTPException(409, { message: 'Puedes tener hasta 3 búsquedas.' });
      const nameKey = searchNameKey(name);
      if (await tx.search.findUnique({ where: { ownerId_nameKey: { ownerId, nameKey } } }))
        throw new HTTPException(409, { message: 'Ya tienes una búsqueda con ese nombre.' });
      return tx.search.create({ data: { ownerId, name: name.trim(), nameKey, isPrimary: count === 0 } });
    });
    return c.json(
      {
        id: search.id,
        name: search.name,
        isPrimary: search.isPrimary,
        propertyCount: 0,
        draftCount: 0,
        statusCounts: {},
        createdAt: search.createdAt.toISOString(),
        updatedAt: search.updatedAt.toISOString()
      },
      201
    );
  });

  routes.get('/searches/:id/deletion-impact', async (c) => {
    const search = await ownedSearch(db, owner(c), c.req.param('id'));
    if (!search) throw new HTTPException(404, { message: 'Búsqueda no encontrada.' });
    const memberships = await db.searchProperty.findMany({
      where: { searchId: search.id, ownerId: owner(c) },
      select: { property: { select: { _count: { select: { searches: true } } } } }
    });
    return c.json({
      name: search.name,
      membershipCount: memberships.length,
      orphanCount: memberships.filter((item) => item.property._count.searches === 1).length
    });
  });

  routes.delete('/searches/:id', async (c) => {
    const { confirmationName, expectedMembershipCount, expectedOrphanCount } = deleteSchema.parse(await c.req.json());
    const ownerId = owner(c);
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${ownerId}:search-limit`}, 0))::text`;
      const search = await tx.search.findFirst({ where: { id: c.req.param('id'), ownerId } });
      if (!search) throw new HTTPException(404, { message: 'Búsqueda no encontrada.' });
      if (confirmationName.trim() !== search.name)
        throw new HTTPException(400, { message: 'El nombre de confirmación no coincide.' });
      const linked = await tx.searchProperty.findMany({
        where: { searchId: search.id, ownerId },
        select: { propertyId: true, property: { select: { _count: { select: { searches: true } } } } }
      });
      const orphanIds = linked
        .filter((membership) => membership.property._count.searches === 1)
        .map((membership) => membership.propertyId);
      if (linked.length !== expectedMembershipCount || orphanIds.length !== expectedOrphanCount)
        throw new HTTPException(409, {
          message: 'El contenido de la búsqueda cambió. Revisa el impacto antes de volver a confirmar.'
        });
      await tx.search.delete({ where: { id: search.id } });
      if (orphanIds.length) await tx.property.deleteMany({ where: { ownerId, id: { in: orphanIds } } });
      if (search.isPrimary) {
        const promoted = await tx.search.findFirst({ where: { ownerId }, orderBy: { createdAt: 'asc' } });
        if (promoted) {
          await tx.search.update({ where: { id: promoted.id }, data: { isPrimary: true } });
        }
      }
      return { deletedMemberships: linked.length, deletedProperties: orphanIds.length };
    });
    return c.json(result);
  });

  routes.onError((error, c) => {
    if (error instanceof z.ZodError) return c.json({ error: error.issues[0]?.message || 'Datos inválidos.' }, 400);
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    console.error('Search API error', error instanceof Error ? error.name : 'unknown');
    return c.json({ error: 'No fue posible completar la operación.' }, 500);
  });

  return routes;
}
