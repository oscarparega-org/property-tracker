import assert from 'node:assert/strict';
import { test } from 'vitest';
import { extractDeterministic, type ExtractionArtifact } from '../../src/lib/import-extraction.js';
import { coldwellBankerMexicoProvider } from '../../src/lib/import-providers/coldwell-banker-mx.js';
import { resolveImportProvider } from '../../src/lib/import-providers/registry.js';

const listingUrl =
  'https://coldwellbanker.com.mx/detalle-propiedad/departamento-en-venta-en-del-valle-sur-en-nicolas-san-juan-en-ciudad-de-mexico-68576?id=68576';

function payload() {
  const image = (id: number, suffix: string) => ({
    id,
    tipo: 'IMAGEN',
    principal: id === 1,
    imgSet: {
      sm: `https://cb-crm.s3.us-west-2.amazonaws.com/upload/propiedad/68576/general/departamento_${suffix}-small.png`,
      lg: `https://cb-crm.s3.us-west-2.amazonaws.com/upload/propiedad/68576/general/departamento_${suffix}-large.png`
    }
  });
  return {
    idPropiedad: 68576,
    estatus: 'ACTIVA',
    titulo: 'Departamento en Venta Nicolas San Juan del Valle',
    descripcion: 'Departamento de 141 m² con tres recámaras.',
    tipoInmueble: 'Departamento',
    mls: 'HDV-180-68576',
    calle: 'Nicolas San Juan',
    numeroExt: '1321',
    asentamiento: 'Del Valle Sur',
    municipio: 'Benito Juárez',
    ciudad: 'Ciudad de México',
    cp: '03104',
    lat: '19.3768955',
    lng: '-99.1651439',
    metrosTerreno: 141,
    metrosHabitables: 141,
    numHabitaciones: 3,
    banios: 3,
    antiguedad: 'Más de 30 años',
    calidad: 'Buena',
    orientacion: 'Sin especificar',
    usoSuelo: 'RESIDENCIAL',
    nivelUbicacion: 7,
    condominio: { numNivelEdificio: 13 },
    preciosInmueble: [
      {
        tipoOperacion: 'Venta',
        precio: 5_950_000,
        moneda: 'MXN',
        manteminientoMensual: 2_000,
        monedaMantenimiento: 'MXN'
      }
    ],
    estacionamiento: {
      lista: [{ descripcion: 'Estacionamiento 1', tipo: 'Abierto', aparcamiento: 'Sin espacio fijo' }]
    },
    dtInterior: {
      lista: [
        { descripcion: 'Cuarto de servicio', seleccion: true },
        { descripcion: 'Elevador', seleccion: true },
        { descripcion: 'Estudio', seleccion: false }
      ]
    },
    dtExterior: { lista: [{ descripcion: 'Balcón', seleccion: false }] },
    detalleCondominio: [
      {
        descripcion: 'Seguridad',
        lista: [
          { descripcion: 'Vigilancia 24hrs.', seleccion: true },
          { descripcion: 'Señalización', seleccion: false }
        ]
      }
    ],
    acabadosCompl: [
      {
        descripcion: 'Tecnología',
        lista: [{ descripcion: 'Elevador', seleccion: true }]
      }
    ],
    imagenesInmueble: [image(1, 'principal'), image(2, 'sala')],
    propietario: {
      oficina: 'Coldwell Banker Novac',
      oficinaId: 180,
      email: 'novac@coldwellbanker.com.mx',
      agentes: [
        {
          nombre: 'YOLANDA ÁVILA GARCÍA',
          email: 'yolanda_avila@coldwellbanker.com.mx',
          celular: '5512345678',
          imageUrl: 'https://cb-crm.s3.us-west-2.amazonaws.com/upload/personal/1500/yolanda.png'
        }
      ]
    }
  };
}

function extractPayload(data: unknown) {
  return coldwellBankerMexicoProvider.extract!({
    url: listingUrl,
    provider: 'Coldwell Banker México',
    strategy: 'direct',
    html: '',
    text: '',
    metadata: { coldwellListingData: data }
  })!;
}

test('routes Coldwell Banker México property URLs to its provider', () => {
  assert.equal(resolveImportProvider(new URL(listingUrl)).key, 'coldwell-banker-mx');
  assert.equal(
    resolveImportProvider(
      new URL('https://novac.coldwellbanker.com.mx/detalle-propiedad/departamento-en-venta-en-del-valle-sur-68576')
    ).key,
    'coldwell-banker-mx'
  );
  assert.equal(
    resolveImportProvider(new URL('https://coldwellbanker.com.mx/propiedades-lista?id=68576')).key,
    'generic'
  );
});

