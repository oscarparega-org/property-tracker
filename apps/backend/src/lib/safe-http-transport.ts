import { assertSafePublicUrl, publicDispatcher } from './public-url.js';
import { meta, plainText } from './import-providers/primitives.js';
import { resolveImportProvider } from './import-providers/registry.js';
import type { ExtractionArtifact } from './import-types.js';

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 12_000;

async function readLimitedBody(response: Response) {
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_RESPONSE_BYTES) throw new Error('La página supera el límite de 5 MB.');
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('La página supera el límite de 5 MB.');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function fetchPublic(
  value: string,
  request: {
    method?: 'GET' | 'POST';
    referer?: string;
    body?: string;
    accept: string;
    expectedContentTypes: string[];
  }
) {
  let current = await assertSafePublicUrl(value);
  const method = request.method ?? 'GET';
  const referer = request.referer ? (await assertSafePublicUrl(request.referer)).toString() : undefined;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const headers: Record<string, string> = {
      'user-agent': 'Mozilla/5.0 (compatible; HouseTracker/1.0; +property import)',
      accept: request.accept
    };
    if (request.body !== undefined) headers['content-type'] = 'application/json';
    if (referer) {
      headers.referer = referer;
      headers.origin = new URL(referer).origin;
    }
    const options: RequestInit & { dispatcher: typeof publicDispatcher } = {
      dispatcher: publicDispatcher,
      method,
      body: request.body,
      redirect: 'manual',
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    };
    const response = await fetch(current, options);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects === MAX_REDIRECTS) throw new Error('Demasiadas redirecciones.');
      current = await assertSafePublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`El portal respondió ${response.status}.`);
    const contentType = response.headers.get('content-type') ?? '';
    if (!request.expectedContentTypes.some((expected) => contentType.includes(expected))) {
      throw new Error('El portal devolvió un tipo de contenido no compatible.');
    }
    return { url: current.toString(), body: await readLimitedBody(response) };
  }
  throw new Error('No fue posible descargar los datos del portal.');
}

export async function fetchPublicHtml(value: string) {
  const result = await fetchPublic(value, {
    accept: 'text/html,application/xhtml+xml',
    expectedContentTypes: ['text/html', 'application/xhtml']
  });
  return { url: result.url, html: result.body };
}

export async function fetchPublicJson(
  value: string,
  options: { method?: 'GET' | 'POST'; referer?: string; body?: unknown } = {}
) {
  const result = await fetchPublic(value, {
    ...options,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    accept: 'application/json, text/plain, */*',
    expectedContentTypes: ['application/json']
  });
  try {
    return { url: result.url, data: JSON.parse(result.body) as unknown };
  } catch {
    throw new Error('El portal devolvió datos JSON inválidos.');
  }
}

function providerName(url: URL) {
  if (url.hostname.endsWith('remax.com.mx')) return 'RE/MAX México';
  if (url.hostname.endsWith('pulppo.com')) return 'Pulppo';
  return url.hostname.replace(/^www\./, '');
}

export async function fetchDirect(value: string): Promise<ExtractionArtifact> {
  const document = await fetchPublicHtml(value);
  const current = new URL(document.url);
  const text = plainText(document.html);
  const provider = resolveImportProvider(current);
  if (text.length < 120 && provider.key === 'generic') {
    throw new Error('La página no contiene información visible suficiente.');
  }
  const artifact: ExtractionArtifact = {
    url: document.url,
    provider: provider.name === 'Generic web page' ? providerName(current) : provider.name,
    strategy: 'direct',
    html: document.html,
    text,
    metadata: {
      title: meta(document.html, 'og:title') ?? meta(document.html, 'twitter:title'),
      description: meta(document.html, 'description'),
      providerKey: provider.key,
      providerVersion: provider.version
    }
  };
  return provider.enrich
    ? provider.enrich(artifact, { fetchHtml: fetchPublicHtml, fetchJson: fetchPublicJson })
    : artifact;
}
