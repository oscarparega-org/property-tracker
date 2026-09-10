import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapConfiguredAdmin } from '../../src/lib/admin-bootstrap.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('TEST_DATABASE_URL must point to a disposable database ending in _test.');
process.env.DATABASE_URL = url;
process.env.BETTER_AUTH_SECRET = 'integration-test-secret-with-at-least-32-characters';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.BETTER_AUTH_URL = 'http://localhost:3000';
process.env.TRUSTED_ORIGINS = 'http://localhost:5173';
process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString('base64');
process.env.ADMIN_EMAIL = 'catalog-admin@example.com';
process.env.ADMIN_NAME = 'Catalog Admin';
process.env.ADMIN_PASSWORD = 'catalog-admin-password-123';

const { createApp } = await import('../../src/app.js');
const { auth } = await import('../../src/lib/auth.js');
const db = new PrismaClient({ datasources: { db: { url } } });
const app = createApp(auth, db);
const emails: string[] = [];
let cookieA = '';
let cookieB = '';
let cookieAdmin = '';
let ownerA = '';
let ownerB = '';
let searchA = '';
let searchB = '';
let propertyId = '';
const catalogPropertyIds: string[] = [];

function request(path: string, cookie = '', method = 'GET', body?: BodyInit) {
  return app.request(path, {
    method,
    headers: {
      Cookie: cookie,
      Origin: 'http://localhost:5173',
      ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {})
    },
    body
  });
}

async function signUp(email: string) {
  await db.user.deleteMany({ where: { email } });
  emails.push(email);
  const response = await request(
    '/api/auth/sign-up/email',
    '',
    'POST',
    JSON.stringify({ name: 'Prueba', email, password: 'test-password-123' })
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const result = await response.json();
  return {
    id: result.user.id as string,
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
  };
}

async function signIn(email: string, password: string) {
  const response = await request(
    '/api/auth/sign-in/email',
    '',
    'POST',
    JSON.stringify({ email, password, rememberMe: false })
  );
  expect(response.status, await response.clone().text()).toBe(200);
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

async function createSearch(cookie: string, name: string) {
  const response = await request('/api/searches', cookie, 'POST', JSON.stringify({ name }));
  expect(response.status, await response.clone().text()).toBe(201);
  return (await response.json()).id as string;
}

beforeAll(async () => {
  const suffix = randomUUID();
  const accountA = await signUp(`catalog-a-${suffix}@example.com`);
  const accountB = await signUp(`catalog-b-${suffix}@example.com`);
  await db.user.deleteMany({ where: { email: process.env.ADMIN_EMAIL } });
  emails.push(process.env.ADMIN_EMAIL!);
  const bootstrap = await bootstrapConfiguredAdmin(db, async ({ email, name, password }) => {
    await auth.api.signUpEmail({ body: { email, name, password } });
  });
  expect(bootstrap.created).toBe(true);
  const passwordHash = (
    await db.account.findFirstOrThrow({
      where: { user: { email: process.env.ADMIN_EMAIL } },
      select: { password: true }
    })
  ).password;
  expect(passwordHash).toBeTruthy();
  expect(passwordHash).not.toBe(process.env.ADMIN_PASSWORD);
  const repeated = await bootstrapConfiguredAdmin(
    db,
    async () => {
      throw new Error('Existing administrators must not be recreated');
    },
    { ...process.env, ADMIN_PASSWORD: 'replacement-password-must-be-ignored' }
  );
  expect(repeated.created).toBe(false);
  expect(
    (
      await db.account.findFirstOrThrow({
        where: { user: { email: process.env.ADMIN_EMAIL } },
        select: { password: true }
      })
    ).password
  ).toBe(passwordHash);
  ({ id: ownerA, cookie: cookieA } = accountA);
  ({ id: ownerB, cookie: cookieB } = accountB);
  cookieAdmin = await signIn(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
  searchA = await createSearch(cookieA, 'Narvarte A');
  searchB = await createSearch(cookieB, 'Narvarte B');
  const property = await db.property.create({
    data: {
      ownerId: null,
      sourceProvider: 'remax.com.mx',
      sourceUrl: `https://remax.com.mx/propiedad/${suffix}`,
      sourceListingId: suffix,
      sourceListingKey: `RX-${suffix.slice(0, 8)}`,
      sourceObservedAt: new Date(),
      sourceMetadata: { internal: 'must never be public' },
      title: 'Departamento curado en Narvarte',
      description: 'Propiedad compartida para verificar el catálogo.',
      propertyType: 'APARTMENT',
      priceAmount: 4_250_000,
      priceCurrency: 'MXN',
      street: 'Avenida Universidad',
      neighborhood: 'Narvarte Poniente',
      municipality: 'Benito Juárez',
      state: 'Ciudad de México',
      bedrooms: 2,
      bathrooms: 2,
      constructionAreaM2: 86,
      publicationStatus: 'PUBLISHED',
      neighborhoodId: 'mx-cmx-benito-juarez-narvarte-poniente',
      images: { create: { url: 'https://example.com/catalog.jpg', alt: 'Departamento', sortOrder: 0 } },
      catalogListing: {
        create: {
          sourceId: 'remax-narvarte-poniente',
          sourceListingId: suffix,
          sourceModifiedAt: new Date(),
          status: 'ACTIVE'
        }
      }
    }
  });
  propertyId = property.id;
  catalogPropertyIds.push(property.id);
  const largerProperty = await db.property.create({
    data: {
      ownerId: null,
      sourceProvider: 'remax.com.mx',
      sourceUrl: `https://remax.com.mx/propiedad/${suffix}-large`,
      sourceListingId: `${suffix}-large`,
      sourceListingKey: `RX-L-${suffix.slice(0, 6)}`,
      sourceObservedAt: new Date(),
      sourceMetadata: {},
      title: 'Casa amplia en Narvarte',
      propertyType: 'HOUSE',
      priceAmount: 6_500_000,
      priceCurrency: 'MXN',
      street: 'Eje Central',
      neighborhood: 'Narvarte Poniente',
      municipality: 'Benito Juárez',
      state: 'Ciudad de México',
      bedrooms: 4,
      bathrooms: 4.5,
      constructionAreaM2: 160,
      publicationStatus: 'PUBLISHED',
      neighborhoodId: 'mx-cmx-benito-juarez-narvarte-poniente',
      catalogListing: {
        create: {
          sourceId: 'remax-narvarte-poniente',
          sourceListingId: `${suffix}-large`,
          sourceModifiedAt: new Date(Date.now() - 1_000),
          status: 'ACTIVE'
        }
      }
    }
  });
  catalogPropertyIds.push(largerProperty.id);
});

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { in: emails } } });
  if (catalogPropertyIds.length) await db.property.deleteMany({ where: { id: { in: catalogPropertyIds } } });
  await db.$disconnect();
});

