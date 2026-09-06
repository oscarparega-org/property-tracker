import assert from 'node:assert/strict';
import { test } from 'vitest';
import { extractDeterministic, type ExtractionArtifact } from '../../src/lib/import-extraction.js';
import { resolveImportProvider } from '../../src/lib/import-providers/registry.js';

const listingId = '75222';
const url = `https://www.tecnocasa.mx/detalle-inmueble/venta-departamento-del-valle-norte-${listingId}tc`;

function fixture() {
  const images = [
    '75222_cb7963.jpeg',
    '75222_016bfc.jpeg',
    '75222_72befa.jpeg',
    '75222_8eb9db.jpeg',
    '75222_4680e4.jpeg',
    '75222_33c2b4.jpeg',
    '75222_83cd28.jpeg',
    '75222_90e634.jpeg',
    '75222_335c5c.jpeg',
    '75222_99135e.jpeg',
    '75222_82824b.jpeg'
  ];
  return `<!doctype html><html><head>
    <meta property="og:url" content="${url}" />
    <meta property="og:description" content="DEPARTAMENTO DE 154 M2 APROX CON 3 RECAMARAS 2 BAÑOS COMPLETOS MEDIO BAÑO COCINA EQUIPADA CUARTO DE LAVADO INTEGRADO AL DEPARTAMENTO 1 ESTACIONAMIENTO." />
  </head><body>
    <section id="galeria-fotos-mv"><div>${images
      .map((image) => `<img src="https://bdnet.mx/Upload/2026/04/${image}" alt="Slide Image">`)
      .join('')}</div></section>
    <h3 class="h5-verde">DEPARTAMENTO - CERRADA AMORES, COL. DEL VALLE NORTE</h3>
    <p>T-DF0014-0546</p>
    <p class="p-detalle div-verde">6,200,000 MXN</p>
    <div id="houseDetails"><div><p class="ficha-card-transparente">154m<sup>2</sup> *</p></div></div>
    <h3>Características del Inmueble</h3>
    <table><tbody>
      <tr><td>Posición</td><td>EXTERIOR</td></tr>
      <tr><td>Recámaras</td><td>3</td></tr>
      <tr><td>Baños</td><td>3</td></tr>
      <tr><td>Cocina</td><td>EQUIPADA</td></tr>
      <tr><td>Estacionamientos</td><td>1</td></tr>
      <tr><td>Niveles construidos</td><td>7</td></tr>
      <tr><td>Antigüedad</td><td>MAS DE 30</td></tr>
      <tr><td>Uso del suelo</td><td>HABITACIONAL</td></tr>
      <tr><td>Elevador</td><td>SI</td></tr>
      <tr><td>Cuarto de lavado</td><td>SI</td></tr>
      <tr><td>Balcon</td><td>SI</td></tr>
      <tr><td>1/2 Baño</td><td>SI</td></tr>
    </tbody></table>
    <p>* Medidas aproximadas</p>
    <h6>Oficina: DEL VALLE</h6>
    <a href="mailto:delvalle@tecnocasa.mx">correo</a>
    <a href="tel:+525590037728">5590037728</a>
    <a href="tel:+525590037729">5590037729</a>
    <script>var map = L.map('dibuja_mapa').setView([19.39533, -99.16309], 16);</script>
  </body></html>`;
}

test('routes only Tecnocasa Mexico sale detail URLs to its provider', () => {
  assert.equal(resolveImportProvider(new URL(url)).key, 'tecnocasa-mx');
  assert.equal(
    resolveImportProvider(new URL(`https://tecnocasa.com.mx/detalle-inmueble/venta-casa-del-valle-${listingId}tc`)).key,
    'tecnocasa-mx'
  );
  assert.equal(resolveImportProvider(new URL('https://www.tecnocasa.mx/busca-tu-casa/TODOS')).key, 'generic');
  assert.equal(
    resolveImportProvider(new URL(`https://www.tecnocasa.mx/detalle-inmueble/renta-departamento-${listingId}tc`)).key,
    'generic'
  );
});

