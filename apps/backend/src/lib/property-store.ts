import type { Prisma, PrismaClient } from '@prisma/client';
import {
  canonicalizeListingUrl,
  type PropertyInput,
  type PropertyDto,
  type EnhancementPreviewDto
} from '@house-tracker/shared';

const includeRelations = {
  images: { orderBy: { sortOrder: 'asc' as const } },
  features: { orderBy: [{ category: 'asc' as const }, { name: 'asc' as const }] },
  searches: {
    include: { search: { select: { id: true, name: true, isPrimary: true } } },
    orderBy: { createdAt: 'asc' as const }
  }
};

export type PropertyRecord = Prisma.PropertyGetPayload<{
  include: typeof includeRelations;
}>;

function sourceData(input: PropertyInput) {
  const { source, property, contact } = input;
  return {
    sourceProvider: source.provider,
    sourceUrl: canonicalizeListingUrl(source.url),
    sourceListingId: source.listingId,
    sourceListingKey: source.listingKey,
    sourceObservedAt: new Date(source.observedAt),
    sourceMetadata: source.rawMetadata as Prisma.InputJsonValue,
    title: property.title,
    description: property.description,
    propertyType: property.propertyType,
    operationType: property.operationType,
    priceAmount: property.price.amount,
    priceCurrency: property.price.currency,
    street: property.address.street,
    exteriorNumber: property.address.exteriorNumber,
    interiorNumber: property.address.interiorNumber,
    neighborhood: property.address.neighborhood,
    municipality: property.address.municipality,
    state: property.address.state,
    postalCode: property.address.postalCode,
    countryCode: property.address.countryCode,
    formattedAddress: property.address.formatted,
    latitude: property.coordinates?.latitude ?? null,
    longitude: property.coordinates?.longitude ?? null,
    landAreaM2: property.details.landAreaM2,
    constructionAreaM2: property.details.constructionAreaM2,
    bedrooms: property.details.bedrooms,
    bathrooms: property.details.bathrooms,
    parkingSpaces: property.details.parkingSpaces,
    parkingType: property.details.parkingType,
    serviceRoom: property.details.serviceRoom,
    propertyAgeYears: property.details.propertyAgeYears,
    condition: property.details.condition,
    orientation: property.details.orientation,
    landUse: property.details.landUse,
    buildingLevels: property.details.buildingLevels,
    unitFloor: property.details.unitFloor,
    maintenanceAmount: property.details.maintenanceAmount,
    maintenanceCurrency: property.details.maintenanceCurrency,
    technicalSheetQrUrl: property.technicalSheetQrUrl,
    agentName: contact.agentName,
    agentAvatarUrl: contact.agentAvatarUrl,
    agentPhones: contact.phones,
    agentEmail: contact.email,
    officeName: contact.officeName,
    sourceOfficeId: contact.sourceOfficeId
  } satisfies Omit<Prisma.PropertyUncheckedCreateInput, 'ownerId'>;
}

function relationData(input: PropertyInput) {
  return {
    images: input.images.map((image) => ({
      url: image.url,
      alt: image.alt,
      sortOrder: image.order
    })),
    features: input.features.map((feature) => ({
      category: feature.category,
      name: feature.name
    }))
  };
}

export async function upsertProperty(db: Prisma.TransactionClient, input: PropertyInput, ownerId: string) {
  const data = sourceData(input);
  const relations = relationData(input);

  const tx = db;
  return (async () => {
    const existing = await tx.property.findFirst({
      where: {
        ownerId,
        OR: [
          { sourceUrl: data.sourceUrl },
          ...(data.sourceListingId
            ? [
                {
                  sourceProvider: data.sourceProvider,
                  sourceListingId: data.sourceListingId
                }
              ]
            : [])
        ]
      },
      select: { id: true }
    });

    if (existing) {
      const property = await tx.property.findUniqueOrThrow({ where: { id: existing.id }, include: includeRelations });
      return { action: 'existing' as const, property };
    }

    const property = await tx.property.create({
      data: {
        ...data,
        ownerId,
        publicationStatus: 'DRAFT',
        images: { create: relations.images },
        features: { create: relations.features }
      },
      include: includeRelations
    });
    return { action: 'created' as const, property };
  })();
}

function number(value: { toString(): string } | null) {
  return value === null ? null : Number(value.toString());
}

