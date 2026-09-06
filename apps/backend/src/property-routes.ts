import { Prisma, type PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { canonicalizeListingUrl, decisionSchema, decisionStatusRequestSchema, importRequestSchema, favoriteRequestSchema, archiveRequestSchema, propertyInputSchema } from '@template/shared';
import type { AppVariables } from './types.js';
import { applyEnhancement, buildEnhancementPreview, getProperty, listDraftProperties, listProperties } from './lib/property-store.js';
import { saveProperty } from './lib/property-editor.js';
import { assertSafePublicUrl } from './lib/import-extraction.js';
import { reserveWrite } from './lib/write-limits.js';
import { enabledProviderCredential } from './lib/provider-credentials.js';
import { importDebug } from './lib/import-debug.js';

export function propertyRoutes(db: PrismaClient) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use('*', async (c, next) => {
    if (!c.get('session')) throw new HTTPException(401, { message: 'Inicia sesión para continuar.' });
    c.header('Cache-Control', 'private, no-store');
    await next();
  });
  const owner = (c: { get: (key: 'session') => AppVariables['session'] }) => c.get('session')!.user.id;
  async function owned(id: string, ownerId: string) {
    const property = await getProperty(db, id, ownerId);
    if (!property) throw new HTTPException(404, { message: 'Propiedad no encontrada.' });
    return property;
  }
  routes.get('/properties', async c => {
    const status = z.enum(['PUBLISHED', 'DRAFT']).parse(c.req.query('publicationStatus') || 'PUBLISHED');
    return c.json(await (status === 'DRAFT' ? listDraftProperties(db, owner(c)) : listProperties(db, owner(c))));
  });
  async function enhancementCapability(ownerId: string) {
    const [firecrawl, openai] = await Promise.all([
      enabledProviderCredential(db, ownerId, 'FIRECRAWL'),
      enabledProviderCredential(db, ownerId, 'OPENAI'),
    ]);
    if (!firecrawl || !openai?.model) return { available: false, reason: 'Activa credenciales válidas de Firecrawl y OpenAI para usar la mejora profunda.' };
    return { available: true, reason: null };
  }
  routes.get('/properties/:id/enhancement-capability', async c => {
    await owned(c.req.param('id'), owner(c));
    return c.json(await enhancementCapability(owner(c)));
  });
  routes.post('/properties/:id/enhancements', async c => {
    const property = await owned(c.req.param('id'), owner(c));
    if (!property.sourceUrl) throw new HTTPException(400, { message: 'Esta propiedad no tiene una URL de origen.' });
    const capability = await enhancementCapability(owner(c));
    if (!capability.available) throw new HTTPException(409, { message: capability.reason! });
    try { await assertSafePublicUrl(property.sourceUrl); } catch { throw new HTTPException(400, { message: 'La URL de origen ya no es una página pública válida.' }); }
    const result = await db.$transaction(async tx => {
      const lock = `${owner(c)}:enhancement:${property.id}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))::text`;
      const active = await tx.propertyImport.findFirst({ where: { ownerId: owner(c), propertyId: property.id, kind: 'ENHANCEMENT', status: { in: ['QUEUED', 'FETCHING', 'RENDERING', 'EXTRACTING'] } } });
      if (active) { importDebug(active.id, 'enhancement.queue.reused', { propertyId: property.id }); return active; }
      await reserveWrite(tx, owner(c), c.req.raw.headers, 'deep-enhancement', 3, 15);
      const job = await tx.propertyImport.create({ data: { ownerId: owner(c), propertyId: property.id, url: property.sourceUrl!, canonicalUrl: canonicalizeListingUrl(property.sourceUrl!), kind: 'ENHANCEMENT' } });
      importDebug(job.id, 'enhancement.queued', { propertyId: property.id, sourceHost: new URL(job.canonicalUrl).hostname });
      return job;
    });
    return c.json({ importId: result.id, status: result.status }, 202);
  });
  routes.get('/enhancements/:id', async c => {
    const job = await db.propertyImport.findFirst({ where: { id: c.req.param('id'), ownerId: owner(c), kind: 'ENHANCEMENT' } });
    if (!job || !job.propertyId) throw new HTTPException(404, { message: 'Mejora no encontrada.' });
    if (job.status !== 'READY' || !job.draftData) throw new HTTPException(409, { message: job.errorMessage ?? 'La mejora todavía no está lista.' });
    const property = await owned(job.propertyId, owner(c));
    return c.json(buildEnhancementPreview(property, propertyInputSchema.parse(job.draftData), job.id));
  });
  routes.post('/enhancements/:id/apply', async c => {
    const job = await db.propertyImport.findFirst({ where: { id: c.req.param('id'), ownerId: owner(c), kind: 'ENHANCEMENT', status: 'READY' } });
    if (!job?.propertyId || !job.draftData) throw new HTTPException(404, { message: 'Mejora lista no encontrada.' });
    await owned(job.propertyId, owner(c));
    const candidate = propertyInputSchema.parse(job.draftData);
    const current = await owned(job.propertyId, owner(c));
    const preview = buildEnhancementPreview(current, candidate, job.id);
    const result = await applyEnhancement(db, job.propertyId, owner(c), candidate);
    importDebug(job.id, 'enhancement.applied', { propertyId: job.propertyId, scalarChanges: preview.changes.length, addedImages: preview.addedImages.length, addedFeatures: preview.addedFeatures.length });
    return c.json(result);
  });
  routes.get('/properties/:id', async c => c.json(await owned(c.req.param('id'), owner(c))));
  routes.post('/properties', async c => {
    await reserveWrite(db, owner(c), c.req.raw.headers, 'manual-create', 10, 50);
    return c.json(await saveProperty(db, owner(c), await c.req.formData()), 201);
  });
  routes.put('/properties/:id', async c => {
    const property = await owned(c.req.param('id'), owner(c));
    if (property.publicationStatus === 'DRAFT') await reserveWrite(db, owner(c), c.req.raw.headers, 'draft-update', 15, 75);
    return c.json(await saveProperty(db, owner(c), await c.req.formData(), property.id));
  });
  routes.patch('/properties/:id/decision', async c => {
    const id = c.req.param('id');
    await owned(id, owner(c));
    const form = await c.req.formData();
    const { id: _id, ...data } = decisionSchema.parse({ ...Object.fromEntries(form), id });
    void _id;
    await db.property.update({ where: { id, ownerId: owner(c) }, data: { ...data, isFavorite: form.get('isFavorite') === 'on', archivedAt: form.get('archived') === 'on' ? new Date() : null } });
    return c.json(await owned(id, owner(c)));
  });
  routes.patch('/properties/:id/status', async c => {
    const id = c.req.param('id');
    await owned(id, owner(c));
    const data = decisionStatusRequestSchema.parse(await c.req.json());
    await db.property.update({ where: { id, ownerId: owner(c) }, data });
    return c.json(await owned(id, owner(c)));
  });
  routes.patch('/properties/:id/favorite', async c => {
    const id = c.req.param('id');
    await owned(id, owner(c));
    const data = favoriteRequestSchema.parse(await c.req.json());
    await db.property.update({ where: { id, ownerId: owner(c) }, data });
    return c.json(await owned(id, owner(c)));
  });
  routes.patch('/properties/:id/archive', async c => {
    const id = c.req.param('id');
    await owned(id, owner(c));
    const { archived } = archiveRequestSchema.parse(await c.req.json());
    await db.property.update({ where: { id, ownerId: owner(c) }, data: { archivedAt: archived ? new Date() : null } });
    return c.json(await owned(id, owner(c)));
  });
  routes.post('/imports', async c => {
    const { url } = importRequestSchema.parse(await c.req.json());
    const canonicalUrl = canonicalizeListingUrl(url);
    try { await assertSafePublicUrl(canonicalUrl); } catch { throw new HTTPException(400, { message: 'La URL debe apuntar a una página pública HTTP o HTTPS.' }); }
    // Serialize duplicate checks per account and URL. Never reuse another user's job.
    const result = await db.$transaction(async tx => {
      const lock = `${owner(c)}:${canonicalUrl}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))::text`;
      const existing = await tx.property.findFirst({ where: { ownerId: owner(c), sourceUrl: canonicalUrl } });
      if (existing) return { existing: true as const, propertyId: existing.id, publicationStatus: existing.publicationStatus };
      const active = await tx.propertyImport.findFirst({ where: { ownerId: owner(c), canonicalUrl, status: { in: ['QUEUED', 'FETCHING', 'RENDERING', 'EXTRACTING'] } } });
      if (active) { importDebug(active.id, 'import.queue.reused', { sourceHost: new URL(canonicalUrl).hostname }); return { importId: active.id, status: active.status }; }
      await reserveWrite(tx, owner(c), c.req.raw.headers, 'url-import', 5, 25);
      const job = await tx.propertyImport.create({ data: { ownerId: owner(c), url, canonicalUrl } });
      importDebug(job.id, 'import.queued', { kind: job.kind, sourceHost: new URL(canonicalUrl).hostname });
      return { importId: job.id, status: job.status };
    });
    return c.json(result, 'existing' in result ? 200 : 202);
  });
  routes.get('/imports/:id', async c => {
    const job = await db.propertyImport.findFirst({ where: { id: c.req.param('id'), ownerId: owner(c) }, select: { id: true, kind: true, status: true, propertyId: true, errorMessage: true, retryCount: true } });
    if (!job) throw new HTTPException(404, { message: 'Importación no encontrada.' });
    return c.json(job);
  });
  routes.onError((error, c) => {
    if (error instanceof SyntaxError) return c.json({ error: 'El cuerpo de la solicitud no es válido.' }, 400);
    if (error instanceof z.ZodError) return c.json({ error: error.issues[0]?.message || 'Datos inválidos.' }, 400);
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') return c.json({ error: 'Esta propiedad ya existe en tu colección.' }, 409);
      if (error.code === 'P2025') return c.json({ error: 'Propiedad no encontrada.' }, 404);
    }
    console.error('Property API error', error instanceof Error ? error.name : 'unknown');
    return c.json({ error: 'No fue posible completar la operación.' }, 500);
  });
  return routes;
}
