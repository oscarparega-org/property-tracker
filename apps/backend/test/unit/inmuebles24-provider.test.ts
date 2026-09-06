import assert from 'node:assert/strict';
import { test } from 'vitest';
import { extractDeterministic, type ExtractionArtifact } from '../../src/lib/import-extraction.js';
import { resolveImportProvider } from '../../src/lib/import-providers/registry.js';

const listingId = '148290981';

function fixture() {
  const location = {
    locationId: 'V1-D-23569',
    name: 'Nápoles',
    label: 'ZONA',
    parent: {
      name: 'Benito Juárez',
      label: 'CIUDAD',
      parent: {
        name: 'Ciudad de México',
        label: 'PROVINCIA',
        parent: { name: 'Mexico', label: 'PAIS', parent: null }
      }
    }
  };
  const pictures = ['1625905679', '1574202842'].map((id, order) => ({
    order,
    url1200x1200: `https://img10.naventcdn.com/avisos/resize/18/01/48/29/09/81/1200x1200/${id}.jpg`,
    title: 'Departamento · 145m² · 2 recámaras · 1 estacionamiento'
  }));
  return `<!doctype html><html><head>
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Apartment',
      name: 'Colonia Nápoles Amplio y Cómodo, Depto en Venta',
      image: pictures[0]!.url1200x1200,
      numberOfBathroomsTotal: 2,
      numberOfBedrooms: 2,
      floorSize: { '@type': 'QuantitativeValue', value: 145, unitCode: 'MTK' },
      address: { '@type': 'PostalAddress', streetAddress: 'Altadena 155' },
      telephone: '52 5574117755'
    })}</script>
    <script>
      const mapLatOf = "MTkuMzk1ODA5NDQwMDIxNzA0";
      const mapLngOf = "LTk5LjE3MzU1Mjk0MTQwMzIyOQ==";
      const mainFeatures = ${JSON.stringify({
        CFT100: { label: 'lote', value: '145' },
        CFT101: { label: 'constr.', value: '145' },
        CFT3: { label: 'baños', value: '2' },
        CFT7: { label: 'estac.', value: '1' },
        CFT2: { label: 'rec.', value: '2' },
        CFT5: { label: 'antigüedad', value: '45' }
      })};
      const publisher = ${JSON.stringify({ publisherId: '50956067', name: 'iad Inmobiliaria' })};
      const avisoInfo = {
        'idAviso': '${listingId}',
        'postingCode': "NX-263280",
        'pricesData': ${JSON.stringify([
          { operationType: { name: 'venta' }, prices: [{ isoCode: 'MXN', amount: 5_490_000 }] }
        ])},
        'expenses': '0',
        'location': ${JSON.stringify(location)},
        'description': "Ref: 263280<br><br>Departamento amplio junto al WTC.",
        'address': ${JSON.stringify({ name: 'Altadena 155', visibility: 'EXACT' })},
        'propertyType': ${JSON.stringify({ name: 'Apartamento', realEstateTypeId: '2' })},
        'whatsApp': '52 5574117755',
        'pictures': ${JSON.stringify(pictures)},
        'postingTitle': "Colonia Nápoles Amplio y Cómodo, Depto en Venta"
      };
    </script>
  </head><body>Departamento en venta</body></html>`;
}

test('routes Inmuebles24 listing URLs to a rendered provider', () => {
  const provider = resolveImportProvider(
    new URL(`https://www.inmuebles24.com/propiedades/clasificado/departamento-en-venta-${listingId}.html`)
  );
  assert.equal(provider.key, 'inmuebles24');
  assert.equal(provider.requiresRenderedFetch, true);
  assert.equal(
    resolveImportProvider(new URL('https://www.inmuebles24.com/departamentos-en-venta.html')).key,
    'generic'
  );
});

test('extracts the Inmuebles24 aviso payload and exact ordered gallery', () => {
  const artifact: ExtractionArtifact = {
    url: `https://www.inmuebles24.com/propiedades/clasificado/colonia-napoles-${listingId}.html`,
    provider: 'Inmuebles24',
    strategy: 'firecrawl',
    html: fixture(),
    text: 'Departamento en venta',
    metadata: {}
  };
  const result = extractDeterministic(artifact);

  assert.equal(result.gate, 'PASS');
  assert.equal(result.confidenceScore, 100);
  assert.equal(result.input.source.listingId, listingId);
  assert.equal(result.input.source.listingKey, 'NX-263280');
  assert.equal(result.input.source.rawMetadata.providerKey, 'inmuebles24');
  assert.equal(result.input.property.title, 'Colonia Nápoles Amplio y Cómodo, Depto en Venta');
  assert.deepEqual(result.input.property.price, { amount: 5_490_000, currency: 'MXN' });
  assert.equal(result.input.property.propertyType, 'APARTMENT');
  assert.equal(result.input.property.address.street, 'Altadena');
  assert.equal(result.input.property.address.exteriorNumber, '155');
  assert.equal(result.input.property.address.neighborhood, 'Nápoles');
  assert.equal(result.input.property.address.municipality, 'Benito Juárez');
  assert.equal(result.input.property.address.state, 'Ciudad de México');
  assert.deepEqual(result.input.property.coordinates, {
    latitude: 19.395809440021704,
    longitude: -99.17355294140323
  });
  assert.equal(result.input.property.details.landAreaM2, 145);
  assert.equal(result.input.property.details.constructionAreaM2, 145);
  assert.equal(result.input.property.details.bedrooms, 2);
  assert.equal(result.input.property.details.bathrooms, 2);
  assert.equal(result.input.property.details.parkingSpaces, 1);
  assert.equal(result.input.property.details.propertyAgeYears, 45);
  assert.equal(result.input.contact.officeName, 'iad Inmobiliaria');
  assert.equal(result.input.contact.sourceOfficeId, '50956067');
  assert.deepEqual(result.input.contact.phones, ['52 5574117755']);
  assert.equal(result.input.images.length, 2);
  assert.match(result.input.images[0]!.url, /1625905679/);
  assert.match(result.input.images[1]!.url, /1574202842/);
  assert.equal(result.evidence.hasCompleteGallery, true);
});
