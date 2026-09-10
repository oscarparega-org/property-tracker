import type { Prisma, PrismaClient } from '@prisma/client';
import type { CatalogPageDto, CatalogPropertyDto, CatalogQuery, PropertyInput } from '@house-tracker/shared';
import { includeRelations, relationData, sourceData, toPropertyDto } from './property-store.js';

const catalogInclude = {
  images: includeRelations.images,
  features: includeRelations.features,
  neighborhoodEntity: {
    include: { municipality: { include: { state: true } } }
  },
  catalogListing: true
};

type CatalogRecord = Prisma.PropertyGetPayload<{ include: typeof catalogInclude }>;

export function toCatalogDto(record: CatalogRecord): CatalogPropertyDto {
  if (!record.catalogListing || !record.neighborhoodEntity) throw new Error('Incomplete catalog property');
  const personal = toPropertyDto({ ...record, searches: [] }) as ReturnType<typeof toPropertyDto> & {
    neighborhoodEntity?: unknown;
  };
  const {
    searchId: _searchId,
    memberships: _memberships,
    decisionStatus: _decisionStatus,
    isFavorite: _isFavorite,
    rating: _rating,
    notes: _notes,
    visitAt: _visitAt,
    rejectionReason: _rejectionReason,
    archivedAt: _archivedAt,
    sourceMetadata: _sourceMetadata,
    neighborhoodEntity: _neighborhoodEntity,
    ...property
  } = personal;
  void _searchId;
  void _memberships;
  void _decisionStatus;
  void _isFavorite;
  void _rating;
  void _notes;
  void _visitAt;
  void _rejectionReason;
  void _archivedAt;
  void _sourceMetadata;
  void _neighborhoodEntity;
  return {
    ...property,
    catalogStatus: record.catalogListing.status,
    location: {
      state: {
        id: record.neighborhoodEntity.municipality.state.id,
        name: record.neighborhoodEntity.municipality.state.name
      },
      municipality: {
        id: record.neighborhoodEntity.municipality.id,
        name: record.neighborhoodEntity.municipality.name
      },
      neighborhood: { id: record.neighborhoodEntity.id, name: record.neighborhoodEntity.name }
    }
  };
}

export async function listCatalog(db: PrismaClient, query: CatalogQuery): Promise<CatalogPageDto> {
  const bedrooms = query.bedrooms?.filter((value) => value !== '4+').map(Number) ?? [];
  const bathrooms = query.bathrooms?.filter((value) => value !== '4+').map(Number) ?? [];
  const and: Prisma.PropertyWhereInput[] = [];
  if (query.bedrooms)
    and.push({
      OR: [
        ...(bedrooms.length ? [{ bedrooms: { in: bedrooms } }] : []),
        ...(query.bedrooms.includes('4+') ? [{ bedrooms: { gte: 4 } }] : [])
      ]
    });
  if (query.bathrooms)
    and.push({
      OR: [
        ...(bathrooms.length ? [{ bathrooms: { in: bathrooms } }] : []),
        ...(query.bathrooms.includes('4+') ? [{ bathrooms: { gte: 4 } }] : [])
      ]
    });
  const where: Prisma.PropertyWhereInput = {
    catalogListing: { is: { status: 'ACTIVE' } },
    ...(query.neighborhoodId ? { neighborhoodId: query.neighborhoodId } : {}),
    ...(query.propertyTypes ? { propertyType: { in: query.propertyTypes } } : {}),
    ...(query.minPrice !== undefined || query.maxPrice !== undefined
      ? { priceAmount: { gte: query.minPrice, lte: query.maxPrice } }
      : {}),
    ...(query.minConstructionAreaM2 !== undefined || query.maxConstructionAreaM2 !== undefined
      ? { constructionAreaM2: { gte: query.minConstructionAreaM2, lte: query.maxConstructionAreaM2 } }
      : {}),
    ...(query.municipalityId
      ? { neighborhoodEntity: { is: { municipalityId: query.municipalityId } } }
      : query.stateId
        ? { neighborhoodEntity: { is: { municipality: { is: { stateId: query.stateId } } } } }
        : {}),
    ...(and.length ? { AND: and } : {}),
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' } },
            { formattedAddress: { contains: query.q, mode: 'insensitive' } },
            { street: { contains: query.q, mode: 'insensitive' } },
            { sourceListingKey: { contains: query.q, mode: 'insensitive' } }
          ]
        }
      : {})
  };
  const orderBy: Prisma.PropertyOrderByWithRelationInput[] =
    query.sort === 'price_asc'
      ? [{ priceAmount: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]
      : query.sort === 'price_desc'
        ? [{ priceAmount: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }]
        : query.sort === 'area_asc'
          ? [{ constructionAreaM2: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]
          : query.sort === 'area_desc'
            ? [{ constructionAreaM2: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }]
            : [{ catalogListing: { sourceModifiedAt: 'desc' } }, { id: 'asc' }];
  const [total, records] = await db.$transaction([
    db.property.count({ where }),
    db.property.findMany({
      where,
      include: catalogInclude,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize
    })
  ]);
  return {
    items: records.map(toCatalogDto),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize)
  };
}

export async function getCatalogProperty(db: PrismaClient, id: string, includeUnavailable = false) {
  const record = await db.property.findFirst({
    where: {
      id,
      catalogListing: { is: { status: includeUnavailable ? { in: ['ACTIVE', 'UNAVAILABLE'] } : 'ACTIVE' } }
    },
    include: catalogInclude
  });
  return record ? toCatalogDto(record) : null;
}

export async function upsertCatalogProperty(
  db: Prisma.TransactionClient,
  input: PropertyInput,
  sourceId: string,
  status: 'DRAFT' | 'ACTIVE'
) {
  const source = await db.catalogSource.findUniqueOrThrow({ where: { id: sourceId } });
  const externalId = `${input.source.provider}:${input.source.listingId ?? input.source.url}`;
  const existing = await db.catalogListing.findUnique({
    where: { sourceId_sourceListingId: { sourceId, sourceListingId: externalId } },
    select: { propertyId: true }
  });
  const scalar = sourceData(input);
  const relations = relationData(input);
  if (existing) {
    await db.propertyImage.deleteMany({ where: { propertyId: existing.propertyId } });
    await db.propertyFeature.deleteMany({ where: { propertyId: existing.propertyId } });
    await db.property.update({
      where: { id: existing.propertyId },
      data: {
        ...scalar,
        ownerId: null,
        neighborhoodId: source.neighborhoodId,
        publicationStatus: status === 'ACTIVE' ? 'PUBLISHED' : 'DRAFT',
        images: { create: relations.images },
        features: { create: relations.features }
      }
    });
    await db.catalogListing.update({
      where: { propertyId: existing.propertyId },
      data: { status, lastSeenAt: new Date() }
    });
    return { action: 'updated' as const, propertyId: existing.propertyId };
  }
  const property = await db.property.create({
    data: {
      ...scalar,
      ownerId: null,
      neighborhoodId: source.neighborhoodId,
      municipality: 'Benito Juárez',
      publicationStatus: status === 'ACTIVE' ? 'PUBLISHED' : 'DRAFT',
      images: { create: relations.images },
      features: { create: relations.features },
      catalogListing: {
        create: { sourceId, sourceListingId: externalId, status }
      }
    }
  });
  return { action: 'created' as const, propertyId: property.id };
}
