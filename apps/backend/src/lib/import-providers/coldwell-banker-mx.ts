import { propertyInputSchema, type PropertyInput } from '@house-tracker/shared';
import type { DirectExtraction, ExtractionArtifact } from '../import-types.js';
import type { ImportProvider, ProviderContext } from './types.js';
import { array, record, string } from './primitives.js';

const PROVIDER_KEY = 'coldwell-banker-mx';
const PROVIDER_NAME = 'Coldwell Banker México';
const PROVIDER_VERSION = '1';

function listingId(url: URL) {
  const queryId = url.searchParams.get('id');
  if (queryId && /^\d+$/.test(queryId)) return queryId;
  return url.pathname.match(/-(\d+)\/?$/)?.[1] ?? null;
}

function number(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = string(value);
  if (!text) return null;
  const numeric = text.match(/-?\d[\d.,]*/)?.[0];
  if (!numeric) return null;
  const parsed = Number(numeric.replace(/,(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value: unknown) {
  const parsed = number(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function meaningful(value: unknown) {
  const result = string(value);
  return result && !/^sin especificar$/i.test(result) ? result : null;
}

function exactAge(value: unknown) {
  const match = string(value)?.match(/^\s*(\d+)\s*años?\s*$/i);
  return match ? Number(match[1]) : null;
}

function propertyType(value: unknown): PropertyInput['property']['propertyType'] {
  const type = string(value);
  if (/departamento/i.test(type ?? '')) return 'APARTMENT';
  if (/\bcasa\b/i.test(type ?? '')) return 'HOUSE';
  if (/terreno/i.test(type ?? '')) return 'LAND';
  return 'OTHER';
}

function coldwellPayload(value: unknown, expectedId: string) {
  const payload = record(value);
  return payload && string(payload.idPropiedad) === expectedId ? payload : null;
}

function safeAsset(value: unknown, pathPattern: RegExp) {
  const source = string(value);
  if (!source) return null;
  try {
    const url = new URL(source);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'cb-crm.s3.us-west-2.amazonaws.com' ||
      !pathPattern.test(url.pathname)
    )
      return null;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function selectedNames(value: unknown) {
  const groups = Array.isArray(value) ? value : [value];
  return groups.flatMap((group) =>
    array(record(group)?.lista).flatMap((item) => {
      const entry = record(item);
      const name = string(entry?.descripcion);
      return entry?.seleccion === true && name ? [name] : [];
    })
  );
}

function selectedFlag(value: unknown, description: RegExp) {
  const groups = Array.isArray(value) ? value : [value];
  for (const group of groups) {
    for (const item of array(record(group)?.lista)) {
      const entry = record(item);
      if (!description.test(string(entry?.descripcion) ?? '')) continue;
      return typeof entry?.seleccion === 'boolean' ? entry.seleccion : null;
    }
  }
  return null;
}

function selectedFeatures(payload: Record<string, unknown>) {
  const features: Array<{ category: 'AREA' | 'EQUIPMENT'; name: string }> = [];
  const add = (category: 'AREA' | 'EQUIPMENT', names: string[]) => {
    for (const name of names) {
      if (!features.some((feature) => feature.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es')))
        features.push({ category, name });
    }
  };
  add('AREA', selectedNames(payload.dtInterior));
  add('AREA', selectedNames(payload.dtExterior));
  for (const group of array(payload.detalleCondominio)) {
    const category = /seguridad|tecnolog/i.test(string(record(group)?.descripcion) ?? '') ? 'EQUIPMENT' : 'AREA';
    add(category, selectedNames(group));
  }
  add('EQUIPMENT', selectedNames(payload.acabadosCompl));
  return features;
}

function buildInput(artifact: ExtractionArtifact): DirectExtraction | null {
  const id = listingId(new URL(artifact.url));
  if (!id) return null;
  const payload = coldwellPayload(artifact.metadata.coldwellListingData, id);
  if (!payload) return null;

  const sale = array(payload.preciosInmueble)
    .map(record)
    .find((price) => /venta/i.test(string(price?.tipoOperacion) ?? ''));
  const title = string(payload.titulo);
  const listingKey = string(payload.mls) ?? id;
  if (!sale || !title || !string(payload.tipoInmueble)) return null;

  const street = string(payload.calle);
  const exteriorNumber = string(payload.numeroExt);
  const interiorNumber = string(payload.numeroInt);
  const neighborhood = string(payload.asentamiento);
  const municipality = string(payload.municipio);
  const state = string(payload.ciudad);
  const postalCode = string(payload.cp);
  const streetLine = [street, exteriorNumber].filter(Boolean).join(' ') || null;
  const latitude = number(payload.lat);
  const longitude = number(payload.lng);
  const coordinates =
    latitude !== null &&
    longitude !== null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
      ? { latitude, longitude }
      : null;

  const imageItems = array(payload.imagenesInmueble)
    .map(record)
    .filter((image) => string(image?.tipo) === 'IMAGEN');
  const imagePattern = new RegExp(
    `^/upload/propiedad/${id}/(?:[A-Za-z0-9._~%-]+/)*[A-Za-z0-9._~%-]+\\.(?:jpe?g|png|webp)$`,
    'i'
  );
  const images = [
    ...new Map(
      imageItems.flatMap((image) => {
        const url = safeAsset(record(image?.imgSet)?.lg, imagePattern);
        return url ? ([[url, { url, alt: title }]] as const) : [];
      })
    ).values()
  ];
  const parkingList = record(payload.estacionamiento)?.lista;
  const parkingItems = Array.isArray(parkingList) ? parkingList.map(record) : null;
  const parking = parkingItems?.[0] ?? null;
  const parkingType =
    [meaningful(parking?.tipo), meaningful(parking?.aparcamiento)].filter(Boolean).join(' · ') || null;
  const condominium = record(payload.condominio);
  const owner = record(payload.propietario);
  const agent = array(owner?.agentes).map(record)[0];
  const phones = [
    ...new Set(
      [string(agent?.telefono), string(agent?.celular), string(agent?.phone), string(owner?.telefono)].filter(
        (phone): phone is string => Boolean(phone)
      )
    )
  ];
  const agentAvatarUrl = safeAsset(agent?.imageUrl, /^\/upload\/[A-Za-z0-9._~%/-]+\.(?:jpe?g|png|webp)$/i);
  const maintenanceAmount = number(sale.manteminientoMensual);
  const currency = string(sale.moneda)?.toUpperCase() ?? null;
  const features = selectedFeatures(payload);
  const serviceRoom = selectedFlag(payload.dtInterior, /^cuarto de servicio$/i);

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
        source: 'listing-api',
        status: string(payload.estatus),
        galleryExpected: imageItems.length,
        galleryRetrieved: images.length
      }
    },
    property: {
      title,
      description: string(payload.descripcion),
      propertyType: propertyType(payload.tipoInmueble),
      operationType: 'SALE',
      price: { amount: number(sale.precio), currency },
      address: {
        street,
        exteriorNumber,
        interiorNumber,
        neighborhood,
        municipality,
        state,
        postalCode,
        countryCode: 'MX',
        formatted: [streetLine, neighborhood, municipality, state, postalCode].filter(Boolean).join(', ') || null
      },
      coordinates,
      details: {
        landAreaM2: number(payload.metrosTerreno),
        constructionAreaM2: number(payload.metrosHabitables),
        bedrooms: integer(payload.numHabitaciones),
        bathrooms: number(payload.banios),
        parkingSpaces: parkingItems?.length ?? null,
        parkingType,
        serviceRoom,
        propertyAgeYears: exactAge(payload.antiguedad),
        condition: meaningful(payload.calidad),
        orientation: meaningful(payload.orientacion),
        landUse: meaningful(payload.usoSuelo),
        buildingLevels: integer(condominium?.numNivelEdificio),
        unitFloor: integer(payload.nivelUbicacion),
        maintenanceAmount,
        maintenanceCurrency:
          maintenanceAmount === null ? null : (string(sale.monedaMantenimiento)?.toUpperCase() ?? currency)
      },
      technicalSheetQrUrl: null
    },
    images: images.map((image, order) => ({ ...image, alt: order === 0 ? image.alt : null, order })),
    features,
    contact: {
      agentName: string(agent?.nombre),
      agentAvatarUrl,
      phones,
      email: string(agent?.email) ?? string(owner?.email),
      officeName: string(owner?.oficina),
      sourceOfficeId: string(owner?.oficinaId) ?? string(payload.oficina_id)
    }
  });
  const hasCompleteGallery = imageItems.length > 0 && images.length === imageItems.length;
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
      galleryExpected: imageItems.length,
      hasCompleteGallery
    },
    complete: true,
    gate: 'PASS',
    confidenceScore: 100
  };
}

async function enrich(artifact: ExtractionArtifact, context: ProviderContext) {
  const id = listingId(new URL(artifact.url));
  if (!id) return artifact;
  try {
    const endpoint = new URL('/tsf/api/api/propiedad/detalle', artifact.url);
    const response = await context.fetchJson(endpoint.toString(), {
      method: 'POST',
      referer: artifact.url,
      body: { propiedadId: Number(id), src: 3857, contactoId: null }
    });
    if (!coldwellPayload(response.data, id)) return artifact;
    return {
      ...artifact,
      provider: PROVIDER_NAME,
      metadata: {
        ...artifact.metadata,
        providerKey: PROVIDER_KEY,
        providerVersion: PROVIDER_VERSION,
        coldwellListingData: response.data
      }
    };
  } catch {
    return artifact;
  }
}

export const coldwellBankerMexicoProvider: ImportProvider = {
  key: PROVIDER_KEY,
  name: PROVIDER_NAME,
  version: PROVIDER_VERSION,
  matches(url) {
    return (
      (url.hostname === 'coldwellbanker.com.mx' || url.hostname.endsWith('.coldwellbanker.com.mx')) &&
      /^\/detalle-propiedad(?:\/[^/]*)?\/?$/i.test(url.pathname) &&
      listingId(url) !== null
    );
  },
  enrich,
  extract: buildInput
};