describe('shared curated catalog', () => {
  it('returns a client error for invalid catalog filters', async () => {
    const response = await request('/api/catalog/properties?bedrooms=5');
    expect(response.status).toBe(400);
  });

  it('exposes catalog freshness and paginates the complete result set', async () => {
    const status = await request('/api/catalog/status');
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: 'remax-narvarte-poniente', activeListings: expect.any(Number) })
      ])
    );
    const secondPage = await (await request('/api/catalog/properties?pageSize=1&page=2&sort=price_asc')).json();
    expect(secondPage).toMatchObject({ page: 2, pageSize: 1 });
    expect(secondPage.items).toHaveLength(1);
  });

  it('normalizes display location from the relational neighborhood', async () => {
    const normalized = await db.property.create({
      data: {
        ownerId: null,
        sourceProvider: 'test',
        sourceObservedAt: new Date(),
        sourceMetadata: {},
        title: 'Ubicación normalizada',
        propertyType: 'APARTMENT',
        neighborhoodId: 'mx-cmx-benito-juarez-narvarte-poniente',
        neighborhood: 'Incorrecta',
        municipality: 'Incorrecto',
        state: 'Incorrecto'
      }
    });
    expect(normalized).toMatchObject({
      neighborhood: 'Narvarte Poniente',
      municipality: 'Benito Juárez',
      state: 'Ciudad de México'
    });
    await db.property.delete({ where: { id: normalized.id } });
  });

  it('is public, location-filtered, and does not expose private source metadata', async () => {
    const locations = await (await request('/api/catalog/locations')).json();
    expect(locations[0].municipalities[0].neighborhoods[0]).toMatchObject({
      id: 'mx-cmx-benito-juarez-narvarte-poniente',
      name: 'Narvarte Poniente'
    });
    const response = await request(
      '/api/catalog/properties?neighborhoodId=mx-cmx-benito-juarez-narvarte-poniente&q=Universidad'
    );
    expect(response.status).toBe(200);
    const page = await response.json();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ id: propertyId, catalogStatus: 'ACTIVE' });
    expect(page.items[0]).not.toHaveProperty('sourceMetadata');
    expect(page.items[0]).not.toHaveProperty('neighborhoodEntity');
    const filtered = await (
      await request(
        '/api/catalog/properties?propertyTypes=APARTMENT,HOUSE&minPrice=4000000&maxPrice=5000000&bedrooms=1,2&bathrooms=1.5,2&minConstructionAreaM2=80&maxConstructionAreaM2=100'
      )
    ).json();
    expect(filtered.items.map((item: { id: string }) => item.id)).toEqual([propertyId]);

    const fourPlus = await (await request('/api/catalog/properties?bedrooms=4%2B&bathrooms=4%2B')).json();
    expect(fourPlus.items).toHaveLength(1);
    expect(fourPlus.items[0]).toMatchObject({ title: 'Casa amplia en Narvarte' });

    const priceAscending = await (await request('/api/catalog/properties?sort=price_asc')).json();
    expect(priceAscending.items.slice(0, 2).map((item: { id: string }) => item.id)).toEqual(catalogPropertyIds);
    const areaDescending = await (await request('/api/catalog/properties?sort=area_desc')).json();
    expect(areaDescending.items.slice(0, 2).map((item: { id: string }) => item.id)).toEqual([
      catalogPropertyIds[1],
      catalogPropertyIds[0]
    ]);
  });

  it('lets different users attach one canonical property with isolated lifecycle state', async () => {
    for (const [cookie, searchId] of [
      [cookieA, searchA],
      [cookieB, searchB]
    ]) {
      const response = await request(
        `/api/searches/${searchId}/properties`,
        cookie,
        'POST',
        JSON.stringify({ propertyId })
      );
      expect(response.status, await response.clone().text()).toBe(201);
    }
    const changed = await request(
      `/api/searches/${searchA}/properties/${propertyId}/status`,
      cookieA,
      'PATCH',
      JSON.stringify({ decisionStatus: 'VISITED' })
    );
    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({ decisionStatus: 'VISITED' });
    expect(await (await request(`/api/searches/${searchB}/properties/${propertyId}`, cookieB)).json()).toMatchObject({
      decisionStatus: 'NEW'
    });
    expect(await db.property.count({ where: { id: propertyId } })).toBe(1);
  });

  it('keeps unavailable listings in searches while removing them from the public catalog', async () => {
    await db.catalogListing.update({ where: { propertyId }, data: { status: 'UNAVAILABLE' } });
    expect((await (await request('/api/catalog/properties?q=Departamento')).json()).total).toBe(0);
    const retained = await (await request(`/api/searches/${searchA}/properties/${propertyId}`, cookieA)).json();
    expect(retained).toMatchObject({ id: propertyId, catalogStatus: 'UNAVAILABLE', decisionStatus: 'VISITED' });
    const impact = await (await request(`/api/searches/${searchA}/deletion-impact`, cookieA)).json();
    expect(impact).toMatchObject({ membershipCount: 1, orphanCount: 0 });
    await db.catalogListing.update({ where: { propertyId }, data: { status: 'ACTIVE' } });
  });

  it('keeps manual property creation available alongside the catalog', async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      sourceProvider: 'MANUAL',
      sourceUrl: '',
      sourceListingId: '',
      sourceListingKey: '',
      title: 'Propiedad capturada manualmente',
      description: '',
      propertyType: 'APARTMENT',
      priceAmount: '',
      priceCurrency: 'MXN',
      street: '',
      exteriorNumber: '',
      interiorNumber: '',
      neighborhood: 'Narvarte Poniente',
      municipality: 'Benito Juárez',
      state: 'Ciudad de México',
      postalCode: '',
      countryCode: 'MX',
      formattedAddress: '',
      latitude: '',
      longitude: '',
      landAreaM2: '',
      constructionAreaM2: '',
      bedrooms: '',
      bathrooms: '',
      parkingSpaces: '',
      parkingType: '',
      serviceRoom: '',
      propertyAgeYears: '',
      condition: '',
      orientation: '',
      landUse: '',
      buildingLevels: '',
      unitFloor: '',
      maintenanceAmount: '',
      maintenanceCurrency: 'MXN',
      technicalSheetQrUrl: '',
      agentName: '',
      agentAvatarUrl: '',
      agentPhones: '',
      agentEmail: '',
      officeName: '',
      sourceOfficeId: '',
      sourceMetadata: '{}',
      images: '',
      areaFeatures: '',
      equipmentFeatures: '',
      otherFeatures: '',
      publicationStatus: 'PUBLISHED'
    }))
      form.set(key, value);
    form.append('searchIds', searchA);
    const response = await request('/api/properties', cookieA, 'POST', form);
    expect(response.status, await response.clone().text()).toBe(201);
    expect(await response.json()).toMatchObject({
      title: 'Propiedad capturada manualmente',
      searchId: searchA,
      catalogStatus: null
    });
  });

  it('prevents regular users from importing or editing catalog facts', async () => {
    expect(
      (
        await request(
          '/api/admin/catalog/imports',
          cookieA,
          'POST',
          JSON.stringify({ url: 'https://example.com/listing' })
        )
      ).status
    ).toBe(403);
    expect((await request(`/api/properties/${propertyId}`, cookieA, 'PUT', new FormData())).status).toBe(403);
    expect((await request(`/api/properties/${propertyId}/enhancements`, cookieA, 'POST')).status).toBe(403);
  });

  it('keeps private properties owner-scoped at the database boundary', async () => {
    const privateProperty = await db.property.create({
      data: {
        ownerId: ownerA,
        sourceProvider: 'manual',
        sourceUrl: `https://example.com/private/${randomUUID()}`,
        sourceObservedAt: new Date(),
        sourceMetadata: {},
        title: 'Propiedad privada histórica',
        propertyType: 'APARTMENT'
      }
    });
    await expect(
      db.searchProperty.create({
        data: { ownerId: ownerB, searchId: searchB, propertyId: privateProperty.id }
      })
    ).rejects.toThrow();
  });

  it('promotes configured admins and accepts an arbitrary URL as a review draft job', async () => {
    expect(await (await request('/api/capabilities', cookieAdmin)).json()).toMatchObject({
      authenticated: true,
      role: 'ADMIN'
    });
    const response = await request(
      '/api/admin/catalog/imports',
      cookieAdmin,
      'POST',
      JSON.stringify({ url: 'https://example.com/catalog-admin-fixture' })
    );
    expect(response.status, await response.clone().text()).toBe(202);
    const job = await response.json();
    expect(job).toMatchObject({ status: 'QUEUED' });
    expect(await db.propertyImport.findUnique({ where: { id: job.importId } })).toMatchObject({
      kind: 'CATALOG',
      ownerId: expect.any(String),
      publishOnReady: false
    });
  });

  it('demotes only administrators managed by removed configuration', async () => {
    process.env.ADMIN_EMAIL = '';
    try {
      expect(
        (
          await request(
            '/api/admin/catalog/imports',
            cookieAdmin,
            'POST',
            JSON.stringify({ url: 'https://example.com/blocked' })
          )
        ).status
      ).toBe(403);
      expect(await db.user.findUnique({ where: { email: 'catalog-admin@example.com' } })).toMatchObject({
        role: 'USER',
        adminManagedByConfig: false
      });
    } finally {
      process.env.ADMIN_EMAIL = 'catalog-admin@example.com';
    }
  });
});

describe('request boundaries', () => {
  it('applies the API body limit to authentication routes', async () => {
    const response = await request(
      '/api/auth/sign-up/email',
      '',
      'POST',
      JSON.stringify({ name: 'x'.repeat(1024 * 1024), email: 'oversized@example.com', password: 'password-123' })
    );
    expect(response.status).toBe(413);
  });
});
