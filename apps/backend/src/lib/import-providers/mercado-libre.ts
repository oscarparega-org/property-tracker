import { propertyInputSchema, type PropertyInput } from '@template/shared';
import type { DirectExtraction, ExtractionArtifact } from '../import-extraction.js';
import type { ImportProvider, ProviderContext } from './types.js';

type JsonRecord = Record<string, unknown>;

const PROVIDER_KEY = 'mercado-libre';
const PROVIDER_NAME = 'Mercado Libre';
const PROVIDER_VERSION = '1';

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const parsed = Number(
    value
      .replace(/[^\d.,-]/g, '')
      .replace(/,(?=\d{3}(?:\D|$))/g, '')
      .replace(',', '.')
  );
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAssignedJson(html: string, id: string) {
  const script = html.match(new RegExp(`<script\\b[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i'))?.[1];
  if (!script) return null;
  const start = script.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < script.length; index += 1) {
    const character = script[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) {
      try {
        return JSON.parse(script.slice(start, index + 1)) as JsonRecord;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function findById(root: unknown, id: string): JsonRecord | null {
  const seen = new Set<unknown>();
  function walk(value: unknown, depth: number): JsonRecord | null {
    if (depth > 15 || !value || typeof value !== 'object' || seen.has(value)) return null;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = walk(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    const item = value as JsonRecord;
    if (item.id === id) return item;
    for (const child of Object.values(item)) {
      const found = walk(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  return walk(root, 0);
}

function firstValueForKey(root: unknown, wanted: string): unknown {
  const seen = new Set<unknown>();
  function walk(value: unknown, depth: number): unknown {
    if (depth > 15 || !value || typeof value !== 'object' || seen.has(value)) return undefined;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = walk(item, depth + 1);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    const item = value as JsonRecord;
    if (wanted in item && item[wanted] !== null) return item[wanted];
    for (const child of Object.values(item)) {
      const found = walk(child, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  return walk(root, 0);
}

function initialState(html: string) {
  const rendering = parseAssignedJson(html, '__NORDIC_RENDERING_CTX__');
  return record(record(record(rendering?.appProps)?.pageProps)?.initialState);
}

function mercadoLibreId(url: URL) {
  return (
    url.pathname
      .match(/\b(ML[A-Z]-?\d+)\b/i)?.[1]
      ?.replace('-', '')
      .toUpperCase() ?? null
  );
}

function isMercadoLibreHost(hostname: string) {
  return hostname === 'mercadolibre.com.mx' || hostname.endsWith('.mercadolibre.com.mx');
}

type MercadoLibreImage = { id: string; url: string; alt: string | null };

function galleryImages(html: string): MercadoLibreImage[] {
  const state = initialState(html);
  const gallery = findById(state?.components, 'gallery_multimedia');
  const pictures = array(record(gallery?.data)?.tabs)
    .map(record)
    .find((tab) => tab?.id === 'pictures');
  const images = new Map<string, MercadoLibreImage>();
  for (const group of array(pictures?.multimedia).map(record)) {
    for (const item of array(group?.elements).map(record)) {
      const id = string(item?.id);
      const source = string(item?.src_high) ?? string(item?.src);
      if (!id || !source) continue;
      let url: URL;
      try {
        url = new URL(source);
      } catch {
        continue;
      }
      if (url.protocol !== 'https:' || url.hostname !== 'http2.mlstatic.com') continue;
      if (!/^\/D_NQ_NP_[\w-]+-OO\.webp$/i.test(url.pathname) && !/^\/D_[\w-]+-F\.webp$/i.test(url.pathname)) continue;
      if (!images.has(id)) images.set(id, { id, url: url.toString(), alt: string(item?.alt) ?? string(item?.title) });
    }
  }
  return [...images.values()];
}

function specificationMap(components: unknown) {
  const specifications = findById(components, 'technical_specifications');
  const result = new Map<string, string>();
  for (const group of array(specifications?.specs).map(record)) {
    for (const attribute of array(group?.attributes).map(record)) {
      const id = string(attribute?.id);
      const text = string(attribute?.text);
      if (id && text) result.set(id.toLocaleLowerCase('es-MX'), text);
    }
  }
  return result;
}

function splitAddress(location: JsonRecord | null) {
  const map = record(location?.map_info);
  const streetLine = string(map?.item_address);
  const formatted = string(record(array(location?.content_rows).map(record)[0]?.title)?.text);
  const locality =
    string(map?.item_location)
      ?.split(',')
      .map((part) => part.trim()) ?? [];
  const formattedParts = formatted?.split(',').map((part) => part.trim()) ?? [];
  const streetMatch = streetLine?.match(/^(.*?)(?:\s+(\d+[\w-]*))?$/);
  return {
    street: streetMatch?.[1]?.trim() || streetLine,
    exteriorNumber: streetMatch?.[2] ?? null,
    neighborhood:
      formattedParts.length >= 4
        ? formattedParts[1]!
        : !streetLine && formattedParts.length >= 3
          ? formattedParts[0]!
          : null,
    municipality: locality[0] ?? (formattedParts.length >= 3 ? formattedParts.at(-2)! : null),
    state: locality[1] ?? (formattedParts.length >= 2 ? formattedParts.at(-1)! : null),
    formatted
  };
}

function propertyType(title: string, subtitle: string | null): PropertyInput['property']['propertyType'] {
  const value = `${title} ${subtitle ?? ''}`;
  if (/departamento/i.test(value)) return 'APARTMENT';
  if (/\bcasa\b/i.test(value)) return 'HOUSE';
  if (/terreno/i.test(value)) return 'LAND';
  return 'OTHER';
}

function buildInput(artifact: ExtractionArtifact): DirectExtraction | null {
  const state = record(artifact.metadata.mercadoLibreState);
  if (!state || state.vertical !== 'real_estate') return null;
  const components = state.components;
  const header = findById(components, 'header');
  const priceComponent = record(findById(components, 'price')?.price);
  const description = findById(components, 'description');
  const location = findById(components, 'location_and_points');
  const seller = findById(components, 'seller_profile');
  const specs = specificationMap(components);
  const id = string(state.id) ?? mercadoLibreId(new URL(artifact.url));
  const title = string(header?.title);
  if (!id || !title) return null;

  const address = splitAddress(location);
  const coordinates = record(record(location?.map_info)?.location);
  const latitude = number(coordinates?.latitude);
  const longitude = number(coordinates?.longitude);
  const images = array(artifact.metadata.mercadoLibreImages)
    .map(record)
    .flatMap((image) => {
      const url = string(image?.url);
      return url ? [{ url, alt: string(image?.alt) }] : [];
    });
  const maintenance = number(specs.get('mantenimiento'));
  const officeName = string(record(record(seller?.seller_name)?.title)?.text);
  const sellerExtra = array(seller?.bottom_extra_info).map(record)[0];
  const listingKey = string(record(array(sellerExtra?.subtitles).map(record)[0])?.text);
  const sourceOfficeIdValue = firstValueForKey(seller, 'seller_id');
  const sourceOfficeId =
    typeof sourceOfficeIdValue === 'number' || typeof sourceOfficeIdValue === 'string'
      ? String(sourceOfficeIdValue)
      : null;
  const subtitle = string(header?.subtitle);
  const features = ['ambientes', 'bodegas', 'disposición', 'admite mascotas'].flatMap((key) => {
    const value = string(specs.get(key));
    if (!value) return [];
    const label = key.charAt(0).toLocaleUpperCase('es-MX') + key.slice(1);
    return [{ category: 'OTHER' as const, name: `${label}: ${value}` }];
  });
  const input = propertyInputSchema.parse({
    schemaVersion: 1,
    source: {
      provider: PROVIDER_NAME,
      url: artifact.url,
      listingId: id,
      listingKey: listingKey ?? id,
      observedAt: new Date().toISOString(),
      rawMetadata: {
        strategy: artifact.strategy,
        providerKey: PROVIDER_KEY,
        providerVersion: PROVIDER_VERSION,
        galleryExpected: number(artifact.metadata.mercadoLibreGalleryExpected),
        galleryRetrieved: images.length
      }
    },
    property: {
      title,
      description: string(description?.content),
      propertyType: propertyType(title, subtitle),
      operationType: 'SALE',
      price: {
        amount: number(priceComponent?.value),
        currency: string(priceComponent?.currency_id)?.toUpperCase() ?? null
      },
      address: {
        street: address.street,
        exteriorNumber: address.exteriorNumber,
        interiorNumber: null,
        neighborhood: address.neighborhood,
        municipality: address.municipality,
        state: address.state,
        postalCode: null,
        countryCode: 'MX',
        formatted: address.formatted
      },
      coordinates: latitude !== null && longitude !== null ? { latitude, longitude } : null,
      details: {
        landAreaM2: number(specs.get('superficie total')) ?? number(specs.get('superficie de terreno')),
        constructionAreaM2: number(specs.get('superficie construida')),
        bedrooms: number(specs.get('recámaras')),
        bathrooms: number(specs.get('baños')),
        parkingSpaces: number(specs.get('estacionamientos')),
        parkingType: null,
        serviceRoom: null,
        propertyAgeYears: number(specs.get('antigüedad')),
        condition: null,
        orientation: string(specs.get('orientación')),
        landUse: null,
        buildingLevels: null,
        unitFloor: null,
        maintenanceAmount: maintenance,
        maintenanceCurrency:
          maintenance === null
            ? null
            : (string(specs.get('mantenimiento'))?.match(/\b[A-Z]{3}\b/)?.[0] ??
              string(priceComponent?.currency_id)?.toUpperCase() ??
              null)
      },
      technicalSheetQrUrl: null
    },
    images: images.map((image, order) => ({ ...image, order })),
    features,
    contact: {
      agentName: null,
      agentAvatarUrl: null,
      phones: [],
      email: null,
      officeName,
      sourceOfficeId
    }
  });
  const galleryExpected = number(artifact.metadata.mercadoLibreGalleryExpected);
  const hasCompleteGallery = galleryExpected !== null && galleryExpected > 0 && images.length === galleryExpected;
  const confidenceScore = 100;
  return {
    input,
    evidence: {
      strategy: artifact.strategy,
      providerKey: PROVIDER_KEY,
      providerVersion: PROVIDER_VERSION,
      confidenceScore,
      gate: 'PASS',
      hasPropertyStructuredData: true,
      hasPropertyLanguage: true,
      imageCandidates: images.length,
      galleryExpected,
      hasCompleteGallery
    },
    complete: true,
    gate: 'PASS',
    confidenceScore
  };
}

async function enrich(artifact: ExtractionArtifact, context: ProviderContext) {
  const state = initialState(artifact.html);
  if (!state) return artifact;
  const gallery = findById(state.components, 'gallery_mosaic');
  const expected = number(gallery?.total_count);
  const counter = array(gallery?.media_counters)
    .map(record)
    .find((item) => item?.type === 'photos');
  const galleryUrlValue = string(counter?.url);
  let images: MercadoLibreImage[] = [];
  if (galleryUrlValue) {
    try {
      const galleryUrl = new URL(galleryUrlValue, artifact.url);
      const sourceUrl = new URL(artifact.url);
      if (galleryUrl.origin === sourceUrl.origin && /^\/vis-modals\/gallery\/MLM\d+\/?$/i.test(galleryUrl.pathname)) {
        const galleryDocument = await context.fetchHtml(galleryUrl.toString());
        images = galleryImages(galleryDocument.html);
      }
    } catch {
      /* The listing data remains usable when the optional gallery request fails. */
    }
  }
  if (!images.length) {
    const initial = [record(gallery?.primary), ...array(gallery?.secondary).map(record)];
    images = initial.flatMap((item) => {
      const id = string(item?.id);
      const url = string(item?.src);
      return id && url ? [{ id, url, alt: string(item?.alt) }] : [];
    });
  } else {
    const preferredIds = [record(gallery?.primary), ...array(gallery?.secondary).map(record)]
      .map((item) => string(item?.id))
      .filter((id): id is string => Boolean(id));
    const byId = new Map(images.map((image) => [image.id, image]));
    images = [
      ...preferredIds.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
      ...images.filter((image) => !preferredIds.includes(image.id))
    ];
  }
  return {
    ...artifact,
    provider: PROVIDER_NAME,
    metadata: {
      ...artifact.metadata,
      providerKey: PROVIDER_KEY,
      providerVersion: PROVIDER_VERSION,
      mercadoLibreState: state,
      mercadoLibreImages: images,
      mercadoLibreGalleryExpected: expected
    }
  };
}

export const mercadoLibreProvider: ImportProvider = {
  key: PROVIDER_KEY,
  name: PROVIDER_NAME,
  version: PROVIDER_VERSION,
  matches(url) {
    return isMercadoLibreHost(url.hostname) && Boolean(mercadoLibreId(url));
  },
  enrich,
  extract: buildInput
};

export const mercadoLibreTestUtils = { parseAssignedJson, galleryImages, initialState };
