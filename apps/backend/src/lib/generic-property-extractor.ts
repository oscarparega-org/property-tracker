import { propertyInputSchema } from '@house-tracker/shared';
import { resolveImportProvider } from './import-providers/registry.js';
import { decodeEntities, meta } from './import-providers/primitives.js';
import type { DirectExtraction, ExtractionArtifact, ListingGate } from './import-types.js';

function scriptJson(html: string) {
  const results: unknown[] = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    const attrs = match[1]!;
    if (!/application\/ld\+json/i.test(attrs) && !/__NEXT_DATA__/i.test(attrs) && !/application\/json/i.test(attrs))
      continue;
    try {
      results.push(JSON.parse(decodeEntities(match[2]!.trim())));
    } catch {
      // Ignore malformed publisher data and continue with the remaining evidence.
    }
  }
  return results;
}

function valuesForKeys(root: unknown, wanted: RegExp, limit = 80) {
  const values: unknown[] = [];
  const seen = new Set<unknown>();
  function walk(node: unknown, depth: number) {
    if (values.length >= limit || depth > 12 || node === null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.slice(0, 200).forEach((item) => walk(item, depth + 1));
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (wanted.test(key)) values.push(value);
      walk(value, depth + 1);
    }
  }
  walk(root, 0);
  return values;
}

function firstString(values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
    if (value && typeof value === 'object' && 'name' in value && typeof value.name === 'string')
      return value.name.trim();
  }
  return null;
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}(?:\D|$))/g, '');
  const parsed = Number(cleaned.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function firstNumber(values: unknown[]) {
  for (const value of values) {
    const result = numberValue(value);
    if (result !== null) return result;
  }
  return null;
}

function absoluteUrl(value: string, base: string) {
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

function collectImages(data: unknown[], html: string, url: string) {
  const candidates: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === 'string') candidates.push(value);
    else if (Array.isArray(value)) value.forEach(add);
    else if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      add(record.url ?? record.src ?? record.contentUrl ?? record.imageUrl);
    }
  };
  data.forEach((item) => valuesForKeys(item, /^(image|images|photos|gallery|media)$/i, 150).forEach(add));
  const og = meta(html, 'og:image');
  if (og) candidates.unshift(og);
  for (const match of html.matchAll(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)) {
    candidates.push(decodeEntities(match[1]!));
  }
  return [
    ...new Set(
      candidates
        .map((item) => absoluteUrl(item, url))
        .filter((item): item is string => Boolean(item) && /^https?:/.test(item!))
    )
  ].slice(0, 60);
}

function detailsFromText(text: string) {
  const find = (pattern: RegExp) => numberValue(text.match(pattern)?.[1]);
  return {
    bedrooms: find(/(\d+(?:[.,]\d+)?)\s*(?:rec[aá]maras?|habitaciones?)/i),
    bathrooms: find(/(\d+(?:[.,]\d+)?)\s*baños?/i),
    parkingSpaces: find(/(\d+)\s*(?:estacionamientos?|cajones?)/i),
    constructionAreaM2: find(/(\d+(?:[.,]\d+)?)\s*m[²2]\s*(?:de\s*)?(?:construcci[oó]n|construidos?)/i),
    landAreaM2: find(/(\d+(?:[.,]\d+)?)\s*m[²2]\s*(?:de\s*)?(?:terreno|superficie)/i)
  };
}

