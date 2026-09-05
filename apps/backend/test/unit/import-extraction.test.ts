import assert from "node:assert/strict";
import { test } from "vitest";
import { assertSafePublicUrl, extractDeterministic } from "../../src/lib/import-extraction.js";

test("extracts a property from JSON-LD and Open Graph metadata", () => {
  const html = `<!doctype html><html><head>
    <meta property="og:title" content="Departamento en Roma Norte">
    <meta property="og:description" content="Departamento luminoso">
    <meta property="og:image" content="/hero.jpg">
    <script type="application/ld+json">{
      "@type":"Product","name":"Departamento en Roma Norte",
      "offers":{"price":"4,250,000","priceCurrency":"MXN"},
      "address":{"streetAddress":"Álvaro Obregón 10","addressLocality":"Cuauhtémoc","addressRegion":"CDMX","postalCode":"06700"},
      "geo":{"latitude":19.418,"longitude":-99.164}
    }</script></head><body>2 recámaras 2 baños 95 m² de construcción</body></html>`;
  const result = extractDeterministic({
    url: "https://example.com/propiedad/abc",
    provider: "example.com",
    strategy: "direct",
    html,
    text: "Departamento en venta. 2 recámaras 2 baños 95 m² de construcción",
    metadata: {},
  });

  assert.equal(result.input.property.title, "Departamento en Roma Norte");
  assert.equal(result.input.property.price.amount, 4_250_000);
  assert.equal(result.input.property.details.bedrooms, 2);
  assert.equal(result.input.property.details.bathrooms, 2);
  assert.equal(result.input.property.details.constructionAreaM2, 95);
  assert.deepEqual(result.input.property.coordinates, { latitude: 19.418, longitude: -99.164 });
  assert.equal(result.input.images[0]?.url, "https://example.com/hero.jpg");
  assert.equal(result.complete, true);
  assert.equal(result.gate, "PASS");
});

test("returns nulls instead of inventing absent listing facts", () => {
  const result = extractDeterministic({
    url: "https://portal.mx/listing/42",
    provider: "portal.mx",
    strategy: "direct",
    html: '<meta property="og:title" content="Terreno en venta">',
    text: "Terreno en venta",
    metadata: {},
  });
  assert.equal(result.input.property.propertyType, "LAND");
  assert.equal(result.input.property.price.amount, null);
  assert.equal(result.input.property.coordinates, null);
  assert.equal(result.input.contact.agentName, null);
  assert.equal(result.complete, false);
  assert.equal(result.gate, "BORDERLINE");
});

test("rejects local and credential-bearing import URLs", async () => {
  await assert.rejects(() => assertSafePublicUrl("http://127.0.0.1/private"), /red privada/);
  await assert.rejects(() => assertSafePublicUrl("https://user:pass@example.com"), /credenciales/);
});
