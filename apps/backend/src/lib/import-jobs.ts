import type { Prisma, PrismaClient } from '@prisma/client';
import { extractProperty, ListingValidationError } from './import-extraction.js';
import { upsertProperty } from './property-store.js';
import { enabledProviderCredential, markProviderCredentialInvalid } from './provider-credentials.js';
import { importDebug } from './import-debug.js';
import { resolveImportProvider } from './import-providers/registry.js';

export async function processImportJob(db: PrismaClient, id: string, extract = extractProperty) {
  const startedAt = Date.now();
  const claimed = await db.propertyImport.updateMany({
    where: { id, status: 'QUEUED' },
    data: { status: 'FETCHING', processingStartedAt: new Date(), errorMessage: null }
  });
  if (!claimed.count) {
    importDebug(id, 'worker.claim.skipped', { reason: 'not-queued' });
    return false;
  }
  const job = await db.propertyImport.findUniqueOrThrow({ where: { id } });
  importDebug(id, 'worker.claimed', {
    kind: job.kind,
    attempt: job.retryCount + 1,
    sourceHost: new URL(job.canonicalUrl).hostname
  });
  const requiresRenderedFetch = resolveImportProvider(new URL(job.canonicalUrl)).requiresRenderedFetch === true;
  const [firecrawl, openai] = await Promise.all([
    job.kind === 'ENHANCEMENT' || requiresRenderedFetch
      ? enabledProviderCredential(db, job.ownerId, 'FIRECRAWL')
      : Promise.resolve(null),
    enabledProviderCredential(db, job.ownerId, 'OPENAI')
  ]);
  const heartbeat = setInterval(() => {
    void db.propertyImport
      .updateMany({
        where: { id, status: { in: ['FETCHING', 'RENDERING', 'EXTRACTING'] } },
        data: { processingStartedAt: new Date() }
      })
      .catch(() => undefined);
  }, 30_000);
  try {
    importDebug(id, 'providers.resolved', {
      openaiEnabled: Boolean(openai?.model),
      openaiModel: openai?.model ?? null,
      firecrawlEnabled: Boolean(firecrawl)
    });
    if (job.kind === 'ENHANCEMENT' && (!firecrawl || !openai?.model))
      throw new ListingValidationError('La mejora requiere Firecrawl y OpenAI activos. Revisa tus integraciones.');
    if (job.kind === 'ENHANCEMENT') {
      await db.propertyImport.update({ where: { id }, data: { status: 'RENDERING' } });
    }
    const result = await extract(job.canonicalUrl, {
      mode: job.kind === 'ENHANCEMENT' ? 'DEEP' : 'STANDARD',
      debug: (stage, details = {}) => importDebug(id, stage, details),
      ...(firecrawl
        ? {
            firecrawl: {
              credential: firecrawl.credential,
              onInvalidCredential: () => markProviderCredentialInvalid(db, firecrawl.settingId)
            }
          }
        : {}),
      ...(openai?.model
        ? {
            openai: {
              credential: openai.credential,
              model: openai.model,
              onInvalidCredential: () => markProviderCredentialInvalid(db, openai.settingId)
            }
          }
        : {})
    });
    await db.propertyImport.update({ where: { id }, data: { status: 'EXTRACTING' } });
    importDebug(id, 'extraction.completed', {
      strategy: result.strategy,
      provider: result.provider,
      firecrawlCredits: result.firecrawlCredits,
      imageCount: result.input.images.length,
      featureCount: result.input.features.length,
      hasPrice: result.input.property.price.amount !== null,
      hasLocation: Boolean(result.input.property.address.formatted || result.input.property.coordinates)
    });
    await db.$transaction(async (tx) => {
      const stored =
        job.kind === 'ENHANCEMENT'
          ? { property: await tx.property.findFirstOrThrow({ where: { id: job.propertyId!, ownerId: job.ownerId } }) }
          : await upsertProperty(tx, result.input, job.ownerId);
      await tx.propertyImport.update({
        where: { id, ownerId: job.ownerId },
        data: {
          status: 'READY',
          propertyId: stored.property.id,
          draftData: result.input as unknown as Prisma.InputJsonValue,
          evidence: result.evidence as Prisma.InputJsonValue,
          strategy: result.strategy,
          provider: result.provider,
          firecrawlCredits: result.firecrawlCredits,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          completedAt: new Date(),
          processingStartedAt: null
        }
      });
      importDebug(id, job.kind === 'ENHANCEMENT' ? 'preview.saved' : 'draft.saved', {
        propertyId: stored.property.id,
        durationMs: Date.now() - startedAt
      });
    });
    importDebug(id, 'worker.completed', { status: 'READY', durationMs: Date.now() - startedAt });
    return true;
  } catch (error) {
    if (error instanceof ListingValidationError) {
      await db.propertyImport.update({
        where: { id },
        data: {
          retryCount: { increment: 1 },
          status: 'FAILED',
          processingStartedAt: null,
          completedAt: new Date(),
          errorMessage: error.message
        }
      });
      importDebug(id, 'worker.failed', { status: 'FAILED', terminal: true, attempt: job.retryCount + 1, error });
      return false;
    }
    const retryCount = job.retryCount + 1;
    await db.propertyImport.update({
      where: { id },
      data: {
        retryCount,
        status: retryCount < 3 ? 'QUEUED' : 'FAILED',
        processingStartedAt: null,
        completedAt: retryCount < 3 ? null : new Date(),
        errorMessage:
          retryCount < 3
            ? 'No pudimos leer la publicación. Reintentando…'
            : 'No fue posible extraer la publicación. Comprueba la URL o usa captura manual.'
      }
    });
    importDebug(id, retryCount < 3 ? 'worker.retry.queued' : 'worker.failed', {
      status: retryCount < 3 ? 'QUEUED' : 'FAILED',
      terminal: retryCount >= 3,
      attempt: retryCount,
      error
    });
    return false;
  } finally {
    clearInterval(heartbeat);
  }
}

export async function recoverStaleImports(db: PrismaClient) {
  const stale = await db.propertyImport.findMany({
    where: {
      status: { in: ['FETCHING', 'RENDERING', 'EXTRACTING'] },
      processingStartedAt: { lt: new Date(Date.now() - 5 * 60_000) }
    }
  });
  for (const job of stale) {
    const result = await db.propertyImport.updateMany({
      where: { id: job.id, processingStartedAt: job.processingStartedAt },
      data: {
        status: job.retryCount >= 2 ? 'FAILED' : 'QUEUED',
        retryCount: { increment: 1 },
        processingStartedAt: null,
        completedAt: job.retryCount >= 2 ? new Date() : null,
        errorMessage: 'Trabajo interrumpido; recuperado por el procesador.'
      }
    });
    if (result.count)
      importDebug(job.id, 'worker.stale.recovered', {
        previousStatus: job.status,
        nextStatus: job.retryCount >= 2 ? 'FAILED' : 'QUEUED',
        attempt: job.retryCount + 1
      });
  }
}