export function extractDeterministic(artifact: ExtractionArtifact): DirectExtraction {
  const providerResult = resolveImportProvider(new URL(artifact.url)).extract?.(artifact);
  if (providerResult) return providerResult;
  const url = new URL(artifact.url);
  const json = scriptJson(artifact.html);
  const all = [...json, artifact.metadata];
  const title =
    meta(artifact.html, 'og:title') ??
    meta(artifact.html, 'twitter:title') ??
    firstString(all.flatMap((item) => valuesForKeys(item, /^(name|headline|title)$/i))) ??
    artifact.metadata.title;
  const description =
    meta(artifact.html, 'og:description') ??
    meta(artifact.html, 'description') ??
    firstString(all.flatMap((item) => valuesForKeys(item, /^(description|summary)$/i)));
  const price = firstNumber(all.flatMap((item) => valuesForKeys(item, /^(price|priceAmount|amount|salePrice)$/i)));
  const currency =
    firstString(all.flatMap((item) => valuesForKeys(item, /^(priceCurrency|currency|currencyCode)$/i)))
      ?.toUpperCase()
      .slice(0, 3) ?? (price === null ? null : 'MXN');
  const addressObject = all
    .flatMap((item) => valuesForKeys(item, /^address$/i))
    .find((value) => value && typeof value === 'object') as Record<string, unknown> | undefined;
  const latitude = firstNumber(all.flatMap((item) => valuesForKeys(item, /^(latitude|lat)$/i)));
  const longitude = firstNumber(all.flatMap((item) => valuesForKeys(item, /^(longitude|lng|lon)$/i)));
  const textDetails = detailsFromText(artifact.text);
  const images = collectImages(all, artifact.html, artifact.url);
  const typeText = `${String(title ?? '')} ${artifact.text.slice(0, 1000)}`;
  const propertyType = /departamento|apartment/i.test(typeText)
    ? 'APARTMENT'
    : /casa|house/i.test(typeText)
      ? 'HOUSE'
      : /terreno|land/i.test(typeText)
        ? 'LAND'
        : 'OTHER';
  const pathId = url.pathname.split('/').filter(Boolean).at(-1) ?? null;
  const formatted =
    typeof addressObject?.name === 'string'
      ? addressObject.name
      : typeof addressObject?.streetAddress === 'string'
        ? [
            addressObject.streetAddress,
            addressObject.addressLocality,
            addressObject.addressRegion,
            addressObject.postalCode
          ]
            .filter(Boolean)
            .join(', ')
        : firstString(all.flatMap((item) => valuesForKeys(item, /^(formattedAddress|fullAddress|locationName)$/i)));
  const input = propertyInputSchema.parse({
    schemaVersion: 1,
    source: {
      provider: artifact.provider,
      url: artifact.url,
      listingId: pathId,
      listingKey: pathId,
      observedAt: new Date().toISOString(),
      rawMetadata: { strategy: artifact.strategy, metadata: artifact.metadata, structuredData: json.slice(0, 12) }
    },
    property: {
      title: String(title ?? `${artifact.provider} · ${pathId ?? 'Propiedad'}`).slice(0, 300),
      description: description ? String(description) : null,
      propertyType,
      operationType: 'SALE',
      price: { amount: price, currency },
      address: {
        street: typeof addressObject?.streetAddress === 'string' ? addressObject.streetAddress : null,
        exteriorNumber: null,
        interiorNumber: null,
        neighborhood: firstString(all.flatMap((item) => valuesForKeys(item, /^(neighborhood|colony|suburb)$/i))),
        municipality: typeof addressObject?.addressLocality === 'string' ? addressObject.addressLocality : null,
        state: typeof addressObject?.addressRegion === 'string' ? addressObject.addressRegion : null,
        postalCode: addressObject?.postalCode ? String(addressObject.postalCode) : null,
        countryCode: 'MX',
        formatted
      },
      coordinates:
        latitude !== null && longitude !== null && latitude <= 90 && longitude <= 180 ? { latitude, longitude } : null,
      details: {
        landAreaM2:
          firstNumber(all.flatMap((item) => valuesForKeys(item, /^(landArea|lotArea|landAreaM2)$/i))) ??
          textDetails.landAreaM2,
        constructionAreaM2:
          firstNumber(
            all.flatMap((item) => valuesForKeys(item, /^(floorSize|constructionArea|builtArea|constructionAreaM2)$/i))
          ) ?? textDetails.constructionAreaM2,
        bedrooms:
          firstNumber(all.flatMap((item) => valuesForKeys(item, /^(bedrooms|numberOfBedrooms|bedroomCount)$/i))) ??
          textDetails.bedrooms,
        bathrooms:
          firstNumber(
            all.flatMap((item) => valuesForKeys(item, /^(bathrooms|numberOfBathroomsTotal|bathroomCount)$/i))
          ) ?? textDetails.bathrooms,
        parkingSpaces:
          firstNumber(all.flatMap((item) => valuesForKeys(item, /^(parkingSpaces|garages|parking)$/i))) ??
          textDetails.parkingSpaces,
        parkingType: null,
        serviceRoom: null,
        propertyAgeYears: null,
        condition: null,
        orientation: null,
        landUse: null,
        buildingLevels: null,
        unitFloor: null,
        maintenanceAmount: null,
        maintenanceCurrency: null
      },
      technicalSheetQrUrl: null
    },
    images: images.map((image, order) => ({
      url: image,
      alt: order === 0 ? String(title ?? 'Propiedad') : null,
      order
    })),
    features: [],
    contact: {
      agentName: firstString(all.flatMap((item) => valuesForKeys(item, /^(agentName|brokerName|sellerName)$/i))),
      agentAvatarUrl: null,
      phones: [],
      email: null,
      officeName: null,
      sourceOfficeId: null
    }
  });
  const structuredTypes = all
    .flatMap((item) => valuesForKeys(item, /^@type$/i, 40))
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === 'string');
  const hasPropertyStructuredData = structuredTypes.some((value) =>
    /^(house|apartment|residence|singlefamilyresidence|realestatelisting|accommodation)$/i.test(value)
  );
  const hasPropertyLanguage =
    /\b(?:casa|departamento|terreno|inmueble|propiedad|rec[aá]maras?|habitaciones?|baños?|venta|renta|m[²2]\s*(?:de\s*)?(?:construcci[oó]n|terreno))\b/i.test(
      `${String(title ?? '')} ${artifact.text.slice(0, 20_000)}`
    );
  const hasLocation = Boolean(
    input.property.address.formatted ||
    input.property.coordinates ||
    input.property.address.municipality ||
    input.property.address.state
  );
  const hasDetails = Object.values(input.property.details).some((value) => value !== null);
  const confidenceScore = Math.min(
    100,
    (hasPropertyStructuredData ? 35 : 0) +
      (input.property.price.amount !== null ? 20 : 0) +
      (hasLocation ? 15 : 0) +
      (hasDetails ? 15 : 0) +
      (hasPropertyLanguage ? 10 : 0) +
      (input.images.length ? 5 : 0)
  );
  const gate: ListingGate = confidenceScore >= 55 ? 'PASS' : confidenceScore > 0 ? 'BORDERLINE' : 'ZERO';
  return {
    input,
    evidence: {
      strategy: artifact.strategy,
      jsonDocuments: json.length,
      textCharacters: artifact.text.length,
      imageCandidates: images.length,
      confidenceScore,
      gate,
      hasPropertyStructuredData,
      hasPropertyLanguage
    },
    complete: gate === 'PASS',
    gate,
    confidenceScore
  };
}
