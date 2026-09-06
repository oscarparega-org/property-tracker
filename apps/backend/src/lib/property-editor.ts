import type { Prisma, PrismaClient } from '@prisma/client';
import { HTTPException } from 'hono/http-exception';
import { editorSchema, canonicalizeListingUrl, httpUrl } from '@house-tracker/shared';
import { toPropertyDto } from './property-store.js';
function lines(value: string) {
  return [
    ...new Set(
      value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    )
  ];
}

export async function saveProperty(db: PrismaClient, ownerId: string, formData: FormData, id?: string) {
  const parsed = editorSchema.safeParse({ ...Object.fromEntries(formData), id: id ?? '' });
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'Datos inválidos.' });
  }
  const data = parsed.data;
  if ((data.latitude === null) !== (data.longitude === null)) {
    throw new HTTPException(400, { message: 'Latitud y longitud deben capturarse juntas.' });
  }

  const featureRows = [
    ...lines(data.areaFeatures).map((name) => ({ category: 'AREA' as const, name })),
    ...lines(data.equipmentFeatures).map((name) => ({ category: 'EQUIPMENT' as const, name })),
    ...lines(data.otherFeatures).map((name) => ({ category: 'OTHER' as const, name }))
  ];
  const imageRows = lines(data.images).map((url, sortOrder) => ({ url, sortOrder }));
  if (imageRows.some(({ url }) => !httpUrl.safeParse(url).success)) {
    throw new HTTPException(400, { message: 'Cada fotografía debe ser una URL válida.' });
  }
  const propertyData = {
    sourceProvider: data.sourceProvider,
    sourceUrl: data.sourceUrl ? canonicalizeListingUrl(data.sourceUrl) : null,
    sourceListingId: data.sourceListingId,
    sourceListingKey: data.sourceListingKey,
    sourceMetadata: data.sourceMetadata as Prisma.InputJsonValue,
    title: data.title,
    description: data.description,
    propertyType: data.propertyType,
    priceAmount: data.priceAmount,
    priceCurrency: data.priceCurrency || null,
    street: data.street,
    exteriorNumber: data.exteriorNumber,
    interiorNumber: data.interiorNumber,
    neighborhood: data.neighborhood,
    municipality: data.municipality,
    state: data.state,
    postalCode: data.postalCode,
    countryCode: data.countryCode,
    formattedAddress: data.formattedAddress,
    latitude: data.latitude,
    longitude: data.longitude,
    landAreaM2: data.landAreaM2,
    constructionAreaM2: data.constructionAreaM2,
    bedrooms: data.bedrooms,
    bathrooms: data.bathrooms,
    parkingSpaces: data.parkingSpaces,
    parkingType: data.parkingType,
    serviceRoom: data.serviceRoom === '' ? null : data.serviceRoom === 'true',
    propertyAgeYears: data.propertyAgeYears,
    condition: data.condition,
    orientation: data.orientation,
    landUse: data.landUse,
    buildingLevels: data.buildingLevels,
    unitFloor: data.unitFloor,
    maintenanceAmount: data.maintenanceAmount,
    maintenanceCurrency: data.maintenanceCurrency || null,
    technicalSheetQrUrl: data.technicalSheetQrUrl || null,
    agentName: data.agentName,
    agentAvatarUrl: data.agentAvatarUrl || null,
    agentPhones: lines(data.agentPhones),
    agentEmail: data.agentEmail || null,
    officeName: data.officeName,
    sourceOfficeId: data.sourceOfficeId,
    decisionStatus: data.decisionStatus,
    rating: data.rating,
    notes: data.notes,
    visitAt: data.visitAt,
    rejectionReason: data.rejectionReason,
    publicationStatus: data.publicationStatus
  } satisfies Prisma.PropertyUpdateInput;

  const include = { images: { orderBy: { sortOrder: 'asc' as const } }, features: true };
  if (id) {
    return toPropertyDto(
      await db.property.update({
        where: { id, ownerId },
        data: {
          ...propertyData,
          images: { deleteMany: {}, create: imageRows },
          features: { deleteMany: {}, create: featureRows }
        },
        include
      })
    );
  }
  return toPropertyDto(
    await db.property.create({
      data: {
        ...propertyData,
        ownerId,
        sourceObservedAt: new Date(),
        images: { create: imageRows },
        features: { create: featureRows }
      } as Prisma.PropertyUncheckedCreateInput,
      include
    })
  );
}
