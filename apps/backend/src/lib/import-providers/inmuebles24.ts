import { propertyInputSchema, type PropertyInput } from '@house-tracker/shared';
import type { DirectExtraction, ExtractionArtifact } from '../import-types.js';
import type { ImportProvider } from './types.js';
import { array, decodeEntities, record, string, type JsonRecord } from './primitives.js';

const PROVIDER_KEY = 'inmuebles24';
const PROVIDER_NAME = 'Inmuebles24';
const PROVIDER_VERSION = '1';

function listingId(url: URL) {
  return url.pathname.match(/-(\d+)\.html\/?$/i)?.[1] ?? null;
}

function balancedJsonAfter(html: string, marker: RegExp) {
  const match = marker.exec(html);
  if (!match) return null;
  const remainder = html.slice(match.index + match[0].length);
  const start = remainder.match(/^\s*([[{])/)?.index;
  if (start === undefined) return null;
  const leadingWhitespace = remainder.match(/^\s*/)?.[0].length ?? 0;
  const absoluteStart = match.index + match[0].length + leadingWhitespace;
  const opening = html[absoluteStart];
  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = absoluteStart; index < html.length; index += 1) {
    const character = html[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === opening) depth += 1;
    else if (character === closing && --depth === 0) {
      try {
        return JSON.parse(html.slice(absoluteStart, index + 1)) as unknown;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function jsonField(html: string, field: string) {
  return balancedJsonAfter(html, new RegExp(`["']${field}["']\\s*:\\s*`, 'i'));
}

function jsonConstant(html: string, name: string) {
  return balancedJsonAfter(html, new RegExp(`\\bconst\\s+${name}\\s*=\\s*`, 'i'));
}

function quotedValue(html: string, name: string, kind: 'field' | 'constant' = 'field') {
  const prefix = kind === 'constant' ? `\\bconst\\s+${name}\\s*=\\s*` : `["']${name}["']\\s*:\\s*`;
  const match = html.match(new RegExp(`${prefix}(?:"((?:\\\\.|[^"\\\\])*)"|'((?:\\\\.|[^'\\\\])*)')`, 'i'));
  if (!match) return null;
  if (match[1] !== undefined) {
    try {
      return JSON.parse(`"${match[1]}"`) as string;
    } catch {
      return null;
    }
  }
  return match[2]!.replace(/\\'/g, "'").replace(/\\\\/g, '\\').trim() || null;
}

function number(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = string(value);
  if (!text) return null;
  const parsed = Number(
    text
      .replace(/[^\d.,-]/g, '')
      .replace(/,(?=\d{3}(?:\D|$))/g, '')
      .replace(',', '.')
  );
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function integer(value: unknown) {
  const parsed = number(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function jsonLdProperty(html: string) {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = record(JSON.parse(decodeEntities(match[1]!.trim())) as unknown);
      const type = string(value?.['@type']);
      if (type && /^(Apartment|House|Residence|SingleFamilyResidence)$/i.test(type)) return value;
    } catch {
      // Ignore unrelated or malformed publisher data.
    }
  }
  return null;
}

function featureValue(features: JsonRecord | null, id: string) {
  return record(features?.[id])?.value;
}

function locationParts(value: unknown) {
  const parts = new Map<string, string>();
  let current = record(value);
  for (let depth = 0; current && depth < 6; depth += 1) {
    const label = string(current.label)?.toUpperCase();
    const name = string(current.name);
    if (label && name) parts.set(label, name);
    current = record(current.parent);
  }
  return {
    neighborhood: parts.get('ZONA') ?? null,
    municipality: parts.get('CIUDAD') ?? null,
    state: parts.get('PROVINCIA') ?? null
  };
}

function streetAddress(value: unknown) {
  const full = string(record(value)?.name);
  if (!full) return { street: null, exteriorNumber: null, formatted: null };
  const match = full.match(/^(.*?)\s+(\d+[A-Za-z-]*)$/);
  return {
    street: match?.[1]?.trim() || full,
    exteriorNumber: match?.[2] ?? null,
    formatted: full
  };
}

function coordinate(html: string, name: string) {
  const encoded = quotedValue(html, name, 'constant');
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  const parsed = Number(Buffer.from(encoded, 'base64').toString('utf8'));
  return Number.isFinite(parsed) ? parsed : null;
}

function propertyType(value: unknown, title: string): PropertyInput['property']['propertyType'] {
  const type = string(record(value)?.name) ?? string(value) ?? title;
  if (/apartamento|departamento/i.test(type)) return 'APARTMENT';
  if (/\bcasa\b/i.test(type)) return 'HOUSE';
  if (/terreno/i.test(type)) return 'LAND';
  return 'OTHER';
}

function safeImage(value: unknown) {
  const source = string(value);
  if (!source) return null;
  try {
    const url = new URL(source);
    if (
      url.protocol !== 'https:' ||
      !/^img\d+\.naventcdn\.com$/i.test(url.hostname) ||
      !/^\/avisos\/(?:resize\/)?[\d/]+\/(?:\d+x\d+\/)?[^/]+\.(?:jpe?g|png|webp)$/i.test(url.pathname)
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extract(artifact: ExtractionArtifact): DirectExtraction | null {
  const url = new URL(artifact.url);
  const id = listingId(url);
  const avisoStart = artifact.html.search(/\bconst\s+avisoInfo\s*=/i);
  if (avisoStart < 0) return null;
  const aviso = artifact.html.slice(avisoStart);
  const embeddedId = quotedValue(aviso, 'idAviso');
  if (!id || embeddedId !== id) return null;

  const pricesData = array(jsonField(aviso, 'pricesData'));
  const sale = pricesData.map(record).find((item) => /venta/i.test(string(record(item?.operationType)?.name) ?? ''));
  if (!sale) return null;
  const price = record(array(sale.prices).map(record)[0]);
  const title = quotedValue(aviso, 'postingTitle');
  if (!title) return null;

  const ld = jsonLdProperty(artifact.html);
  const descriptionHtml = quotedValue(aviso, 'description');
  const description = descriptionHtml
    ? decodeEntities(descriptionHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
        .replace(/[ \t]+/g, ' ')
        .trim()
    : string(ld?.description);
  const address = streetAddress(jsonField(aviso, 'address'));
  const location = locationParts(jsonField(aviso, 'location'));
  const mainFeatures = record(jsonConstant(artifact.html, 'mainFeatures'));
  const publisher = record(jsonConstant(artifact.html, 'publisher')) ?? record(jsonField(aviso, 'publisher'));
  const pictures = array(jsonField(aviso, 'pictures')).map(record);
  const images = [
    ...new Map(
      pictures.flatMap((picture) => {
        const imageUrl = safeImage(picture?.url1200x1200) ?? safeImage(picture?.resizeUrl1200x1200);
        return imageUrl ? ([[imageUrl, { url: imageUrl, alt: string(picture?.title) }]] as const) : [];
      })
    ).values()
  ];
  const latitude = coordinate(artifact.html, 'mapLatOf');
  const longitude = coordinate(artifact.html, 'mapLngOf');
  const coordinates =
    latitude !== null &&
    longitude !== null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
      ? { latitude, longitude }
      : null;
  const listingKey = quotedValue(aviso, 'postingCode') ?? id;
  const formattedAddress = [address.formatted, location.neighborhood, location.municipality, location.state]
    .filter(Boolean)
    .join(', ');
  const phone = quotedValue(aviso, 'whatsApp') ?? string(ld?.telephone);
  const maintenanceAmount = number(quotedValue(aviso, 'expenses'));
  const currency = string(price?.isoCode)?.toUpperCase() ?? null;
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
        source: 'aviso-info',
        galleryExpected: pictures.length,
        galleryRetrieved: images.length
      }
    },
    property: {
      title,
      description,
      propertyType: propertyType(jsonField(aviso, 'propertyType'), title),
      operationType: 'SALE',
      price: { amount: number(price?.amount), currency },
      address: {
        street: address.street,
        exteriorNumber: address.exteriorNumber,
        interiorNumber: null,
        neighborhood: location.neighborhood,
        municipality: location.municipality,
        state: location.state,
        postalCode: null,
        countryCode: 'MX',
        formatted: formattedAddress || null
      },
      coordinates,
      details: {
        landAreaM2: number(featureValue(mainFeatures, 'CFT100')),
        constructionAreaM2: number(featureValue(mainFeatures, 'CFT101')) ?? number(record(ld?.floorSize)?.value),
        bedrooms: integer(featureValue(mainFeatures, 'CFT2')) ?? integer(ld?.numberOfBedrooms),
        bathrooms: number(featureValue(mainFeatures, 'CFT3')) ?? number(ld?.numberOfBathroomsTotal),
        parkingSpaces: integer(featureValue(mainFeatures, 'CFT7')),
        parkingType: null,
        serviceRoom: null,
        propertyAgeYears: integer(featureValue(mainFeatures, 'CFT5')),
        condition: null,
        orientation: null,
        landUse: null,
        buildingLevels: null,
        unitFloor: null,
        maintenanceAmount,
        maintenanceCurrency: maintenanceAmount === null ? null : currency
      },
      technicalSheetQrUrl: null
    },
    images: images.map((image, order) => ({ ...image, alt: image.alt ?? (order === 0 ? title : null), order })),
    features: [],
    contact: {
      agentName: null,
      agentAvatarUrl: null,
      phones: phone ? [phone] : [],
      email: null,
      officeName: string(publisher?.name),
      sourceOfficeId: string(publisher?.publisherId) ?? string(publisher?.id)
    }
  });
  const hasCompleteGallery = pictures.length > 0 && images.length === pictures.length;
  return {
    input,
    evidence: {
      strategy: artifact.strategy,
      providerKey: PROVIDER_KEY,
      providerVersion: PROVIDER_VERSION,
      confidenceScore: 100,
      gate: 'PASS',
      hasPropertyStructuredData: Boolean(ld),
      hasPropertyLanguage: true,
      imageCandidates: images.length,
      galleryExpected: pictures.length,
      hasCompleteGallery
    },
    complete: true,
    gate: 'PASS',
    confidenceScore: 100
  };
}

export const inmuebles24Provider: ImportProvider = {
  key: PROVIDER_KEY,
  name: PROVIDER_NAME,
  version: PROVIDER_VERSION,
  requiresRenderedFetch: true,
  matches(url) {
    return (url.hostname === 'inmuebles24.com' || url.hostname.endsWith('.inmuebles24.com')) && Boolean(listingId(url));
  },
  extract
};