export function toPropertyDto(record: PropertyRecord, searchId?: string): PropertyDto {
  const { ownerId: _ownerId, searches: _searches, ...property } = record;
  void _ownerId;
  void _searches;
  const membership =
    record.searches.find((item) => item.searchId === searchId) ??
    record.searches.find((item) => item.search.isPrimary) ??
    record.searches[0];
  return {
    ...property,
    searchId: membership?.searchId ?? null,
    memberships: record.searches.map((item) => ({
      searchId: item.searchId,
      name: item.search.name,
      isPrimary: item.search.isPrimary
    })),
    decisionStatus: membership?.decisionStatus ?? 'NEW',
    isFavorite: membership?.isFavorite ?? false,
    rating: membership?.rating ?? null,
    notes: membership?.notes ?? null,
    visitAt: membership?.visitAt?.toISOString() ?? null,
    rejectionReason: membership?.rejectionReason ?? null,
    archivedAt: membership?.archivedAt?.toISOString() ?? null,
    sourceObservedAt: record.sourceObservedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    priceAmount: number(record.priceAmount),
    latitude: number(record.latitude),
    longitude: number(record.longitude),
    landAreaM2: number(record.landAreaM2),
    constructionAreaM2: number(record.constructionAreaM2),
    bathrooms: number(record.bathrooms),
    maintenanceAmount: number(record.maintenanceAmount)
  };
}

export async function listProperties(db: PrismaClient | Prisma.TransactionClient, ownerId: string, searchId?: string) {
  const records = await db.property.findMany({
    where: { ownerId, publicationStatus: 'PUBLISHED', ...(searchId ? { searches: { some: { searchId } } } : {}) },
    include: includeRelations,
    orderBy: { updatedAt: 'desc' }
  });
  return records.map((record) => toPropertyDto(record, searchId));
}

export async function listDraftProperties(
  db: PrismaClient | Prisma.TransactionClient,
  ownerId: string,
  searchId?: string
) {
  const records = await db.property.findMany({
    where: { ownerId, publicationStatus: 'DRAFT', ...(searchId ? { searches: { some: { searchId } } } : {}) },
    include: includeRelations,
    orderBy: { updatedAt: 'desc' }
  });
  return records.map((record) => toPropertyDto(record, searchId));
}

export async function getProperty(
  db: PrismaClient | Prisma.TransactionClient,
  id: string,
  ownerId: string,
  searchId?: string
) {
  const record = await db.property.findUnique({
    where: { id, ownerId, ...(searchId ? { searches: { some: { searchId } } } : {}) },
    include: includeRelations
  });
  return record ? toPropertyDto(record, searchId) : null;
}

type PreviewChange = EnhancementPreviewDto['changes'][number];

function printable(value: unknown) {
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return value === null || value === undefined ? null : String(value);
}

