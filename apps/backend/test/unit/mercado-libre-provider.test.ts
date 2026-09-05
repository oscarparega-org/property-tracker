import assert from "node:assert/strict";
import { test } from "vitest";
import { extractDeterministic, type ExtractionArtifact } from "../../src/lib/import-extraction.js";
import { mercadoLibreProvider } from "../../src/lib/import-providers/mercado-libre.js";
import { resolveImportProvider } from "../../src/lib/import-providers/registry.js";

function nordicHtml(initialState: Record<string, unknown>) {
  const state = { appProps: { pageProps: { initialState } } };
  return `<script id="__NORDIC_RENDERING_CTX__">_n.ctx.r=${JSON.stringify(state)};_n.ctx.r.assets={};</script>`;
}

function listingHtml(options: { streetLine?: string | null; formattedAddress?: string; itemLocation?: string } = {}) {
  const streetLine = options.streetLine === undefined ? "Gabriel Mancera 600" : options.streetLine;
  const formattedAddress = options.formattedAddress ?? "Gabriel Mancera 600, Del Valle Norte, Benito Juárez, Distrito Federal";
  const itemLocation = options.itemLocation ?? "Benito Juárez, Distrito Federal";
  return nordicHtml({
    id: "MLM5668988320",
    vertical: "real_estate",
    components: {
      header: { id: "header", title: "Departamento En Venta En Del Valle Norte", subtitle: "Departamento en Venta" },
      price: { id: "price", price: { value: 5_280_000, currency_id: "MXN" } },
      description: { id: "description", content: "Departamento remodelado en primer piso." },
      gallery: {
        id: "gallery_mosaic",
        total_count: 16,
        primary: { id: "700004-MLM113088407904_072026", src: "https://http2.mlstatic.com/D_NQ_NP_700004-MLM113088407904_072026-F-test.webp" },
        secondary: [{ id: "700002-MLM113088407902_072026", src: "https://http2.mlstatic.com/D_NQ_NP_700002-MLM113088407902_072026-F-test.webp" }],
        media_counters: [{ type: "photos", url: "https://departamento.mercadolibre.com.mx/vis-modals/gallery/MLM5668988320" }],
      },
      location: {
        id: "location_and_points",
        content_rows: [{ title: { text: formattedAddress } }],
        map_info: { item_address: streetLine, item_location: itemLocation, location: { latitude: "19.389217", longitude: "-99.163804" } },
      },
      specifications: {
        id: "technical_specifications",
        specs: [{ attributes: [
          { id: "Superficie construida", text: "129.54 m²" },
          { id: "Recámaras", text: "3" },
          { id: "Baños", text: "1" },
          { id: "Estacionamientos", text: "1" },
          { id: "Orientación", text: "Norte" },
          { id: "Antigüedad", text: "46 años" },
          { id: "Mantenimiento", text: "0 MXN" },
          { id: "Ambientes", text: "4" },
          { id: "Bodegas", text: "0" },
          { id: "Disposición", text: "Contrafrente" },
          { id: "Admite mascotas", text: "No" },
        ] }],
      },
      seller: {
        id: "seller_profile",
        seller_name: { title: { text: "Pulppo" } },
        bottom_extra_info: [{ title: { text: "Código de la propiedad" }, subtitles: [{ text: "DGU-651" }] }],
        phone_link: { track: { melidata_event: { event_data: { seller_id: 1167708449 } } } },
      },
    },
  });
}

function galleryHtml() {
  const elements = Array.from({ length: 16 }, (_, index) => ({
    id: `${700000 + index}-MLM113088407${900 + index}_072026`,
    alt: index < 5 ? "Imagen de Sala y comedor" : "Imagen de Cocina",
    src_high: `https://http2.mlstatic.com/D_NQ_NP_${700000 + index}-MLM113088407${900 + index}_072026-OO.webp`,
  }));
  return nordicHtml({
    components: [{ id: "gallery_multimedia", data: { tabs: [{ id: "pictures", multimedia: [
      { title: "Sala y comedor", elements: elements.slice(0, 8) },
      { title: "Cocina", elements: [...elements.slice(8), elements[0], { id: "icon", src_high: "https://http2.mlstatic.com/icon.svg" }] },
    ] }] } }],
  });
}