test('extracts the Tecnocasa listing and exact ordered gallery', () => {
  const artifact: ExtractionArtifact = {
    url,
    provider: 'Tecnocasa México',
    strategy: 'direct',
    html: fixture(),
    text: 'Departamento en venta en Del Valle Norte',
    metadata: {}
  };
  const result = extractDeterministic(artifact);

  assert.equal(result.gate, 'PASS');
  assert.equal(result.confidenceScore, 100);
  assert.equal(result.input.source.listingId, listingId);
  assert.equal(result.input.source.listingKey, 'T-DF0014-0546');
  assert.equal(result.input.source.rawMetadata.providerKey, 'tecnocasa-mx');
  assert.equal(result.input.source.rawMetadata.measurementsApproximate, true);
  assert.equal(result.input.property.title, 'DEPARTAMENTO - CERRADA AMORES, COL. DEL VALLE NORTE');
  assert.deepEqual(result.input.property.price, { amount: 6_200_000, currency: 'MXN' });
  assert.equal(result.input.property.propertyType, 'APARTMENT');
  assert.equal(result.input.property.address.street, 'CERRADA AMORES');
  assert.equal(result.input.property.address.neighborhood, 'DEL VALLE NORTE');
  assert.deepEqual(result.input.property.coordinates, { latitude: 19.39533, longitude: -99.16309 });
  assert.equal(result.input.property.details.landAreaM2, 154);
  assert.equal(result.input.property.details.constructionAreaM2, null);
  assert.equal(result.input.property.details.bedrooms, 3);
  assert.equal(result.input.property.details.bathrooms, 3);
  assert.equal(result.input.property.details.parkingSpaces, 1);
  assert.equal(result.input.property.details.buildingLevels, 7);
  assert.equal(result.input.property.details.landUse, 'HABITACIONAL');
  assert.equal(result.input.contact.officeName, 'DEL VALLE');
  assert.equal(result.input.contact.sourceOfficeId, 'DF0014');
  assert.equal(result.input.contact.email, 'delvalle@tecnocasa.mx');
  assert.deepEqual(result.input.contact.phones, ['+525590037728', '+525590037729']);
  assert.equal(result.input.images.length, 11);
  assert.match(result.input.images[0]!.url, /75222_cb7963\.jpeg$/);
  assert.match(result.input.images[10]!.url, /75222_82824b\.jpeg$/);
  assert.equal(result.evidence.hasCompleteGallery, true);
  assert.deepEqual(result.input.features, [
    { category: 'EQUIPMENT', name: 'Cocina: EQUIPADA' },
    { category: 'EQUIPMENT', name: 'Elevador: SI' },
    { category: 'AREA', name: 'Cuarto De Lavado: SI' },
    { category: 'AREA', name: 'Balcon: SI' },
    { category: 'EQUIPMENT', name: '1/2 Baño: SI' }
  ]);
});

test('rejects an unavailable page without matching listing metadata', () => {
  const artifact: ExtractionArtifact = {
    url,
    provider: 'Tecnocasa México',
    strategy: 'direct',
    html: '<html><body><h1>¡OOPS!</h1><p>La propiedad no está disponible.</p></body></html>',
    text: 'La propiedad no está disponible.',
    metadata: {}
  };
  const result = extractDeterministic(artifact);
  assert.notEqual(result.gate, 'PASS');
  assert.equal(result.evidence.providerKey, undefined);
});

test('does not pass an incomplete Tecnocasa detail page', () => {
  const artifact: ExtractionArtifact = {
    url,
    provider: 'Tecnocasa México',
    strategy: 'direct',
    html: `<html><head><meta property="og:url" content="${url}"></head><body>
      <h3 class="h5-verde">DEPARTAMENTO - CERRADA AMORES, COL. DEL VALLE NORTE</h3>
      <p>T-DF0014-0546</p><p class="p-detalle">Consultar MXN</p>
    </body></html>`,
    text: 'Departamento en venta en Del Valle Norte',
    metadata: {}
  };
  const result = extractDeterministic(artifact);
  assert.notEqual(result.gate, 'PASS');
  assert.equal(result.evidence.providerKey, undefined);
});
