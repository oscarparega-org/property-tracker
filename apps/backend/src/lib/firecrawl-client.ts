import { assertSafePublicUrl } from './public-url.js';
import { plainText } from './import-providers/primitives.js';
import type { ExtractionArtifact } from './import-types.js';
import { ProviderRequestError } from './import-types.js';

function providerName(url: URL) {
  if (url.hostname.endsWith('remax.com.mx')) return 'RE/MAX México';
  if (url.hostname.endsWith('pulppo.com')) return 'Pulppo';
  return url.hostname.replace(/^www\./, '');
}

export async function fetchWithFirecrawl(
  value: string,
  key: string,
  options: { onlyMainContent?: boolean } = {}
): Promise<ExtractionArtifact> {
  await assertSafePublicUrl(value);
  const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      url: value,
      formats: ['markdown', 'rawHtml'],
      onlyMainContent: options.onlyMainContent ?? true,
      proxy: 'auto',
      timeout: 60_000,
      storeInCache: true
    }),
    signal: AbortSignal.timeout(70_000)
  });
  const payload = (await response.json()) as {
    success?: boolean;
    data?: { markdown?: string; rawHtml?: string; metadata?: Record<string, unknown> };
    error?: string;
  };
  const diagnostic = {
    status: response.status,
    requestId: response.headers.get('x-request-id'),
    providerMessage: payload.error ?? null
  };
  if (response.status === 401 || response.status === 403) {
    throw new ProviderRequestError('FIRECRAWL', 'AUTH', diagnostic);
  }
  if (!response.ok || !payload.success || !payload.data) {
    throw new ProviderRequestError('FIRECRAWL', 'UNAVAILABLE', diagnostic);
  }
  const url = new URL(value);
  return {
    url: value,
    provider: providerName(url),
    strategy: 'firecrawl',
    html: payload.data.rawHtml ?? '',
    text: (payload.data.markdown ?? plainText(payload.data.rawHtml ?? '')).slice(0, 400_000),
    metadata: payload.data.metadata ?? {}
  };
}
