import type { PrismaClient } from '@prisma/client';

export const developmentSeedSourceUrl = 'https://example.com/property-tracker-demo-home';

export function developmentSeedPropertyId(userId: string) {
  return `development-seed-property-${userId}`;
}

type DevelopmentSeedOptions = {
  email: string;
  worktreeId: string;
  createUser: () => Promise<void>;
};

export async function seedDevelopmentData(db: PrismaClient, options: DevelopmentSeedOptions) {
  let user = await db.user.findUnique({ where: { email: options.email } });
  if (!user) {
    await options.createUser();
    user = await db.user.findUniqueOrThrow({ where: { email: options.email } });
  }

  const id = developmentSeedPropertyId(user.id);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))::text`;

    const search =
      (await tx.search.findFirst({ where: { ownerId: user.id, isPrimary: true } })) ??
      (await tx.search.create({
        data: { ownerId: user.id, name: 'Mi búsqueda', nameKey: 'mi búsqueda', isPrimary: true }
      }));

    const current = await tx.property.findUnique({ where: { id } });
    if (current) {
      await tx.searchProperty.upsert({
        where: { searchId_propertyId: { searchId: search.id, propertyId: current.id } },
        create: { ownerId: user.id, searchId: search.id, propertyId: current.id },
        update: {}
      });
      return current;
    }

    // Adopt seeds created before the immutable ID was introduced. Updating the
    // primary key is safe because every property relation uses ON UPDATE CASCADE.
    const legacy = await tx.property.findFirst({
      where: {
        ownerId: user.id,
        OR: [
          { sourceUrl: developmentSeedSourceUrl },
          { sourceProvider: 'development-seed', sourceListingId: 'demo-home' }
        ]
      }
    });
    if (legacy) {
      const adopted = await tx.property.update({ where: { id: legacy.id }, data: { id } });
      await tx.searchProperty.upsert({
        where: { searchId_propertyId: { searchId: search.id, propertyId: adopted.id } },
        create: { ownerId: user.id, searchId: search.id, propertyId: adopted.id },
        update: {}
      });
      return adopted;
    }

    const created = await tx.property.create({
      data: {
        id,
        ownerId: user.id,
        sourceProvider: 'development-seed',
        sourceUrl: developmentSeedSourceUrl,
        sourceListingId: 'demo-home',
        sourceListingKey: 'development-seed:demo-home',
        sourceObservedAt: new Date('2026-01-15T18:00:00.000Z'),
        sourceMetadata: { seeded: true, worktree: options.worktreeId },
        title: 'Casa demo en Roma Norte',
        description:
          'Propiedad de ejemplo para probar filtros, favoritos, notas y decisiones sin capturar datos en cada worktree.',
        propertyType: 'HOUSE',
        priceAmount: 8_750_000,
        priceCurrency: 'MXN',
        street: 'Calle Colima',
        exteriorNumber: '120',
        neighborhood: 'Roma Norte',
        municipality: 'Cuauhtémoc',
        state: 'Ciudad de México',
        postalCode: '06700',
        countryCode: 'MX',
        formattedAddress: 'Calle Colima 120, Roma Norte, Cuauhtémoc, CDMX',
        latitude: 19.4194,
        longitude: -99.1621,
        landAreaM2: 180,
        constructionAreaM2: 235,
        bedrooms: 3,
        bathrooms: 2.5,
        parkingSpaces: 2,
        parkingType: 'Techado',
        serviceRoom: true,
        propertyAgeYears: 8,
        condition: 'Excelente',
        maintenanceAmount: 3_500,
        maintenanceCurrency: 'MXN',
        agentName: 'Mariana Demo',
        agentPhones: ['+52 55 5555 0101'],
        agentEmail: 'mariana@example.com',
        officeName: 'Inmobiliaria Demo',
        publicationStatus: 'PUBLISHED',
        images: {
          create: [
            {
              url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80',
              alt: 'Casa demo',
              sortOrder: 0
            }
          ]
        },
        features: {
          create: [
            { category: 'AREA', name: 'Terraza' },
            { category: 'AREA', name: 'Patio' },
            { category: 'EQUIPMENT', name: 'Cocina equipada' },
            { category: 'OTHER', name: 'Pet friendly' }
          ]
        }
      }
    });
    await tx.searchProperty.create({
      data: {
        ownerId: user.id,
        searchId: search.id,
        propertyId: created.id,
        isFavorite: true,
        rating: 4,
        notes: 'Registro inicial del worktree. Puedes editarlo o eliminarlo.'
      }
    });
    return created;
  });
}
