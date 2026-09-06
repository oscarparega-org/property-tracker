import type { Prisma, PrismaClient } from '@prisma/client';
import type { SearchDto } from '@house-tracker/shared';

export function searchNameKey(name: string) {
  return name.trim().normalize('NFKC').toLocaleLowerCase('es-MX');
}

export async function ensurePrimarySearch(db: PrismaClient | Prisma.TransactionClient, ownerId: string, force = false) {
  const current = await db.search.findFirst({ where: { ownerId, isPrimary: true } });
  if (current) return current;
  const any = await db.search.findFirst({ where: { ownerId }, orderBy: { createdAt: 'asc' } });
  if (any) return db.search.update({ where: { id: any.id }, data: { isPrimary: true } });
  if (!force && (await db.property.count({ where: { ownerId } })) === 0) return null;
  return db.search.create({
    data: { ownerId, name: 'Mi búsqueda', nameKey: 'mi búsqueda', isPrimary: true }
  });
}

export async function reconcileSearchMemberships(db: PrismaClient, ownerId: string) {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${ownerId}:search-limit`}, 0))::text`;
    const unlinked = await tx.property.findMany({
      where: { ownerId, searches: { none: {} } },
      select: { id: true }
    });
    if (!unlinked.length) return;
    const search = await ensurePrimarySearch(tx, ownerId, true);
    if (!search) return;
    await tx.searchProperty.createMany({
      data: unlinked.map((property) => ({
        ownerId,
        searchId: search.id,
        propertyId: property.id
      })),
      skipDuplicates: true
    });
  });
}

export async function listSearches(db: PrismaClient, ownerId: string): Promise<SearchDto[]> {
  await reconcileSearchMemberships(db, ownerId);
  const searches = await db.search.findMany({
    where: { ownerId },
    include: {
      properties: {
        select: { decisionStatus: true, property: { select: { publicationStatus: true } } }
      }
    },
    orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }]
  });
  return searches.map((search) => {
    const statusCounts: SearchDto['statusCounts'] = {};
    for (const membership of search.properties) {
      if (membership.property.publicationStatus !== 'PUBLISHED') continue;
      statusCounts[membership.decisionStatus] = (statusCounts[membership.decisionStatus] ?? 0) + 1;
    }
    return {
      id: search.id,
      name: search.name,
      isPrimary: search.isPrimary,
      propertyCount: search.properties.filter((item) => item.property.publicationStatus === 'PUBLISHED').length,
      draftCount: search.properties.filter((item) => item.property.publicationStatus === 'DRAFT').length,
      statusCounts,
      createdAt: search.createdAt.toISOString(),
      updatedAt: search.updatedAt.toISOString()
    };
  });
}

export async function ownedSearch(db: PrismaClient | Prisma.TransactionClient, ownerId: string, searchId: string) {
  return db.search.findFirst({ where: { id: searchId, ownerId } });
}

export async function validateSearchIds(
  db: PrismaClient | Prisma.TransactionClient,
  ownerId: string,
  searchIds: string[]
) {
  const searches = await db.search.findMany({ where: { ownerId, id: { in: searchIds } }, select: { id: true } });
  return searches.length === searchIds.length;
}