test('enriches and extracts the complete Coldwell Banker listing API response', async () => {
  const artifact: ExtractionArtifact = {
    url: listingUrl,
    provider: 'Coldwell Banker México',
    strategy: 'direct',
    html: '<html><head><meta property="og:title" content="Departamento"></head></html>',
    text: 'Departamento en venta',
    metadata: {}
  };
  const enriched = await coldwellBankerMexicoProvider.enrich!(artifact, {
    fetchHtml: async () => {
      throw new Error('not used');
    },
    fetchJson: async (url, options) => {
      assert.equal(url, 'https://coldwellbanker.com.mx/tsf/api/api/propiedad/detalle');
      assert.deepEqual(options, {
        method: 'POST',
        referer: listingUrl,
        body: { propiedadId: 68576, src: 3857, contactoId: null }
      });
      return { url, data: payload() };
    }
  });
  const result = extractDeterministic(enriched);

  assert.equal(result.gate, 'PASS');
  assert.equal(result.confidenceScore, 100);
  assert.equal(result.input.source.provider, 'Coldwell Banker México');
  assert.equal(result.input.source.listingId, '68576');
  assert.equal(result.input.source.listingKey, 'HDV-180-68576');
  assert.equal(result.input.source.rawMetadata.providerKey, 'coldwell-banker-mx');
  assert.equal(result.input.source.rawMetadata.source, 'listing-api');
  assert.deepEqual(result.input.property.price, { amount: 5_950_000, currency: 'MXN' });
  assert.equal(result.input.property.address.street, 'Nicolas San Juan');
  assert.equal(result.input.property.address.exteriorNumber, '1321');
  assert.equal(result.input.property.address.neighborhood, 'Del Valle Sur');
  assert.equal(
    result.input.property.address.formatted,
    'Nicolas San Juan 1321, Del Valle Sur, Benito Juárez, Ciudad de México, 03104'
  );
  assert.deepEqual(result.input.property.coordinates, { latitude: 19.3768955, longitude: -99.1651439 });
  assert.equal(result.input.property.details.constructionAreaM2, 141);
  assert.equal(result.input.property.details.bedrooms, 3);
  assert.equal(result.input.property.details.bathrooms, 3);
  assert.equal(result.input.property.details.parkingSpaces, 1);
  assert.equal(result.input.property.details.parkingType, 'Abierto · Sin espacio fijo');
  assert.equal(result.input.property.details.serviceRoom, true);
  assert.equal(result.input.property.details.propertyAgeYears, null);
  assert.equal(result.input.property.details.buildingLevels, 13);
  assert.equal(result.input.property.details.unitFloor, 7);
  assert.equal(result.input.property.details.maintenanceAmount, 2_000);
  assert.deepEqual(result.input.features, [
    { category: 'AREA', name: 'Cuarto de servicio' },
    { category: 'AREA', name: 'Elevador' },
    { category: 'EQUIPMENT', name: 'Vigilancia 24hrs.' }
  ]);
  assert.equal(result.input.images.length, 2);
  assert.equal(result.evidence.hasCompleteGallery, true);
  assert.equal(result.input.contact.agentName, 'YOLANDA ÁVILA GARCÍA');
  assert.deepEqual(result.input.contact.phones, ['5512345678']);
  assert.equal(result.input.contact.officeName, 'Coldwell Banker Novac');
  assert.equal(result.input.contact.sourceOfficeId, '180');
});

test('rejects a mismatched listing API response', async () => {
  const artifact: ExtractionArtifact = {
    url: listingUrl,
    provider: 'Coldwell Banker México',
    strategy: 'direct',
    html: '<html></html>',
    text: 'Departamento',
    metadata: {}
  };
  const enriched = await coldwellBankerMexicoProvider.enrich!(artifact, {
    fetchHtml: async () => ({ url: listingUrl, html: '' }),
    fetchJson: async (url) => ({ url, data: { ...payload(), idPropiedad: 99999 } })
  });

  assert.equal(enriched.metadata.coldwellListingData, undefined);
});

test('preserves explicit false service-room data and unknown parking data', () => {
  const data = payload();
  data.dtInterior.lista[0]!.seleccion = false;
  const withoutParking = { ...data, estacionamiento: undefined };
  const result = extractPayload(withoutParking);

  assert.equal(result.input.property.details.serviceRoom, false);
  assert.equal(result.input.property.details.parkingSpaces, null);
  assert.equal(result.input.property.details.parkingType, null);
});

test('keeps service-room data unknown when the API omits that feature', () => {
  const data = payload();
  data.dtInterior.lista = data.dtInterior.lista.filter((item) => item.descripcion !== 'Cuarto de servicio');
  const result = extractPayload(data);

  assert.equal(result.input.property.details.serviceRoom, null);
});