test("routes MercadoLibre listings to its code provider and other sites to generic", () => {
  assert.equal(resolveImportProvider(new URL("https://departamento.mercadolibre.com.mx/MLM-5668988320-test-_JM")).key, "mercado-libre");
  assert.equal(resolveImportProvider(new URL("https://example.com/property/1")).key, "generic");
});

test("extracts MercadoLibre structured fields and exactly the listing gallery", async () => {
  const artifact: ExtractionArtifact = {
    url: "https://departamento.mercadolibre.com.mx/MLM-5668988320-departamento-_JM",
    provider: "Mercado Libre",
    strategy: "direct",
    html: listingHtml(),
    text: "Departamento en venta",
    metadata: {},
  };
  const enriched = await mercadoLibreProvider.enrich!(artifact, { fetchHtml: async () => ({ url: "https://departamento.mercadolibre.com.mx/vis-modals/gallery/MLM5668988320", html: galleryHtml() }) });
  const result = extractDeterministic(enriched);

  assert.equal(result.gate, "PASS");
  assert.equal(result.confidenceScore, 100);
  assert.equal(result.input.source.listingId, "MLM5668988320");
  assert.equal(result.input.source.listingKey, "DGU-651");
  assert.equal(result.input.source.rawMetadata.providerKey, "mercado-libre");
  assert.equal(result.input.property.price.amount, 5_280_000);
  assert.equal(result.input.property.address.street, "Gabriel Mancera");
  assert.equal(result.input.property.address.exteriorNumber, "600");
  assert.equal(result.input.property.address.neighborhood, "Del Valle Norte");
  assert.equal(result.input.property.details.constructionAreaM2, 129.54);
  assert.equal(result.input.property.details.bedrooms, 3);
  assert.equal(result.input.property.details.propertyAgeYears, 46);
  assert.equal(result.input.contact.officeName, "Pulppo");
  assert.equal(result.input.contact.sourceOfficeId, "1167708449");
  assert.deepEqual(result.input.features.map((feature) => feature.name), ["Ambientes: 4", "Bodegas: 0", "Disposición: Contrafrente", "Admite mascotas: No"]);
  assert.equal(result.input.images.length, 16);
  assert.match(result.input.images[0]!.url, /700004-MLM113088407904/);
  assert.match(result.input.images[1]!.url, /700002-MLM113088407902/);
  assert.equal(new Set(result.input.images.map((image) => image.url)).size, 16);
  assert.ok(result.input.images.every((image) => image.url.endsWith("-OO.webp")));
  assert.equal(result.evidence.hasCompleteGallery, true);
});

test("maps a three-part MercadoLibre location to neighborhood when the street is hidden", async () => {
  const artifact: ExtractionArtifact = {
    url: "https://departamento.mercadolibre.com.mx/MLM-5257028714-departamento-_JM",
    provider: "Mercado Libre",
    strategy: "direct",
    html: listingHtml({ streetLine: null, formattedAddress: "Roma Sur, Cuauhtémoc, Distrito Federal", itemLocation: "Cuauhtémoc, Distrito Federal" }),
    text: "Departamento en venta",
    metadata: {},
  };
  const enriched = await mercadoLibreProvider.enrich!(artifact, { fetchHtml: async () => ({ url: "https://departamento.mercadolibre.com.mx/vis-modals/gallery/MLM5257028714", html: galleryHtml() }) });
  const result = extractDeterministic(enriched);

  assert.equal(result.input.property.address.street, null);
  assert.equal(result.input.property.address.exteriorNumber, null);
  assert.equal(result.input.property.address.neighborhood, "Roma Sur");
  assert.equal(result.input.property.address.municipality, "Cuauhtémoc");
  assert.equal(result.input.property.address.state, "Distrito Federal");
});
