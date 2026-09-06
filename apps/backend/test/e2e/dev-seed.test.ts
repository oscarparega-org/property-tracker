import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { developmentSeedPropertyId, developmentSeedSourceUrl, seedDevelopmentData } from '../../src/lib/dev-seed.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('TEST_DATABASE_URL must point to a disposable database ending in _test.');
process.env.DATABASE_URL = url;
process.env.BETTER_AUTH_SECRET = 'seed-test-secret-with-at-least-32-characters';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.BETTER_AUTH_URL = 'http://localhost:3000';
process.env.TRUSTED_ORIGINS = 'http://localhost:5173';
process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const { createApp } = await import('../../src/app.js');
const { auth } = await import('../../src/lib/auth.js');
const db = new PrismaClient({ datasources: { db: { url } } });
const app = createApp(auth, db);
const email = `development-seed-${randomUUID()}@example.com`;

async function createUser() {
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ name: 'Seed Test', email, password: 'test-password-123' })
  });
  expect(response.status, await response.clone().text()).toBe(200);
}

afterAll(async () => {
  await db.user.deleteMany({ where: { email } });
  await db.$disconnect();
});

describe('development seed', () => {
  it('is idempotent and remains identifiable after editable source fields change', async () => {
    const first = await seedDevelopmentData(db, { email, worktreeId: 'test-worktree', createUser });
    expect(first.id).toBe(developmentSeedPropertyId(first.ownerId));

    const editedUrl = `https://example.com/edited-${randomUUID()}`;
    await db.property.update({
      where: { id: first.id },
      data: { title: 'Edited demo property', sourceUrl: editedUrl }
    });

    await seedDevelopmentData(db, { email, worktreeId: 'test-worktree', createUser });
    const properties = await db.property.findMany({ where: { ownerId: first.ownerId } });
    expect(properties).toHaveLength(1);
    expect(properties[0]).toMatchObject({ id: first.id, title: 'Edited demo property', sourceUrl: editedUrl });
  });

  it('adopts a legacy seed ID without breaking property relations', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    await db.property.deleteMany({ where: { ownerId: user.id } });

    const legacyId = `legacy-development-seed-${randomUUID()}`;
    await db.property.create({
      data: {
        id: legacyId,
        ownerId: user.id,
        sourceProvider: 'development-seed',
        sourceUrl: developmentSeedSourceUrl,
        sourceListingId: 'demo-home',
        sourceObservedAt: new Date('2026-01-15T18:00:00.000Z'),
        sourceMetadata: { seeded: true },
        title: 'Legacy demo property',
        propertyType: 'HOUSE',
        images: { create: [{ url: 'https://example.com/legacy-image.jpg', sortOrder: 0 }] },
        features: { create: [{ category: 'AREA', name: 'Legacy patio' }] },
        imports: {
          create: [
            {
              ownerId: user.id,
              url: 'https://example.com/legacy-import',
              canonicalUrl: 'https://example.com/legacy-import'
            }
          ]
        }
      }
    });

    const adopted = await seedDevelopmentData(db, { email, worktreeId: 'test-worktree', createUser });
    const expectedId = developmentSeedPropertyId(user.id);
    expect(adopted.id).toBe(expectedId);
    expect(await db.property.findUnique({ where: { id: legacyId } })).toBeNull();
    expect(await db.propertyImage.findMany({ where: { propertyId: expectedId } })).toHaveLength(1);
    expect(await db.propertyFeature.findMany({ where: { propertyId: expectedId } })).toHaveLength(1);
    expect(await db.propertyImport.findMany({ where: { propertyId: expectedId } })).toHaveLength(1);
  });
});
