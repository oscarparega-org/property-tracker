import { propertyInputSchema, type PropertyInput } from '@house-tracker/shared';
import type { DirectExtraction, ExtractionArtifact } from '../import-types.js';
import type { ImportProvider } from './types.js';
import { attribute, decodeEntities, meta } from './primitives.js';

const PROVIDER_KEY = 'tecnocasa-mx';
const PROVIDER_NAME = 'Tecnocasa México';
const PROVIDER_VERSION = '1';

function text(value: string | null | undefined) {
  if (!value) return null;
  const result = decodeEntities(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  return result || null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function elementInnerHtmlByClass(html: string, className: string) {
  const startPattern = new RegExp(
    `<([a-z][\\w-]*)\\b[^>]*class=["'][^"']*\\b${escapeRegex(className)}\\b[^"']*["'][^>]*>`,
    'i'
  );
  const start = startPattern.exec(html);
  if (!start) return null;
  const tagName = start[1]!;
  const contentStart = start.index + start[0].length;
  const tags = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tags.lastIndex = contentStart;
  let depth = 1;
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    if (/^<\//.test(match[0])) depth -= 1;
    else if (!/\/>$/.test(match[0])) depth += 1;
    if (depth === 0) return html.slice(contentStart, match.index);
  }
  return null;
}

function textByClass(html: string, className: string) {
  return text(elementInnerHtmlByClass(html, className));
}

function number(value: string | null) {
  if (!value) return null;
  const numeric = value.match(/-?\d[\d.,]*/)?.[0];
  if (!numeric) return null;
  const parsed = Number(numeric.replace(/,(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function integer(value: string | null) {
  const parsed = number(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function booleanSpanish(value: string | null) {
  if (/^s[ií]$/i.test(value ?? '')) return true;
  if (/^no$/i.test(value ?? '')) return false;
  return null;
}

function propertyType(value: string): PropertyInput['property']['propertyType'] {
  if (/departamento/i.test(value)) return 'APARTMENT';
  if (/\bcasa\b/i.test(value)) return 'HOUSE';
  if (/terreno/i.test(value)) return 'LAND';
  return 'OTHER';
}

function listingId(url: URL) {
  return url.pathname.match(/^\/detalle-inmueble\/venta-[a-z0-9-]+-(\d+)tc\/?$/i)?.[1] ?? null;
}

function featureTable(html: string) {
  const heading = html.search(/>\s*Caracter[ií]sticas del Inmueble\s*</i);
  if (heading < 0) return new Map<string, string>();
  const table = html.slice(heading).match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? '';
  const result = new Map<string, string>();
  for (const row of table.matchAll(
    /<tr\b[^>]*>\s*<td\b[^>]*>([\s\S]*?)<\/[^>]*td>\s*<td\b[^>]*>([\s\S]*?)<\/[^>]*td>/gi
  )) {
    const name = text(row[1]);
    const value = text(row[2]);
    if (name && value) result.set(name.toLocaleLowerCase('es-MX'), value);
  }
  return result;
}

function feature(features: Map<string, string>, ...names: string[]) {
  for (const name of names) {
    const value = features.get(name.toLocaleLowerCase('es-MX'));
    if (value) return value;
  }
  return null;
}

function addressFromTitle(title: string) {
  const location = title.split(/\s+-\s+/, 2)[1] ?? '';
  const parts = location.split(',').map((part) => part.trim());
  const streetValue = parts[0] || null;
  const neighborhood =
    parts
      .find((part) => /^col\.?\s+/i.test(part))
      ?.replace(/^col\.?\s+/i, '')
      .trim() || null;
  const streetMatch = streetValue?.match(/^(.*?)\s+(\d+[A-Za-z-]*)$/);
  return {
    street: streetMatch?.[1]?.trim() || streetValue,
    exteriorNumber: streetMatch?.[2] ?? null,
    neighborhood
  };
}

function coordinates(html: string) {
  const match = html.match(/\.setView\(\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/i);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 ? { latitude, longitude } : null;
}

function gallery(html: string, id: string) {
  const section = html.match(/<section\b[^>]*id=["']galeria-fotos-mv["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? '';
  const pattern = new RegExp(`^/Upload/\\d{4}/\\d{2}/${escapeRegex(id)}_[A-Za-z0-9_-]+\\.(?:jpe?g|png|webp)$`, 'i');
  const images: string[] = [];
  const tags = section.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const source = attribute(tag, 'src');
    if (!source) continue;
    try {
      const url = new URL(source);
      if (url.protocol !== 'https:' || url.hostname !== 'bdnet.mx' || !pattern.test(url.pathname)) continue;
      url.search = '';
      url.hash = '';
      if (!images.includes(url.toString())) images.push(url.toString());
    } catch {
      // Ignore malformed and third-party images.
    }
  }
  return { images, expected: tags.length };
}

function phones(html: string) {
  const values: string[] = [];
  for (const tag of html.match(/<a\b[^>]*href=["']tel:[^"']+["'][^>]*>/gi) ?? []) {
    const value = attribute(tag, 'href')
      ?.slice(4)
      .replace(/[^\d+]/g, '');
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}

function email(html: string) {
  for (const tag of html.match(/<a\b[^>]*href=["']mailto:[^"']+["'][^>]*>/gi) ?? []) {
    const value = attribute(tag, 'href')?.slice(7).trim().toLowerCase();
    if (value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return value;
  }
  return null;
}

function officeName(html: string) {
  const value = html.match(/<h6\b[^>]*>\s*Oficina:\s*([\s\S]*?)<\/h6>/i)?.[1];
  return text(value);
}

function unmodeledFeatures(features: Map<string, string>) {
  const modeled = new Set([
    'posición',
    'recámaras',
    'baños',
    'estacionamientos',
    'nivel',
    'niveles construidos',
    'antigüedad',
    'uso del suelo',
    'cuota de mantenimiento',
    'cuartos de servicio'
  ]);
  const areas = /jard[ií]n|balc[oó]n|roof garden|terraza|patio|bodega|cuarto de lavado/i;
  return [...features].flatMap(([name, value]) => {
    if (modeled.has(name)) return [];
    const label = `${name.replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase('es-MX'))}: ${value}`;
    return [{ category: areas.test(name) ? ('AREA' as const) : ('EQUIPMENT' as const), name: label }];
  });
}

function extract(artifact: ExtractionArtifact): DirectExtraction | null {
  const id = listingId(new URL(artifact.url));
  const canonicalId = meta(artifact.html, 'og:url')?.match(/-(\d+)tc\/?$/i)?.[1] ?? null;
  const title = textByClass(artifact.html, 'h5-verde');
  const listingKey = artifact.html.match(/\bT-[A-Z0-9]+(?:-[A-Z0-9]+)+\b/i)?.[0]?.toUpperCase() ?? null;
  if (!id || canonicalId !== id || !title || !listingKey) return null;

  const details = featureTable(artifact.html);
  const priceText = textByClass(artifact.html, 'p-detalle');
  const currency = priceText?.match(/\b[A-Z]{3}\b/)?.[0] ?? null;
  const priceAmount = number(priceText);
  const address = addressFromTitle(title);
  const galleryResult = gallery(artifact.html, id);
  const images = galleryResult.images;
  if (!currency || priceAmount === null || details.size === 0 || galleryResult.expected === 0) return null;
  const houseDetails =
    artifact.html.match(/<[^>]+id=["']houseDetails["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] ?? '';
  const area = number(text(houseDetails.match(/<p\b[^>]*>([\s\S]*?m\s*<sup>\s*2\s*<\/sup>[\s\S]*?)<\/p>/i)?.[1]));
  const maintenanceAmount = number(feature(details, 'Cuota de mantenimiento'));
  const maintenanceCurrency = maintenanceAmount === null ? null : currency;
  const serviceRoom = booleanSpanish(feature(details, 'Cuartos de servicio', 'Cuarto de servicio'));
  const orientation = feature(details, 'Orientación');
  const landUse = feature(details, 'Uso del suelo');
  const input = propertyInputSchema.parse({
    schemaVersion: 1,
    source: {
      provider: PROVIDER_NAME,
      url: artifact.url,
      listingId: id,
      listingKey,
      observedAt: new Date().toISOString(),
      rawMetadata: {
        strategy: artifact.strategy,
        providerKey: PROVIDER_KEY,
        providerVersion: PROVIDER_VERSION,
        source: 'server-rendered-html',
        galleryExpected: galleryResult.expected,
        galleryRetrieved: images.length,
        measurementsApproximate: /Medidas aproximadas/i.test(artifact.html)
      }
    },
    property: {
      title,
      description: meta(artifact.html, 'og:description') ?? null,
      propertyType: propertyType(title),
      operationType: 'SALE',
      price: { amount: priceAmount, currency },
      address: {
        street: address.street,
        exteriorNumber: address.exteriorNumber,
        interiorNumber: null,
        neighborhood: address.neighborhood,
        municipality: null,
        state: null,
        postalCode: null,
        countryCode: 'MX',
        formatted: [address.street, address.exteriorNumber, address.neighborhood].filter(Boolean).join(', ') || null
      },
      coordinates: coordinates(artifact.html),
      details: {
        landAreaM2: area,
        constructionAreaM2: null,
        bedrooms: integer(feature(details, 'Recámaras', 'Dormitorios')),
        bathrooms: number(feature(details, 'Baños')),
        parkingSpaces: integer(feature(details, 'Estacionamientos', 'Estacionamiento')),
        parkingType: null,
        serviceRoom,
        propertyAgeYears: null,
        condition: null,
        orientation,
        landUse,
        buildingLevels: integer(feature(details, 'Niveles construidos')),
        unitFloor: integer(feature(details, 'Nivel')),
        maintenanceAmount,
        maintenanceCurrency
      },
      technicalSheetQrUrl: null
    },
    images: images.map((url, order) => ({ url, alt: order === 0 ? title : null, order })),
    features: unmodeledFeatures(details),
    contact: {
      agentName: null,
      agentAvatarUrl: null,
      phones: phones(artifact.html),
      email: email(artifact.html),
      officeName: officeName(artifact.html),
      sourceOfficeId: listingKey.match(/^T-([A-Z0-9]+)-[A-Z0-9]+$/i)?.[1]?.toUpperCase() ?? null
    }
  });
  const hasCompleteGallery = galleryResult.expected > 0 && images.length === galleryResult.expected;
  return {
    input,
    evidence: {
      strategy: artifact.strategy,
      providerKey: PROVIDER_KEY,
      providerVersion: PROVIDER_VERSION,
      confidenceScore: 100,
      gate: 'PASS',
      hasPropertyStructuredData: true,
      hasPropertyLanguage: true,
      imageCandidates: images.length,
      galleryExpected: galleryResult.expected,
      hasCompleteGallery
    },
    complete: true,
    gate: 'PASS',
    confidenceScore: 100
  };
}

export const tecnocasaMexicoProvider: ImportProvider = {
  key: PROVIDER_KEY,
  name: PROVIDER_NAME,
  version: PROVIDER_VERSION,
  matches(url) {
    return (
      /(^|\.)tecnocasa\.(?:mx|com\.mx)$/i.test(url.hostname) &&
      /^\/detalle-inmueble\/venta-[a-z0-9-]+-\d+tc\/?$/i.test(url.pathname)
    );
  },
  extract
};
