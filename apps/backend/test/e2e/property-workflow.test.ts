import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { PropertyDto } from '@template/shared';
import type { ExtractionOptions } from '../../src/lib/import-extraction.js';
import { randomUUID } from 'node:crypto';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('TEST_DATABASE_URL must point to a disposable database ending in _test.');
process.env.DATABASE_URL = url;
process.env.BETTER_AUTH_SECRET = 'integration-test-secret-with-at-least-32-characters';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.BETTER_AUTH_URL = 'http://localhost:3000';
process.env.TRUSTED_ORIGINS = 'http://localhost:5173';
process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString('base64');

const { createApp } = await import('../../src/app.js');
const { auth } = await import('../../src/lib/auth.js');
const { extractDeterministic, ListingValidationError } = await import('../../src/lib/import-extraction.js');
const { processImportJob, recoverStaleImports, reserveProvider } = await import('../../src/lib/import-jobs.js');
const { reserveWrite } = await import('../../src/lib/write-limits.js');
const db = new PrismaClient({ datasources: { db: { url } } });
const app = createApp(auth, db);
const emails: string[] = [];
let cookieA = '',
  cookieB = '',
  ownerA = '',
  ownerB = '',
  propertyId = '';
const listingUrl = `https://example.com/listing/${randomUUID()}`;
const artifact = {
  url: listingUrl,
  provider: 'example.com',
  strategy: 'direct' as const,
  html: '<html><head><meta property="og:title" content="Casa de prueba"><script type="application/ld+json">{"@type":"House","name":"Casa de prueba","description":"Una propiedad para verificar el flujo completo.","offers":{"price":2500000,"priceCurrency":"MXN"},"geo":{"latitude":19.4,"longitude":-99.1},"image":["https://example.com/photo.jpg"]}</script></head></html>',
  text: 'Casa de prueba',
  metadata: {}
};
const extracted = extractDeterministic(artifact);
const extraction = async () => ({
  input: extracted.input,
  evidence: extracted.evidence,
  strategy: 'direct',
  provider: 'example.com',
  firecrawlCredits: 0
});

