import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  aiListingAssessmentSchema,
  aiPropertyInputSchema,
  extractDeterministic,
  extractProperty,
  openAiStructuredSchema
} from '../../src/lib/import-extraction.js';

vi.mock('../../src/lib/public-url.js', () => ({
  assertSafePublicUrl: async (url: string) => new URL(url),
  publicDispatcher: {}
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('generates a closed Structured Outputs schema without arbitrary publisher metadata', () => {
  const schema = z.toJSONSchema(aiPropertyInputSchema);
  function inspect(value: unknown) {
    if (!value || typeof value !== 'object') return;
    const item = value as Record<string, unknown>;
    if (item.type === 'object') expect(item.additionalProperties).toBe(false);
    Object.values(item).forEach(inspect);
  }
  inspect(schema);
  expect(JSON.stringify(schema)).not.toContain('rawMetadata');
});

it('removes unsupported string formats from the OpenAI structured-output schema', () => {
  const schema = JSON.stringify(openAiStructuredSchema(aiListingAssessmentSchema));
  expect(schema).not.toContain('"format":"uri"');
  expect(schema).not.toContain('"format":"date-time"');
  expect(schema).not.toContain('"pattern"');
  expect(schema).toContain('"additionalProperties":false');
});

function aiProperty() {
  const extracted = extractDeterministic({
    url: 'https://example.com/listing',
    provider: 'example.com',
    strategy: 'direct',
    html: '<meta property="og:title" content="Casa luminosa"><meta property="og:image" content="/casa.jpg">',
    text: 'Casa luminosa en venta',
    metadata: {}
  }).input;
  const { rawMetadata: _rawMetadata, ...source } = extracted.source;
  void _rawMetadata;
  return {
    ...extracted,
    source,
    property: {
      ...extracted.property,
      price: { amount: 2_500_000, currency: 'MXN' },
      address: { ...extracted.property.address, formatted: 'Ciudad de México' }
    }
  };
}

it('rejects a page with zero property evidence without calling OpenAI', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          '<html><head><title>Noticias</title></head><body>' +
            'Noticias generales del día sin una publicación inmobiliaria específica. '.repeat(4) +
            '</body></html>',
          { headers: { 'content-type': 'text/html' } }
        )
    )
  );
  await expect(
    extractProperty('https://example.com/news', {
      openai: { credential: 'fixture-key', model: 'gpt-5.6-luna', onInvalidCredential: vi.fn() }
    })
  ).rejects.toThrow(/no parece corresponder/);
});

it('uses one grounded AI assessment for a borderline direct extraction', async () => {
  const fetcher = vi.fn(async (input: unknown) => {
    if (String(input).includes('api.openai.com'))
      return Response.json({
        output_text: JSON.stringify({
          isPropertyListing: true,
          confidence: 0.92,
          evidence: ['Precio y dirección presentes'],
          property: aiProperty()
        }),
        usage: { input_tokens: 10, output_tokens: 20 }
      });
    return new Response(
      '<html><head><meta property="og:title" content="Casa luminosa"><meta property="og:image" content="/casa.jpg"></head><body>' +
        'Casa luminosa en venta con espacio para toda la familia. '.repeat(5) +
        '</body></html>',
      { headers: { 'content-type': 'text/html' } }
    );
  });
  vi.stubGlobal('fetch', fetcher);
  const result = await extractProperty('https://example.com/listing', {
    openai: { credential: 'fixture-key', model: 'gpt-5.6-luna', onInvalidCredential: vi.fn() }
  });
  expect(result.input.property.price.amount).toBe(2_500_000);
  expect(result.evidence).toMatchObject({ gate: 'BORDERLINE', aiValidated: true, aiConfidence: 0.92 });
  expect(fetcher.mock.calls.filter(([input]) => String(input).includes('api.openai.com'))).toHaveLength(1);
});

it('creates a high-confidence direct result without calling OpenAI', async () => {
  const html =
    '<html><head><meta property="og:image" content="/house.jpg"><script type="application/ld+json">{"@type":"House","name":"Casa en venta","offers":{"price":2500000,"priceCurrency":"MXN"},"geo":{"latitude":19.4,"longitude":-99.1}}</script></head><body>' +
    'Casa en venta con tres recámaras y dos baños. '.repeat(4) +
    '</body></html>';
  const fetcher = vi.fn(async () => new Response(html, { headers: { 'content-type': 'text/html' } }));
  vi.stubGlobal('fetch', fetcher);
  const debug = vi.fn();
  const result = await extractProperty('https://example.com/listing', {
    debug,
    openai: { credential: 'fixture-key', model: 'gpt-5.6-luna', onInvalidCredential: vi.fn() }
  });
  expect(result.strategy).toBe('direct');
  expect(result.evidence).toMatchObject({ gate: 'PASS' });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(debug.mock.calls.map((call) => call[0])).toEqual([
    'direct.request.started',
    'direct.request.completed',
    'validation.gate',
    'validation.accepted'
  ]);
});

it('forces Firecrawl and OpenAI for a deep extraction', async () => {
  const fetcher = vi.fn(async (input: unknown) => {
    const target = String(input);
    if (target.includes('api.firecrawl.dev'))
      return Response.json({
        success: true,
        data: {
          rawHtml:
            '<meta property="og:title" content="Casa luminosa"><meta property="og:image" content="https://example.com/casa.jpg">',
          markdown: 'Casa luminosa en venta',
          metadata: {}
        }
      });
    if (target.includes('api.openai.com'))
      return Response.json({
        output_text: JSON.stringify({
          isPropertyListing: true,
          confidence: 0.95,
          evidence: ['Es una casa en venta'],
          property: aiProperty()
        })
      });
    throw new Error(`Unexpected request: ${target}`);
  });
  vi.stubGlobal('fetch', fetcher);
  const result = await extractProperty('https://example.com/listing', {
    mode: 'DEEP',
    firecrawl: { credential: 'fc-key', onInvalidCredential: vi.fn() },
    openai: { credential: 'sk-key', model: 'gpt-5.6-luna', onInvalidCredential: vi.fn() }
  });
  expect(result.strategy).toBe('firecrawl+openai');
  expect(result.firecrawlCredits).toBe(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
