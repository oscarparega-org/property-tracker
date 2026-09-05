import { propertyInputSchema, type PropertyInput } from "@template/shared";
import type { DirectExtraction, ExtractionArtifact } from "../import-extraction.js";
import type { ImportProvider, ProviderContext } from "./types.js";

const PROVIDER_KEY = "remax-mx";
const PROVIDER_NAME = "RE/MAX México";
const PROVIDER_VERSION = "1";

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function text(value: string | null | undefined) {
  if (!value) return null;
  const result = decodeEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return result || null;
}

function attribute(tag: string, name: string) {
  return decodeEntities(tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? "") || null;
}

function meta(html: string, key: string) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const property = attribute(tag, "property");
    const name = attribute(tag, "name");
    if (property?.toLowerCase() === key.toLowerCase() || name?.toLowerCase() === key.toLowerCase()) return attribute(tag, "content");
  }
  return null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function elementInnerHtmlByClass(html: string, className: string) {
  const startPattern = new RegExp(`<([a-z][\\w-]*)\\b[^>]*class=["'][^"']*\\b${escapeRegex(className)}\\b[^"']*["'][^>]*>`, "i");
  const start = startPattern.exec(html);
  if (!start) return null;
  const tagName = start[1]!;
  const contentStart = start.index + start[0].length;
  const tags = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
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

function tagByClass(html: string, className: string) {
  const pattern = new RegExp(`<[^>]+class=["'][^"']*\\b${escapeRegex(className)}\\b[^"']*["'][^>]*>`, "i");
  return html.match(pattern)?.[0] ?? null;
}

function number(value: string | null) {
  if (!value) return null;
  const numeric = value.match(/-?\d[\d.,]*/)?.[0];
  if (!numeric) return null;
  const parsed = Number(numeric.replace(/,(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value: string | null) {
  const parsed = number(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function booleanSpanish(value: string | null) {
  if (/^s[ií]$/i.test(value ?? "")) return true;
  if (/^no$/i.test(value ?? "")) return false;
  return null;
}

function propertyType(value: string | null): PropertyInput["property"]["propertyType"] {
  if (/departamento/i.test(value ?? "")) return "APARTMENT";
  if (/\bcasa\b/i.test(value ?? "")) return "HOUSE";
  if (/terreno/i.test(value ?? "")) return "LAND";
  return "OTHER";
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function numberFromUnknown(value: unknown) {
  return number(string(value));
}

function remaxPayload(value: unknown) {
  const root = record(value);
  const data = record(root?.data);
  const property = record(data?.propiedad);
  const agent = record(data?.agente);
  const office = record(data?.oficina);
  const details = record(data?.datos);
  return property && agent && office && details ? { property, agent, office, details } : null;
}

function safeCdnUrl(path: unknown, pattern: RegExp) {
  const value = string(path);
  if (!value) return null;
  try {
    const url = new URL(value, "https://cdn.remax.com.mx/");
    if (url.protocol !== "https:" || url.hostname !== "cdn.remax.com.mx" || !pattern.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function buildApiInput(artifact: ExtractionArtifact, payloadValue: unknown): DirectExtraction | null {
  const payload = remaxPayload(payloadValue);
  const listingId = new URL(artifact.url).pathname.match(/^\/propiedad\/(\d+)\/?$/i)?.[1] ?? null;
  if (!payload || !listingId || string(payload.property.propiedad_id) !== listingId || string(payload.property.operacion) !== "1") return null;

  const { property, agent, office, details } = payload;
  const listingKey = string(property.clave);
  const title = string(property.titulo);
  const type = string(property.tipo_nombre);
  if (!listingKey || !title || !type) return null;

  const street = string(property.calle);
  const exteriorNumber = string(property.numero_exterior);
  const interiorNumber = string(property.numero_interior);
  const neighborhood = string(property.colonia_nombre);
  const municipality = string(property.ciudad_nombre);
  const state = string(property.estado_nombre);
  const postalCode = string(property.postal);
  const currency = string(property.moneda)?.toUpperCase() ?? null;
  const streetLine = [street, exteriorNumber].filter(Boolean).join(" ") || null;
  const imagePattern = new RegExp(`^/properties/${escapeRegex(listingId)}/[a-f0-9]+\\.(?:jpe?g|png|webp)$`, "i");
  const images = [...new Set(array(property.imagenes)
    .map((item) => safeCdnUrl(record(item)?.path, imagePattern))
    .filter((url): url is string => Boolean(url)))];
  const featureValues = (value: unknown) => array(value)
    .map((item) => string(record(item)?.datos))
    .filter((name): name is string => Boolean(name));
  const areaFeatures = featureValues(details.areas);
  const equipmentFeatures = featureValues(details.equipos);
  const latitude = numberFromUnknown(property.latitud);
  const longitude = numberFromUnknown(property.longitud);
  const coordinatesValue = latitude !== null && longitude !== null
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    ? { latitude, longitude }
    : null;
  const agentImage = string(agent.imagen);
  const agentAvatarUrl = agentImage ? safeCdnUrl(`agentes/${agentImage}`, /^\/agentes\/[a-z0-9._-]+$/i) : null;
  const phones = [...new Set([string(office.oficina_callpicker), string(office.oficina_telefono), string(agent.celular)].filter((phone): phone is string => Boolean(phone)))];

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
        source: "listing-api",
        galleryExpected: array(property.imagenes).length,
        galleryRetrieved: images.length,
      },
    },
    property: {
      title,
      description: text(string(property.descripcion)),
      propertyType: propertyType(type),
      operationType: "SALE",
      price: { amount: numberFromUnknown(currency === "USD" ? property.usd_corriente : property.mxn_corriente), currency },
      address: {
        street,
        exteriorNumber,
        interiorNumber,
        neighborhood,
        municipality,
        state,
        postalCode,
        countryCode: "MX",
        formatted: [streetLine, neighborhood, municipality, state, postalCode].filter(Boolean).join(", ") || null,
      },
      coordinates: coordinatesValue,
      details: {
        landAreaM2: numberFromUnknown(property.m2_terreno),
        constructionAreaM2: numberFromUnknown(property.m2_construccion),
        bedrooms: numberFromUnknown(property.cuartos),
        bathrooms: numberFromUnknown(property.banos),
        parkingSpaces: numberFromUnknown(property.numero_estacionamientos),
        parkingType: string(property.tipo_estacionamientos),
        serviceRoom: booleanSpanish(string(property.cuarto_de_servicio)),
        propertyAgeYears: numberFromUnknown(property.edad_de_propiedad),
        condition: string(property.conservacion),
        orientation: string(property.orientacion),
        landUse: string(property.uso_suelo),
        buildingLevels: numberFromUnknown(property.niveles),
        unitFloor: numberFromUnknown(property.nivel_encuentra),
        maintenanceAmount: numberFromUnknown(property.mantenimiento),
        maintenanceCurrency: string(property.moneda_mantenimiento)?.toUpperCase() ?? null,
      },
      technicalSheetQrUrl: `https://api.remax.com.mx/files/qrlive/${encodeURIComponent(listingKey)}_QR.png`,
    },
    images: images.map((url, order) => ({ url, alt: order === 0 ? title : null, order })),
    features: [
      ...areaFeatures.map((name) => ({ category: "AREA" as const, name })),
      ...equipmentFeatures.map((name) => ({ category: "EQUIPMENT" as const, name })),
    ],
    contact: {
      agentName: [string(agent.nombre), string(agent.apellido)].filter(Boolean).join(" ") || null,
      agentAvatarUrl,
      phones,
      email: null,
      officeName: string(office.oficina_nombre),
      sourceOfficeId: string(property.oficina_id),
    },
  });
  const galleryExpected = array(property.imagenes).length;
  const hasCompleteGallery = galleryExpected > 0 && images.length === galleryExpected;
  return {
    input,
    evidence: {
      strategy: artifact.strategy,
      providerKey: PROVIDER_KEY,
      providerVersion: PROVIDER_VERSION,
      confidenceScore: 100,
      gate: "PASS",
      hasPropertyStructuredData: true,
      hasPropertyLanguage: true,
      imageCandidates: images.length,
      galleryExpected,
      hasCompleteGallery,
    },
    complete: true,
    gate: "PASS",
    confidenceScore: 100,
  };
}

function featureNames(html: string, containerClass: string) {
  const section = elementInnerHtmlByClass(html, containerClass);
  if (!section) return [];
  return [...section.matchAll(/<span\b[^>]*class=["'][^"']*\btext-dark-gray\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)]
    .map((match) => text(match[1]))
    .filter((value): value is string => Boolean(value));
}

function propertyImages(html: string, listingId: string) {
  const images: string[] = [];
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const source = attribute(tag, "src");
    if (!source) continue;
    let url: URL;
    try { url = new URL(source); } catch { continue; }
    if (url.protocol !== "https:" || url.hostname !== "cdn.remax.com.mx") continue;
    if (!new RegExp(`^/properties/${escapeRegex(listingId)}/[a-f0-9]+\\.(?:jpe?g|png|webp)$`, "i").test(url.pathname)) continue;
    if (!images.includes(url.toString())) images.push(url.toString());
  }
  return images;
}

function phoneNumbers(html: string) {
  const phones: string[] = [];
  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    const href = attribute(tag, "href");
    if (!href?.toLowerCase().startsWith("tel:")) continue;
    const phone = href.slice(4).replace(/[^\d+]/g, "");
    if (phone && !phones.includes(phone)) phones.push(phone);
  }
  return phones;
}

function coordinates(html: string) {
  for (const tag of html.match(/<iframe\b[^>]*>/gi) ?? []) {
    const source = attribute(tag, "src");
    if (!source || !/google\.com\/maps\/embed/i.test(source)) continue;
    const match = source.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
    if (!match) continue;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) return { latitude, longitude };
  }
  return null;
}

function titleFor(html: string) {
  return meta(html, "og:title") ?? `${textByClass(html, "jsTipo") ?? "Propiedad"} en ${textByClass(html, "jsOperacion") ?? "venta"}`;
}

function buildInput(artifact: ExtractionArtifact): DirectExtraction | null {
  const apiResult = buildApiInput(artifact, artifact.metadata.remaxListingData);
  if (apiResult) return apiResult;
  const sourceUrl = new URL(artifact.url);
  const listingId = sourceUrl.pathname.match(/^\/propiedad\/(\d+)\/?$/i)?.[1] ?? null;
  const listingKey = textByClass(artifact.html, "jsClave");
  const type = textByClass(artifact.html, "jsTipo");
  const operation = textByClass(artifact.html, "jsOperacion");
  const title = titleFor(artifact.html);
  if (!listingId || !listingKey || !type || !/venta/i.test(operation ?? "")) return null;

  const street = textByClass(artifact.html, "jsCalle");
  const exteriorNumber = textByClass(artifact.html, "jsNumeroExterior");
  const neighborhood = textByClass(artifact.html, "jsColonia");
  const municipality = textByClass(artifact.html, "jsCiudad");
  const state = textByClass(artifact.html, "jsEstado");
  const postalCode = textByClass(artifact.html, "jsPostal");
  const images = propertyImages(artifact.html, listingId);
  const maintenanceText = textByClass(artifact.html, "jsMantenimiento");
  const levels = textByClass(artifact.html, "jsNiveles")?.match(/(\d+)\s*(?:\((\d+)\))?/);
  const agentAvatarUrl = attribute(tagByClass(artifact.html, "jsAgenteImagen") ?? "", "src");
  const qrUrl = (artifact.html.match(/<img\b[^>]*src=["']([^"']*\/files\/qrlive\/[^"']+)["'][^>]*>/i)?.[1] ?? null);
  const areaFeatures = featureNames(artifact.html, "jsAreas");
  const equipmentFeatures = featureNames(artifact.html, "jsEquipos");

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
        galleryExpected: integer(textByClass(artifact.html, "jsImageCount")),
        galleryRetrieved: images.length,
      },
    },
    property: {
      title,
      description: meta(artifact.html, "og:description") ?? textByClass(artifact.html, "jsDescripcion"),
      propertyType: propertyType(type),
      operationType: "SALE",
      price: { amount: number(textByClass(artifact.html, "jsPrecio")), currency: textByClass(artifact.html, "jsMoneda")?.toUpperCase() ?? null },
      address: {
        street,
        exteriorNumber,
        interiorNumber: null,
        neighborhood,
        municipality,
        state,
        postalCode,
        countryCode: "MX",
        formatted: [street, exteriorNumber, neighborhood, municipality, state, postalCode].filter(Boolean).join(", ") || null,
      },
      coordinates: coordinates(artifact.html),
      details: {
        landAreaM2: number(textByClass(artifact.html, "jsTerreno")),
        constructionAreaM2: number(textByClass(artifact.html, "jsConstruccion")),
        bedrooms: integer(textByClass(artifact.html, "jsCuartos")),
        bathrooms: number(textByClass(artifact.html, "jsBanos")),
        parkingSpaces: integer(textByClass(artifact.html, "jsEstacionamientos")),
        parkingType: textByClass(artifact.html, "jsTipoEstacionamientos"),
        serviceRoom: booleanSpanish(textByClass(artifact.html, "jsCuartoServicio")),
        propertyAgeYears: integer(textByClass(artifact.html, "jsEdad")),
        condition: textByClass(artifact.html, "jsConservacion"),
        orientation: textByClass(artifact.html, "jsOrientacion"),
        landUse: textByClass(artifact.html, "jsUsoSuelo"),
        buildingLevels: levels?.[1] ? Number(levels[1]) : null,
        unitFloor: levels?.[2] ? Number(levels[2]) : null,
        maintenanceAmount: number(maintenanceText),
        maintenanceCurrency: maintenanceText?.match(/\b[A-Z]{3}\b/)?.[0] ?? null,
      },
      technicalSheetQrUrl: qrUrl ? new URL(decodeEntities(qrUrl), artifact.url).toString() : null,
    },
    images: images.map((url, order) => ({ url, alt: order === 0 ? title : null, order })),
    features: [
      ...areaFeatures.map((name) => ({ category: "AREA" as const, name })),
      ...equipmentFeatures.map((name) => ({ category: "EQUIPMENT" as const, name })),
    ],
    contact: {
      agentName: textByClass(artifact.html, "jsAgenteNombre"),
      agentAvatarUrl,
      phones: phoneNumbers(artifact.html),
      email: null,
      officeName: textByClass(artifact.html, "jsOficinaNombre"),
      sourceOfficeId: null,
    },
  });
  const galleryExpected = integer(textByClass(artifact.html, "jsImageCount"));
  const hasCompleteGallery = galleryExpected !== null && galleryExpected > 0 && galleryExpected === images.length;
  const confidenceScore = 100;
  return {
    input,
    evidence: {
      strategy: artifact.strategy,
      providerKey: PROVIDER_KEY,
      providerVersion: PROVIDER_VERSION,
      confidenceScore,
      gate: "PASS",
      hasPropertyStructuredData: true,
      hasPropertyLanguage: true,
      imageCandidates: images.length,
      galleryExpected,
      hasCompleteGallery,
    },
    complete: true,
    gate: "PASS",
    confidenceScore,
  };
}

async function enrich(artifact: ExtractionArtifact, context: ProviderContext) {
  const listingId = new URL(artifact.url).pathname.match(/^\/propiedad\/(\d+)\/?$/i)?.[1];
  if (!listingId) return artifact;
  try {
    const endpoint = new URL(`/ajax/FetchPropiedadFlyerData/${listingId}`, artifact.url);
    const response = await context.fetchJson(endpoint.toString(), { method: "POST", referer: artifact.url });
    if (!remaxPayload(response.data)) return artifact;
    return {
      ...artifact,
      provider: PROVIDER_NAME,
      metadata: {
        ...artifact.metadata,
        providerKey: PROVIDER_KEY,
        providerVersion: PROVIDER_VERSION,
        remaxListingData: response.data,
      },
    };
  } catch {
    return artifact;
  }
}

export const remaxMexicoProvider: ImportProvider = {
  key: PROVIDER_KEY,
  name: PROVIDER_NAME,
  version: PROVIDER_VERSION,
  matches(url) {
    return (url.hostname === "remax.com.mx" || url.hostname.endsWith(".remax.com.mx"))
      && /^\/propiedad\/\d+\/?$/i.test(url.pathname);
  },
  enrich,
  extract: buildInput,
};