export function buildEnhancementPreview(
  current: PropertyDto,
  candidate: PropertyInput,
  importId: string
): EnhancementPreviewDto {
  const changes: PreviewChange[] = [];
  const add = (field: string, label: string, currentValue: unknown, proposed: unknown, replaceOther = false) => {
    const currentMissing =
      currentValue === null ||
      currentValue === undefined ||
      currentValue === '' ||
      (replaceOther && currentValue === 'OTHER');
    const proposedValue = printable(proposed);
    if (currentMissing && proposedValue !== null && proposedValue !== '' && proposedValue !== 'OTHER')
      changes.push({ field, label, current: printable(currentValue), proposed: proposedValue });
  };
  add('description', 'Descripción', current.description, candidate.property.description);
  add('propertyType', 'Tipo de propiedad', current.propertyType, candidate.property.propertyType, true);
  add('priceAmount', 'Precio', current.priceAmount, candidate.property.price.amount);
  add('priceCurrency', 'Moneda', current.priceCurrency, candidate.property.price.currency);
  add('street', 'Calle', current.street, candidate.property.address.street);
  add('exteriorNumber', 'Número exterior', current.exteriorNumber, candidate.property.address.exteriorNumber);
  add('interiorNumber', 'Número interior', current.interiorNumber, candidate.property.address.interiorNumber);
  add('neighborhood', 'Colonia', current.neighborhood, candidate.property.address.neighborhood);
  add('municipality', 'Municipio / alcaldía', current.municipality, candidate.property.address.municipality);
  add('state', 'Estado', current.state, candidate.property.address.state);
  add('postalCode', 'Código postal', current.postalCode, candidate.property.address.postalCode);
  add('formattedAddress', 'Dirección completa', current.formattedAddress, candidate.property.address.formatted);
  add('latitude', 'Latitud', current.latitude, candidate.property.coordinates?.latitude);
  add('longitude', 'Longitud', current.longitude, candidate.property.coordinates?.longitude);
  add('landAreaM2', 'Terreno', current.landAreaM2, candidate.property.details.landAreaM2);
  add('constructionAreaM2', 'Construcción', current.constructionAreaM2, candidate.property.details.constructionAreaM2);
  add('bedrooms', 'Recámaras', current.bedrooms, candidate.property.details.bedrooms);
  add('bathrooms', 'Baños', current.bathrooms, candidate.property.details.bathrooms);
  add('parkingSpaces', 'Estacionamientos', current.parkingSpaces, candidate.property.details.parkingSpaces);
  add('parkingType', 'Tipo de estacionamiento', current.parkingType, candidate.property.details.parkingType);
  add('serviceRoom', 'Cuarto de servicio', current.serviceRoom, candidate.property.details.serviceRoom);
  add('propertyAgeYears', 'Antigüedad', current.propertyAgeYears, candidate.property.details.propertyAgeYears);
  add('condition', 'Conservación', current.condition, candidate.property.details.condition);
  add('orientation', 'Orientación', current.orientation, candidate.property.details.orientation);
  add('landUse', 'Uso de suelo', current.landUse, candidate.property.details.landUse);
  add('buildingLevels', 'Niveles', current.buildingLevels, candidate.property.details.buildingLevels);
  add('unitFloor', 'Piso', current.unitFloor, candidate.property.details.unitFloor);
  add('maintenanceAmount', 'Mantenimiento', current.maintenanceAmount, candidate.property.details.maintenanceAmount);
  add(
    'maintenanceCurrency',
    'Moneda de mantenimiento',
    current.maintenanceCurrency,
    candidate.property.details.maintenanceCurrency
  );
  add('technicalSheetQrUrl', 'Ficha técnica', current.technicalSheetQrUrl, candidate.property.technicalSheetQrUrl);
  add('agentName', 'Asesor', current.agentName, candidate.contact.agentName);
  add('agentAvatarUrl', 'Foto del asesor', current.agentAvatarUrl, candidate.contact.agentAvatarUrl);
  add('agentEmail', 'Correo del asesor', current.agentEmail, candidate.contact.email);
  add('officeName', 'Oficina', current.officeName, candidate.contact.officeName);
  add('sourceOfficeId', 'ID de oficina', current.sourceOfficeId, candidate.contact.sourceOfficeId);
  const phoneAdds = candidate.contact.phones.filter((phone) => !current.agentPhones.includes(phone));
  if (phoneAdds.length)
    changes.push({
      field: 'agentPhones',
      label: 'Teléfonos del asesor',
      current: current.agentPhones.join(', ') || null,
      proposed: [...current.agentPhones, ...phoneAdds].join(', ')
    });
  const existingImages = new Set(current.images.map((image) => image.url));
  const existingFeatures = new Set(
    current.features.map((feature) => `${feature.category}:${feature.name.toLocaleLowerCase()}`)
  );
  return {
    importId,
    propertyId: current.id,
    changes,
    addedImages: candidate.images.map((image) => image.url).filter((url) => !existingImages.has(url)),
    addedFeatures: candidate.features.filter(
      (feature) => !existingFeatures.has(`${feature.category}:${feature.name.toLocaleLowerCase()}`)
    )
  };
}

function jsonRecord(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, Prisma.JsonValue>) : {};
}

export async function applyEnhancement(db: PrismaClient, id: string, ownerId: string, candidate: PropertyInput) {
  await db.$transaction(async (tx) => {
    const record = await tx.property.findFirstOrThrow({ where: { id, ownerId }, include: includeRelations });
    const current = toPropertyDto(record);
    const preview = buildEnhancementPreview(current, candidate, 'apply');
    const allowed = new Set(preview.changes.map((change) => change.field));
    const source = sourceData(candidate);
    const scalar: Prisma.PropertyUncheckedUpdateInput = {
      sourceObservedAt: source.sourceObservedAt,
      sourceMetadata: {
        ...jsonRecord(record.sourceMetadata),
        latestEnhancement: candidate.source.rawMetadata as Prisma.JsonValue
      }
    };
    for (const field of allowed)
      (scalar as Record<string, unknown>)[field] = (source as Record<string, unknown>)[field];
    const existingPhones = new Set(record.agentPhones);
    const phones = candidate.contact.phones.filter((phone) => !existingPhones.has(phone));
    if (phones.length) scalar.agentPhones = [...record.agentPhones, ...phones];
    const existingImages = new Set(record.images.map((image) => image.url));
    const images = candidate.images.filter((image) => !existingImages.has(image.url));
    const existingFeatures = new Set(
      record.features.map((feature) => `${feature.category}:${feature.name.toLocaleLowerCase()}`)
    );
    const features = candidate.features.filter(
      (feature) => !existingFeatures.has(`${feature.category}:${feature.name.toLocaleLowerCase()}`)
    );
    await tx.property.update({
      where: { id, ownerId },
      data: {
        ...scalar,
        ...(images.length
          ? {
              images: {
                create: images.map((image, index) => ({
                  url: image.url,
                  alt: image.alt,
                  sortOrder: record.images.length + index
                }))
              }
            }
          : {}),
        ...(features.length
          ? { features: { create: features.map((feature) => ({ category: feature.category, name: feature.name })) } }
          : {})
      }
    });
  });
  return getProperty(db, id, ownerId);
}
