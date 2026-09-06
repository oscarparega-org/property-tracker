// Test-only server: deterministic publisher response, real auth/API/database/worker.
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { processImportJob } from '../src/lib/import-jobs.js';
import { extractDeterministic } from '../src/lib/import-extraction.js';

if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
  throw new Error('Browser tests require a disposable _test database.');
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url === 'https://example.com/house-tracker-fixture')
    return new Response(
      `<!doctype html><html><head><meta property="og:title" content="Casa de prueba"><script type="application/ld+json">{"@type":"House","name":"Casa de prueba","offers":{"price":2500000,"priceCurrency":"MXN"},"geo":{"latitude":19.4,"longitude":-99.1}}</script></head><body>Casa de prueba en venta. Una casa luminosa con espacios amplios para toda la familia, ubicada en una colonia tranquila de la ciudad. Tiene 3 recámaras, 2 baños y 150 m² de construcción. Contacta al anunciante para conocerla.</body></html>`,
      { headers: { 'content-type': 'text/html' } }
    );
  if (url.startsWith('https://api.openai.com/v1/models/'))
    return Response.json({ id: url.split('/').at(-1), object: 'model' });
  if (url === 'https://api.firecrawl.dev/v2/team/credit-usage')
    return Response.json({ success: true, data: { remainingCredits: 100 } });
  if (url === 'https://api.firecrawl.dev/v2/scrape')
    return Response.json({
      success: true,
      data: {
        rawHtml:
          '<meta property="og:title" content="Casa de prueba"><meta property="og:image" content="https://example.com/enhanced-house.jpg">',
        markdown: 'Casa de prueba en venta, 3 recámaras, 2 baños y 150 m² de construcción.',
        metadata: {}
      }
    });
  if (url === 'https://api.openai.com/v1/responses') {
    const extracted = extractDeterministic({
      url: 'https://example.com/house-tracker-fixture',
      provider: 'example.com',
      strategy: 'firecrawl',
      html: '<meta property="og:title" content="Casa de prueba"><meta property="og:image" content="https://example.com/enhanced-house.jpg">',
      text: 'Casa de prueba en venta, 3 recámaras, 2 baños y 150 m² de construcción.',
      metadata: {}
    }).input;
    const { rawMetadata: _rawMetadata, ...source } = extracted.source;
    void _rawMetadata;
    return Response.json({
      output_text: JSON.stringify({
        isPropertyListing: true,
        confidence: 0.96,
        evidence: ['Casa en venta con recámaras, baños y superficie'],
        property: { ...extracted, source }
      })
    });
  }
  return fetchOriginal(input, init);
};
const port = Number(process.env.BROWSER_TEST_API_PORT ?? 3000);
const server = serve({ fetch: createApp().fetch, port });
let stopping = false;
async function stop() {
  stopping = true;
  server.close();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
while (!stopping) {
  const job = await prisma.propertyImport.findFirst({ where: { status: 'QUEUED' }, orderBy: { createdAt: 'asc' } });
  if (job) await processImportJob(prisma, job.id);
  else await new Promise((resolve) => setTimeout(resolve, 250));
}
await prisma.$disconnect();
