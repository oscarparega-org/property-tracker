import assert from 'node:assert/strict';
import { test } from 'vitest';
import { extractDeterministic, type ExtractionArtifact } from '../../src/lib/import-extraction.js';
import { resolveImportProvider } from '../../src/lib/import-providers/registry.js';

const listingId = '6a7349e23c983e415e0f7817';

function fixture() {
  const pictures = Array.from({ length: 18 }, (_, index) => ({
    url: `https://images.pulppo.com/property/${index === 4 ? '6a7347a912e1a0cada49dae6' : listingId}/picture_${(index + 1).toString(16).padStart(32, '0')}.jpg?reso=1280x1024`,
    description: `${154573 + index}.jpg`,
    public: true
  }));
  const data = {
    props: {
      pageProps: {
        property: {
          _id: listingId,
          internalId: 'DDB-166',
          type: 'Departamento',
          listing: {
            title: 'Departamento en venta en Del Valle Sur 2 Recámaras',
            description: 'Penthouse con roof garden. Mantenimiento mensual: $3,000',
            operation: 'sale',
            value: 6_060_803,
            price: { currency: 'MXN', price: 6_060_803 },
            addressIsRounded: true
          },
          address: {
            publicStreet: 'Gabriel Mancera 1300',
            street: 'Gabriel Mancera 1360',
            apartment: 'PH1',
            floor: '6',
            name: 'Del Valle Sur',
            neighborhood: { name: 'Del Valle Sur' },
            city: { name: 'Benito Juárez' },
            state: { name: 'Ciudad de México' },
            country: { id: 'MX' },
            zip: '03104',
            location: { type: 'Point', coordinates: [-99.1673087, 19.373462] }
          },
          attributes: {
            yearBuild: -1,
            condition: 'Excelente',
            suites: 2,
            bathrooms: 2,
            parkings: 1,
            roofedSurface: 80,
            totalSurface: 103
          },
          pictures,
          services: [
            { id: 1291, name: 'Zona de barbacoa comunitaria', type: 1 },
            { id: 12, name: 'Cocina Integral', type: 2 }
          ],
          agent: {
            firstName: 'Almudena',
            lastName: 'García Amieva',
            phone: '525524787333',
            email: 'a.garcia.amieva@pulppo.com',
            profilePicture:
              'https://images.pulppo.com/property/contact/68b9efa2da7dd6e7f2ce13f3/profile_picture/Pulpoo-3.jpg'
          },
          company: { _id: '66b249c56aab454cca7be6b7', name: 'Vamos a Vender', phone: '5510534189' }
        }
      }
    }
  };
  return `<html><body><script type="application/json" id="__NEXT_DATA__">${JSON.stringify(data)}</script></body></html>`;
}

test('routes only Pulppo property detail URLs to its provider', () => {
  assert.equal(resolveImportProvider(new URL(`https://mi.pulppo.com/propiedad/${listingId}`)).key, 'pulppo');
  assert.equal(resolveImportProvider(new URL('https://mi.pulppo.com/propiedades')).key, 'generic');
});

test("extracts Pulppo's structured listing and exact ordered gallery", () => {
  const artifact: ExtractionArtifact = {
    url: `https://mi.pulppo.com/propiedad/${listingId}`,
    provider: 'Pulppo',
    strategy: 'direct',
    html: fixture(),
    text: 'Departamento en venta en Del Valle Sur',
    metadata: {}
  };
  const result = extractDeterministic(artifact);

  assert.equal(result.gate, 'PASS');
  assert.equal(result.confidenceScore, 100);
  assert.equal(result.input.source.listingId, listingId);
  assert.equal(result.input.source.listingKey, 'DDB-166');
  assert.equal(result.input.source.rawMetadata.providerKey, 'pulppo');
  assert.equal(result.input.source.rawMetadata.addressRounded, true);
  assert.equal(result.input.property.title, 'Departamento en venta en Del Valle Sur 2 Recámaras');
  assert.deepEqual(result.input.property.price, { amount: 6_060_803, currency: 'MXN' });
  assert.equal(result.input.property.address.street, 'Gabriel Mancera');
  assert.equal(result.input.property.address.exteriorNumber, '1300');
  assert.equal(result.input.property.address.interiorNumber, null);
  assert.equal(result.input.property.address.neighborhood, 'Del Valle Sur');
  assert.equal(result.input.property.address.municipality, 'Benito Juárez');
  assert.deepEqual(result.input.property.coordinates, { latitude: 19.373462, longitude: -99.1673087 });
  assert.equal(result.input.property.details.landAreaM2, 103);
  assert.equal(result.input.property.details.constructionAreaM2, 80);
  assert.equal(result.input.property.details.bedrooms, 2);
  assert.equal(result.input.property.details.bathrooms, 2);
  assert.equal(result.input.property.details.propertyAgeYears, null);
  assert.equal(result.input.property.details.maintenanceAmount, 3_000);
  assert.equal(result.input.images.length, 18);
  assert.equal(
    result.input.images[4]?.url,
    'https://images.pulppo.com/property/6a7347a912e1a0cada49dae6/picture_00000000000000000000000000000005.jpg'
  );
  assert.deepEqual(result.input.features, [
    { category: 'EQUIPMENT', name: 'Zona de barbacoa comunitaria' },
    { category: 'AREA', name: 'Cocina Integral' }
  ]);
  assert.equal(result.input.contact.agentName, 'Almudena García Amieva');
  assert.equal(
    result.input.contact.agentAvatarUrl,
    'https://images.pulppo.com/property/contact/68b9efa2da7dd6e7f2ce13f3/profile_picture/Pulpoo-3.jpg'
  );
  assert.deepEqual(result.input.contact.phones, ['525524787333', '5510534189']);
  assert.equal(result.input.contact.email, 'a.garcia.amieva@pulppo.com');
  assert.equal(result.input.contact.officeName, 'Vamos a Vender');
  assert.equal(result.evidence.hasCompleteGallery, true);
});
