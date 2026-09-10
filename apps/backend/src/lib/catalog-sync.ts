import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { extractProperty } from './import-extraction.js';
import { fetchPublicFormJson } from './safe-http-transport.js';
import { relationData, sourceData } from './property-store.js';

const sourceConfigSchema = z.object({
  endpoint: z.url(),
  operation: z.string(),
  currency: z.string(),
  neighborhoodSourceId: z.string()
});
const discoverySchema = z.object({
  data: z.object({
    prop_data: z.array(z.object({ propiedad_id: z.coerce.string().min(1) })),
    bounds: z.object({
      maxLng: z.number(),
      minLng: z.number(),
      maxLat: z.number(),
      minLat: z.number()
    })
  })
});
const RUN_RETRY_DELAY_MS = 15 * 60_000;

function localDate(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

function sourceModifiedAt(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).sourceModifiedAt;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function sameDate(a: Date | null, b: Date | null) {
  return a?.valueOf() === b?.valueOf();
}

export function sourceVersionUnchanged(stored: Date | null, candidate: Date | null) {
  return candidate !== null && sameDate(stored, candidate);
}

export function catalogRunRetryable(
  run: { status: string; retryCount: number; startedAt: Date; completedAt: Date | null },
  now: Date
) {
  return (
    run.retryCount < 1 &&
    (run.status === 'FAILED' || run.status === 'RUNNING') &&
    now.valueOf() - (run.completedAt ?? run.startedAt).valueOf() >= RUN_RETRY_DELAY_MS
  );
}

export type CatalogSyncSummary = {
  runId: string;
  sourceId: string;
  scheduledDate: string;
  status: 'SUCCEEDED' | 'PARTIAL';
  discoveredCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  unavailableCount: number;
  failedCount: number;
};

export async function syncCatalogSource(
  db: PrismaClient,
  sourceId: string,
  options: { now?: Date; timeZone?: string; force?: boolean } = {}
): Promise<CatalogSyncSummary | null> {
  const now = options.now ?? new Date();
  const date = localDate(now, options.timeZone ?? 'America/Mexico_City');
  const scheduledDate = options.force ? `${date}:manual:${now.toISOString()}` : date;
  const source = await db.catalogSource.findFirstOrThrow({ where: { id: sourceId, enabled: true } });
  const run = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`catalog:${sourceId}:${date}`}, 0))::text`;
    const existing = await tx.catalogSyncRun.findUnique({
      where: { sourceId_scheduledDate: { sourceId, scheduledDate } }
    });
    if (!existing) return tx.catalogSyncRun.create({ data: { sourceId, scheduledDate } });
    const retryable = !options.force && catalogRunRetryable(existing, now);
    if (!retryable) return null;
    return tx.catalogSyncRun.update({
      where: { id: existing.id },
      data: {
        status: 'RUNNING',
        retryCount: { increment: 1 },
        discoveredCount: 0,
        createdCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        unavailableCount: 0,
        failedCount: 0,
        errorMessage: null,
        startedAt: now,
        completedAt: null
      }
    });
  });
  if (!run) return null;

  const counts = { discoveredCount: 0, createdCount: 0, updatedCount: 0, unchangedCount: 0, failedCount: 0 };
  try {
    const config = sourceConfigSchema.parse(source.discoveryConfig);
    const discovery = discoverySchema.parse(
      (
        await fetchPublicFormJson(
          config.endpoint,
          {
            moneda: config.currency,
            operacion: config.operation,
            colonia_id: config.neighborhoodSourceId,
            locationKeyword: 'narvarte poniente, ciudad de mexico, ciudad de mexico'
          },
          source.discoveryUrl
        )
      ).data
    );
    if (discovery.data.prop_data.length >= 250)
      throw new Error('La fuente alcanzó su límite de 250 resultados; no se aplicó una reconciliación parcial.');
    const ids = [...new Set(discovery.data.prop_data.map((item) => item.propiedad_id))];
    counts.discoveredCount = ids.length;

    for (const listingId of ids) {
      try {
        const extracted = await extractProperty(`https://remax.com.mx/propiedad/${encodeURIComponent(listingId)}`, {
          mode: 'STANDARD'
        });
        const modifiedAt = sourceModifiedAt(extracted.input.source.rawMetadata);
        const existing = await db.catalogListing.findUnique({
          where: { sourceId_sourceListingId: { sourceId, sourceListingId: listingId } },
          include: { property: true }
        });
        if (existing && sourceVersionUnchanged(existing.sourceModifiedAt, modifiedAt)) {
          await db.catalogListing.update({
            where: { propertyId: existing.propertyId },
            data: { lastSeenAt: now, status: 'ACTIVE' }
          });
          counts.unchangedCount += 1;
          continue;
        }
        const scalar = sourceData(extracted.input);
        const relations = relationData(extracted.input);
        await db.$transaction(async (tx) => {
          if (existing) {
            await tx.propertyImage.deleteMany({ where: { propertyId: existing.propertyId } });
            await tx.propertyFeature.deleteMany({ where: { propertyId: existing.propertyId } });
            await tx.property.update({
              where: { id: existing.propertyId },
              data: {
                ...scalar,
                ownerId: null,
                municipality: source.municipalityId === 'mx-cmx-benito-juarez' ? 'Benito Juárez' : scalar.municipality,
                neighborhoodId: source.neighborhoodId,
                publicationStatus: 'PUBLISHED',
                images: { create: relations.images },
                features: { create: relations.features }
              }
            });
            await tx.catalogListing.update({
              where: { propertyId: existing.propertyId },
              data: { sourceModifiedAt: modifiedAt, lastSeenAt: now, status: 'ACTIVE' }
            });
          } else {
            await tx.property.create({
              data: {
                ...scalar,
                ownerId: null,
                municipality: source.municipalityId === 'mx-cmx-benito-juarez' ? 'Benito Juárez' : scalar.municipality,
                neighborhoodId: source.neighborhoodId,
                publicationStatus: 'PUBLISHED',
                images: { create: relations.images },
                features: { create: relations.features },
                catalogListing: {
                  create: {
                    sourceId,
                    sourceListingId: listingId,
                    sourceModifiedAt: modifiedAt,
                    lastSeenAt: now,
                    status: 'ACTIVE'
                  }
                }
              }
            });
          }
        });
        if (existing) counts.updatedCount += 1;
        else counts.createdCount += 1;
      } catch (error) {
        counts.failedCount += 1;
        console.error(`Catalog listing ${listingId} failed`, error instanceof Error ? error.message : 'unknown error');
      }
    }

    const unavailable = await db.catalogListing.updateMany({
      where: { sourceId, sourceListingId: { notIn: ids }, status: 'ACTIVE' },
      data: { status: 'UNAVAILABLE' }
    });
    const status: CatalogSyncSummary['status'] = counts.failedCount ? 'PARTIAL' : 'SUCCEEDED';
    const summary = { runId: run.id, sourceId, scheduledDate, status, ...counts, unavailableCount: unavailable.count };
    await db.$transaction([
      db.catalogSyncRun.update({
        where: { id: run.id },
        data: { ...counts, unavailableCount: unavailable.count, status, completedAt: new Date() }
      }),
      ...(status === 'SUCCEEDED'
        ? [db.catalogSource.update({ where: { id: sourceId }, data: { lastSuccessfulSyncAt: new Date() } })]
        : [])
    ]);
    return summary;
  } catch (error) {
    await db.catalogSyncRun.update({
      where: { id: run.id },
      data: {
        ...counts,
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Catalog sync failed'
      }
    });
    throw error;
  }
}

export function catalogScheduleState(now: Date, timeZone: string, hour: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23'
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, due: Number(parts.hour) >= hour };
}
