import { propertyInputSchema, type PropertyInput } from '@template/shared';
import type { DirectExtraction, ExtractionArtifact } from '../import-extraction.js';
import type { ImportProvider } from './types.js';

const PROVIDER_KEY = 'pulppo';
const PROVIDER_NAME = 'Pulppo';
const PROVIDER_VERSION = '1';

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function number(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = string(value);
  if (!text) return null;
  const parsed = Number(text.replace(/,(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function attribute(tag: string, name: string) {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] ?? null;
}

function propertyPayload(html: string) {
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (attribute(match[1]!, 'id') !== '__NEXT_DATA__') continue;
    try {
      const root = record(JSON.parse(match[2]!) as unknown);
      return record(record(record(root?.props)?.pageProps)?.property);
    } catch {
      return null;
    }
  }
  return null;
}

function propertyType(value: unknown): PropertyInput['property']['propertyType'] {
  const type = string(value);
  if (/departamento/i.test(type ?? '')) return 'APARTMENT';
  if (/\bcasa\b/i.test(type ?? '')) return 'HOUSE';
  if (/terreno/i.test(type ?? '')) return 'LAND';
  return 'OTHER';
}

function publicAddress(value: unknown) {
  const full = string(value);
  if (!full) return { street: null, exteriorNumber: null };
  const match = full.match(/^(.*?)\s+(\d+[A-Za-z-]*)$/);
  return match
    ? { street: match[1]!.trim() || null, exteriorNumber: match[2]! }
    : { street: full, exteriorNumber: null };
}

function safeImage(value: unknown, pattern: RegExp) {
  const source = string(value);
  if (!source) return null;
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || url.hostname !== 'images.pulppo.com' || !pattern.test(url.pathname)) return null;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function maintenanceFromDescription(value: unknown) {
  return number(string(value)?.match(/mantenimiento\s+mensual\s*:\s*\$\s*([\d,.]+)/i)?.[1]);
}

function extract(artifact: ExtractionArtifact): DirectExtraction | null {
  const payload = propertyPayload(artifact.html);
  const listingId = new URL(artifact.url).pathname.match(/^\/propiedad\/([a-f0-9]{24})\/?$/i)?.[1] ?? null;
  if (!payload || !listingId || string(payload._id)?.toLowerCase() !== listingId.toLowerCase()) return null;

  const listing = record(payload.listing);
  const address = record(payload.address);
  const attributes = record(payload.attributes);
  const location = record(address?.location);
  const neighborhoodValue = record(address?.neighborhood);
  const city = record(address?.city);
  const state = record(address?.state);
  const country = record(address?.country);
  const agent = record(payload.agent);
  const company = record(payload.company) ?? record(agent?.company);
  const price = record(listing?.price);
  const rawCoordinates = array(location?.coordinates);
  const longitude = number(rawCoordinates[0]);
  const latitude = number(rawCoordinates[1]);
  const coordinates =
    latitude !== null &&
    longitude !== null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
      ? { latitude, longitude }
      : null;
  if (string(listing?.operation) !== 'sale') return null;

  const title = string(listing?.title);
  const listingKey = string(payload.internalId);
  const publicStreet = publicAddress(address?.publicStreet);
  const neighborhood = string(neighborhoodValue?.name) ?? string(address?.name);
  const municipality = string(city?.name);
  const stateName = string(state?.name);
  const postalCode = string(address?.zip);
  const streetLine = [publicStreet.street, publicStreet.exteriorNumber].filter(Boolean).join(' ') || null;
  if (!title || !listingKey || !streetLine) return null;

  const picturePattern = /^\/property\/[a-f0-9]{24}\/picture_[a-f0-9]{32}\.(?:jpe?g|png|webp)$/i;
  const publicPictures = array(payload.pictures).filter((item) => record(item)?.public !== false);
  const images = [
    ...new Map(
      publicPictures.flatMap((item) => {
        const picture = record(item);
        const url = safeImage(picture?.url, picturePattern);
        return url ? ([[url, { url, alt: string(picture?.description) }]] as const) : [];
      })
    ).values()
  ];
  const features = array(payload.services).flatMap((item) => {
    const service = record(item);
    const name = string(service?.name);
    return name ? [{ category: number(service?.type) === 2 ? ('AREA' as const) : ('EQUIPMENT' as const), name }] : [];
  });
  const agentAvatarUrl = safeImage(
    agent?.profilePicture,
    /^\/property\/contact\/[a-f0-9]{24}\/profile_picture\/[A-Za-z0-9._-]+$/i
  );
  const phones = [
    ...new Set([string(agent?.phone), string(company?.phone)].filter((phone): phone is string => Boolean(phone)))
  ];
  const currency = string(price?.currency)?.toUpperCase() ?? null;
  const maintenanceAmount = maintenanceFromDescription(listing?.description);
  const yearBuild = number(attributes?.yearBuild);

  const input = propertyInputSchema.parse({
    schemaVersion: 1,
    source: {
      provider: PROVIDER_NAME,
      url: artifact.url,
      listingId,
      listingKey,
      observedAt: new Date().toISOString(),
      rawMetadata: {
        strategy: artifact.strategy,
        providerKey: PROVIDER_KEY,
        providerVersion: PROVIDER_VERSION,
        source: 'next-data',
        galleryExpected: publicPictures.length,
        galleryRetrieved: images.length,
        addressRounded: listing?.addressIsRounded === true
      }
    },
    property: {
      title,
      description: string(listing?.description),
      propertyType: propertyType(payload.type),
      operationType: 'SALE',
      price: { amount: number(price?.price) ?? number(listing?.value), currency },
      address: {
        street: publicStreet.street,
        exteriorNumber: publicStreet.exteriorNumber,
        interiorNumber: null,
        neighborhood,
        municipality,
        state: stateName,
        postalCode,
        countryCode: string(country?.id)?.toUpperCase() ?? 'MX',
        formatted: [streetLine, neighborhood, municipality, stateName, postalCode].filter(Boolean).join(', ') || null
      },
      coordinates,
      details: {
        landAreaM2: number(attributes?.totalSurface),
        constructionAreaM2: number(attributes?.roofedSurface),
        bedrooms: number(attributes?.suites),
        bathrooms: number(attributes?.bathrooms),
        parkingSpaces: number(attributes?.parkings),
        parkingType: null,
        serviceRoom: null,
        propertyAgeYears:
          yearBuild !== null && yearBuild > 1800 ? Math.max(0, new Date().getFullYear() - yearBuild) : null,
        condition: string(attributes?.condition),
        orientation: null,
        landUse: null,
        buildingLevels: null,
        unitFloor: null,
        maintenanceAmount,
        maintenanceCurrency: maintenanceAmount === null ? null : currency
      },
      technicalSheetQrUrl: null
    },
    images: images.map((image, order) => ({ ...image, order })),
    features,
    contact: {
      agentName: [string(agent?.firstName), string(agent?.lastName)].filter(Boolean).join(' ') || null,
      agentAvatarUrl,
      phones,
      email: string(agent?.email),
      officeName: string(company?.name),
      sourceOfficeId: string(company?._id)
    }
  });
  const galleryExpected = publicPictures.length;
  const hasCompleteGallery = galleryExpected > 0 && images.length === galleryExpected;
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
      galleryExpected,
      hasCompleteGallery
    },
    complete: true,
    gate: 'PASS',
    confidenceScore: 100
  };
}

export const pulppoProvider: ImportProvider = {
  key: PROVIDER_KEY,
  name: PROVIDER_NAME,
  version: PROVIDER_VERSION,
  matches(url) {
    return (
      (url.hostname === 'mi.pulppo.com' || url.hostname === 'pulppo.com' || url.hostname === 'www.pulppo.com') &&
      /^\/propiedad\/[a-f0-9]{24}\/?$/i.test(url.pathname)
    );
  },
  extract
};