function request(path: string, cookie = cookieA, method = 'GET', body?: BodyInit) {
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
function editor(property: PropertyDto, publicationStatus = 'PUBLISHED') {
  const form = new FormData();
  for (const [key, value] of Object.entries(property)) form.set(key, value === null ? '' : String(value));
  form.set('sourceMetadata', JSON.stringify(property.sourceMetadata));
  form.set('images', property.images.map((image) => image.url).join('\n'));
  form.set('agentPhones', property.agentPhones.join('\n'));
  for (const [field, category] of [
    ['areaFeatures', 'AREA'],
    ['equipmentFeatures', 'EQUIPMENT'],
    ['otherFeatures', 'OTHER']
  ])
    form.set(
      field!,
      property.features
        .filter((item) => item.category === category)
        .map((item) => item.name)
        .join('\n')
    );
  form.set('publicationStatus', publicationStatus);
  return form;
}

beforeAll(async () => {
  for (const label of ['a', 'b']) {
    const email = `migration-${label}-${randomUUID()}@example.com`;
    emails.push(email);
    const response = await request(
      '/api/auth/sign-up/email',
      '',
      'POST',
      JSON.stringify({ name: 'Prueba', email, password: 'test-password-123' })
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const result = await response.json();
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    if (label === 'a') {
      cookieA = cookie;
      ownerA = result.user.id;
    } else {
      cookieB = cookie;
      ownerB = result.user.id;
    }
  }
});
afterAll(async () => {
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.$disconnect();
});

describe('clean account → URL → private draft → publication', () => {
  it('starts both new accounts with no properties or drafts and requires authentication', async () => {
    expect((await request('/api/properties', '')).status).toBe(401);
    expect(await (await request('/api/properties')).json()).toEqual([]);
    expect(await (await request('/api/properties?publicationStatus=DRAFT', cookieB)).json()).toEqual([]);
    expect((await request('/health', '')).status).toBe(200);
  });
  it('enqueues a URL once per owner and processes it into a draft', async () => {
    const responses = await Promise.all([
      request('/api/imports', cookieA, 'POST', JSON.stringify({ url: listingUrl })),
      request('/api/imports', cookieA, 'POST', JSON.stringify({ url: listingUrl }))
    ]);
    expect(responses.map((r) => r.status)).toEqual([202, 202]);
    const [a, b] = await Promise.all(responses.map((r) => r.json()));
    expect(a.importId).toBe(b.importId);
    expect((await request(`/api/imports/${a.importId}`, cookieB)).status).toBe(404);
    expect(await processImportJob(db, a.importId, extraction)).toBe(true);
    expect(await processImportJob(db, a.importId, extraction)).toBe(false);
    const progress = await (await request(`/api/imports/${a.importId}`)).json();
    expect(progress.status).toBe('READY');
    propertyId = progress.propertyId;
    expect(await (await request('/api/properties')).json()).toEqual([]);
    const drafts = await (await request('/api/properties?publicationStatus=DRAFT')).json();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].title).toBe('Casa de prueba');
    expect(drafts[0].publicationStatus).toBe('DRAFT');
  });
  it('publishes through the editor and preserves numeric values', async () => {
    const property = await (await request(`/api/properties/${propertyId}`)).json();
    const response = await request(`/api/properties/${propertyId}`, cookieA, 'PUT', editor(property));
    expect(response.status, await response.clone().text()).toBe(200);
    const saved = await response.json();
    expect(saved.publicationStatus).toBe('PUBLISHED');
    expect(saved.priceAmount).toBe(2500000);
    expect(await (await request('/api/properties')).json()).toHaveLength(1);
    expect(await (await request('/api/properties?publicationStatus=DRAFT')).json()).toEqual([]);
  });
  it('isolates every ID-based mutation and allows the same URL for another account', async () => {
    for (const suffix of ['', '/favorite', '/archive', '/decision', '/status']) {
      const response = await request(`/api/properties/${propertyId}${suffix}`, cookieB, suffix ? 'PATCH' : 'PUT', '{}');
      expect(response.status).toBe(404);
    }
    expect((await request(`/api/properties/${propertyId}`, cookieB)).status).toBe(404);
    const result = await (await request('/api/imports', cookieB, 'POST', JSON.stringify({ url: listingUrl }))).json();
    expect(result.importId).toBeTruthy();
    await processImportJob(db, result.importId, extraction);
    const other = await db.property.findFirstOrThrow({ where: { ownerId: ownerB } });
    expect(other.id).not.toBe(propertyId);
    expect(other.publicationStatus).toBe('DRAFT');
  });
  it('sets favorites, archive state, decision notes, rating and visit date', async () => {
    expect(
      (await request(`/api/properties/${propertyId}/favorite`, cookieA, 'PATCH', JSON.stringify({ isFavorite: true })))
        .status
    ).toBe(200);
    const archive = await (
      await request(`/api/properties/${propertyId}/archive`, cookieA, 'PATCH', JSON.stringify({ archived: true }))
    ).json();
    expect(archive.archivedAt).toBeTruthy();
    const form = new FormData();
    for (const [key, value] of Object.entries({
      decisionStatus: 'VISIT_SCHEDULED',
      rating: '4',
      notes: 'Visitar',
      visitAt: '2026-10-01T18:00:00.000Z',
      rejectionReason: '',
      isFavorite: 'on'
    }))
      form.set(key, value);
    const response = await request(`/api/properties/${propertyId}/decision`, cookieA, 'PATCH', form);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      notes: 'Visitar',
      rating: 4,
      archivedAt: null,
      isFavorite: true,
      visitAt: '2026-10-01T18:00:00.000Z'
    });
    const moved = await request(
      `/api/properties/${propertyId}/status`,
      cookieA,
      'PATCH',
      JSON.stringify({ decisionStatus: 'VISITED' })
    );
    expect(moved.status).toBe(200);
    expect(await moved.json()).toMatchObject({ decisionStatus: 'VISITED', notes: 'Visitar', rating: 4 });
    expect(
      (
        await request(
          `/api/properties/${propertyId}/status`,
          cookieA,
          'PATCH',
          JSON.stringify({ decisionStatus: 'UNKNOWN' })
        )
      ).status
    ).toBe(400);
  });
  it('creates and edits a manual property without a source URL', async () => {
    const property = await (await request(`/api/properties/${propertyId}`)).json();
    const form = editor(property, 'DRAFT');
    form.set('id', '');
    form.set('sourceUrl', '');
    form.set('sourceListingId', '');
    form.set('sourceProvider', 'MANUAL');
    form.set('title', 'Captura manual');
    const created = await request('/api/properties', cookieA, 'POST', form);
    expect(created.status, await created.clone().text()).toBe(201);
    const manual = await created.json();
    expect(manual.sourceUrl).toBeNull();
    const edit = editor(manual);
    edit.set('title', 'Captura revisada');
    const saved = await request(`/api/properties/${manual.id}`, cookieA, 'PUT', edit);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ title: 'Captura revisada', publicationStatus: 'PUBLISHED' });
  });
  it('does not overwrite a published property when another job resolves to its listing', async () => {
    const job = await db.propertyImport.create({
      data: { ownerId: ownerA, url: listingUrl, canonicalUrl: listingUrl }
    });
    await processImportJob(db, job.id, extraction);
    const property = await db.property.findUniqueOrThrow({ where: { id: propertyId } });
    expect(property.publicationStatus).toBe('PUBLISHED');
    expect(property.notes).toBe('Visitar');
  });
  it('rejects validation errors, duplicate manual URLs, private targets and foreign origins', async () => {
    const property = await (await request(`/api/properties/${propertyId}`)).json();
    const invalid = editor(property);
    invalid.set('rating', '9');
    expect((await request(`/api/properties/${propertyId}`, cookieA, 'PUT', invalid)).status).toBe(400);
    const duplicate = editor(property);
    duplicate.set('id', '');
    expect((await request('/api/properties', cookieA, 'POST', duplicate)).status).toBe(409);
    expect(
      (await request('/api/imports', cookieA, 'POST', JSON.stringify({ url: 'http://127.0.0.1/private' }))).status
    ).toBe(400);
    const foreign = await app.request(`/api/properties/${propertyId}/favorite`, {
      method: 'PATCH',
      headers: { Cookie: cookieA, Origin: 'https://untrusted.invalid', 'Content-Type': 'application/json' },
      body: '{"isFavorite":false}'
    });
    expect(foreign.status).toBe(403);
  });
  it('retries failed jobs, recovers interrupted jobs, and respects disabled provider budgets', async () => {
    const job = await db.propertyImport.create({
      data: { ownerId: ownerA, url: listingUrl, canonicalUrl: listingUrl }
    });
    const fail = async () => {
      throw new Error('fixture failure');
    };
    for (let attempt = 0; attempt < 3; attempt++) await processImportJob(db, job.id, fail);
    expect(await db.propertyImport.findUnique({ where: { id: job.id } })).toMatchObject({
      status: 'FAILED',
      retryCount: 3
    });
    await db.propertyImport.update({
      where: { id: job.id },
      data: { status: 'FETCHING', retryCount: 0, processingStartedAt: new Date(0) }
    });
    await recoverStaleImports(db);
    expect(await db.propertyImport.findUnique({ where: { id: job.id } })).toMatchObject({
      status: 'QUEUED',
      retryCount: 1
    });
    process.env.OPENAI_IMPORT_LIMIT_MONTHLY = '0';
    expect(await reserveProvider(db, job.id, ownerA, 'OPENAI', 100)).toBe(false);
    delete process.env.OPENAI_IMPORT_LIMIT_MONTHLY;
  });
  it('atomically enforces request limits under concurrent submissions', async () => {
    const action = `test-limit-${randomUUID()}`;
    const results = await Promise.allSettled([
      reserveWrite(db, ownerA, new Headers(), action, 1, 10),
      reserveWrite(db, ownerA, new Headers(), action, 1, 10)
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason.status).toBe(429);
  });

  it('stores validated provider credentials encrypted and isolates settings by owner', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ object: 'model' }))
    );
    try {
      const initial = await (await request('/api/settings/providers')).json();
      expect(initial).toHaveLength(2);
      expect(initial.every((item: { credentialConfigured: boolean }) => !item.credentialConfigured)).toBe(true);
      const saved = await request(
        '/api/settings/providers/openai',
        cookieA,
        'PUT',
        JSON.stringify({
          enabled: true,
          credential: 'sk-owner-a-secret',
          model: 'gpt-5.6-luna',
          monthlyOperationLimit: 10
        })
      );
      expect(saved.status, await saved.clone().text()).toBe(200);
      expect(await saved.json()).toMatchObject({
        provider: 'OPENAI',
        enabled: true,
        credentialConfigured: true,
        credentialHint: '••••cret',
        status: 'READY'
      });
      const raw = await db.providerSetting.findUniqueOrThrow({
        where: { ownerId_provider: { ownerId: ownerA, provider: 'OPENAI' } }
      });
      expect(raw.credentialCiphertext.toString()).not.toContain('sk-owner-a-secret');
      const other = await (await request('/api/settings/providers', cookieB)).json();
      expect(other.find((item: { provider: string }) => item.provider === 'OPENAI')).toMatchObject({
        credentialConfigured: false,
        credentialHint: null
      });

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('', { status: 401 }))
      );
      const rejected = await request(
        '/api/settings/providers/openai',
        cookieA,
        'PUT',
        JSON.stringify({
          enabled: true,
          credential: 'sk-invalid-secret',
          model: 'gpt-5.6-luna',
          monthlyOperationLimit: 10
        })
      );
      expect(rejected.status).toBe(400);
      expect(
        (
          await db.providerSetting.findUniqueOrThrow({
            where: { ownerId_provider: { ownerId: ownerA, provider: 'OPENAI' } }
          })
        ).credentialHint
      ).toBe('cret');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('passes only the job owner credential to the worker and stops using it after removal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ object: 'model' }))
    );
    try {
      const saveB = await request(
        '/api/settings/providers/openai',
        cookieB,
        'PUT',
        JSON.stringify({
          enabled: true,
          credential: 'sk-owner-b-secret',
          model: 'gpt-5.6-luna',
          monthlyOperationLimit: 10
        })
      );
      expect(saveB.status, await saveB.clone().text()).toBe(200);
    } finally {
      vi.unstubAllGlobals();
    }
    const credentials: Array<string | undefined> = [];
    const inspect = async (_url: string, options: ExtractionOptions) => {
      credentials.push(options.openai?.credential);
      return extraction();
    };
    const jobA = await db.propertyImport.create({
      data: { ownerId: ownerA, url: `${listingUrl}?owner=a`, canonicalUrl: `${listingUrl}?owner=a` }
    });
    const jobB = await db.propertyImport.create({
      data: { ownerId: ownerB, url: `${listingUrl}?owner=b`, canonicalUrl: `${listingUrl}?owner=b` }
    });
    await processImportJob(db, jobA.id, inspect);
    await processImportJob(db, jobB.id, inspect);
    expect(credentials).toEqual(['sk-owner-a-secret', 'sk-owner-b-secret']);

    expect((await request('/api/settings/providers/openai/credential', cookieA, 'DELETE')).status).toBe(200);
    const withoutCredential = await db.propertyImport.create({
      data: { ownerId: ownerA, url: `${listingUrl}?owner=a2`, canonicalUrl: `${listingUrl}?owner=a2` }
    });
    await processImportJob(db, withoutCredential.id, inspect);
    expect(credentials.at(-1)).toBeUndefined();
  });

  it('previews and safely applies a Firecrawl + OpenAI enhancement', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const target = String(input);
        if (target.includes('/v1/models/')) return Response.json({ object: 'model' });
        return Response.json({ success: true, data: { remainingCredits: 100 } });
      })
    );
    try {
      const saved = await request(
        '/api/settings/providers/firecrawl',
        cookieB,
        'PUT',
        JSON.stringify({
          enabled: true,
          credential: 'fc-owner-b-secret',
          model: null,
          monthlyOperationLimit: 10
        })
      );
      expect(saved.status, await saved.clone().text()).toBe(200);
      const capability = await (
        await request(
          `/api/properties/${(await db.property.findFirstOrThrow({ where: { ownerId: ownerB } })).id}/enhancement-capability`,
          cookieB
        )
      ).json();
      expect(capability).toEqual({ available: true, reason: null });
    } finally {
      vi.unstubAllGlobals();
    }

    const target = await db.property.findFirstOrThrow({ where: { ownerId: ownerB } });
    const started = await request(`/api/properties/${target.id}/enhancements`, cookieB, 'POST');
    expect(started.status, await started.clone().text()).toBe(202);
    const start = await started.json();
    const candidate = structuredClone(extracted.input);
    candidate.property.details.bedrooms = 3;
    candidate.images.push({ url: 'https://example.com/photo-2.jpg', alt: 'Recámara', order: 1 });
    candidate.features.push({ category: 'AREA', name: 'Jardín' });
    const deep = vi.fn(async (...args: [string, ExtractionOptions]) => {
      void args;
      return {
        input: candidate,
        evidence: { gate: 'PASS' },
        strategy: 'firecrawl+openai',
        provider: 'example.com',
        firecrawlCredits: 1
      };
    });
    expect(await processImportJob(db, start.importId, deep)).toBe(true);
    expect(deep.mock.calls[0]?.[1]).toMatchObject({
      mode: 'DEEP',
      firecrawl: { credential: 'fc-owner-b-secret' },
      openai: { credential: 'sk-owner-b-secret' }
    });
    expect((await db.property.findUniqueOrThrow({ where: { id: target.id } })).bedrooms).toBeNull();
    const previewResponse = await request(`/api/enhancements/${start.importId}`, cookieB);
    expect(previewResponse.status, await previewResponse.clone().text()).toBe(200);
    const preview = await previewResponse.json();
    expect(preview.changes).toContainEqual(expect.objectContaining({ field: 'bedrooms', proposed: '3' }));
    expect(preview.addedImages).toContain('https://example.com/photo-2.jpg');
    expect((await request(`/api/enhancements/${start.importId}`, cookieA)).status).toBe(404);
    const applied = await request(`/api/enhancements/${start.importId}/apply`, cookieB, 'POST');
    expect(applied.status, await applied.clone().text()).toBe(200);
    expect(await applied.json()).toMatchObject({ bedrooms: 3 });
    const updated = await db.property.findUniqueOrThrow({
      where: { id: target.id },
      include: { images: true, features: true }
    });
    expect(updated.images).toHaveLength(2);
    expect(updated.features).toContainEqual(expect.objectContaining({ category: 'AREA', name: 'Jardín' }));
  });

  it('fails a non-listing validation once and creates no property', async () => {
    const badUrl = `${listingUrl}?not-a-listing=${randomUUID()}`;
    const job = await db.propertyImport.create({ data: { ownerId: ownerA, url: badUrl, canonicalUrl: badUrl } });
    const reject = async () => {
      throw new ListingValidationError();
    };
    expect(await processImportJob(db, job.id, reject)).toBe(false);
    expect(await db.propertyImport.findUnique({ where: { id: job.id } })).toMatchObject({
      status: 'FAILED',
      retryCount: 1,
      propertyId: null
    });
  });
});
