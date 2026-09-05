import assert from "node:assert/strict";
import { test } from "vitest";
import { extractDeterministic, type ExtractionArtifact } from "../../src/lib/import-extraction.js";
import { resolveImportProvider } from "../../src/lib/import-providers/registry.js";
import { remaxMexicoProvider } from "../../src/lib/import-providers/remax-mx.js";

function fixture() {
  const images = Array.from({ length: 9 }, (_, index) => `<img src="https://cdn.remax.com.mx/properties/682749/${(index + 1).toString(16).padStart(32, "0")}.jpeg">`).join("");
  return `<!doctype html><html><head>
    <meta property="og:title" content="DEPARTAMENTO NUEVO EN VENTA EN COLONIA DEL VALLE NORTE">
    <meta property="og:description" content="Departamento en Venta de 115m2 de Colonia Del Valle Norte.">
  </head><body>
    <span class="jsTipo">DEPARTAMENTO</span><span class="jsOperacion">VENTA</span>
    <span class="jsPrecio">$6,750,000</span><span class="jsMoneda">MXN</span>
    <span class="jsCalle">Xola</span><span class="jsNumeroExterior">30</span>
    <span class="jsColonia">Del Valle Norte</span><span class="jsCiudad">Ciudad de México</span>
    <span class="jsEstado">Ciudad de México</span><span class="jsPostal">03103</span>
    <p class="jsClave">RDV682749-451</p><span class="jsImageCount">9</span>
    <span class="jsTerreno">115 m2</span><span class="jsConstruccion">115 m2</span>
    <span class="jsCuartos">3</span><span class="jsBanos">2</span>
    <span class="jsEstacionamientos">1</span><span class="jsTipoEstacionamientos">Cubierto</span>
    <span class="jsCuartoServicio">No</span><span class="jsEdad">1 años</span>
    <span class="jsConservacion">Excelente</span><span class="jsOrientacion">Oriente</span>
    <span class="jsUsoSuelo">Habitacional</span><span class="jsNiveles">1 (3)</span>
    <span class="jsMantenimiento">$2,500 MXN</span>
    <div class="row jsAreas"><div><span class="text-dark-gray">Balcón</span></div><div><span class="text-dark-gray">Elevador</span></div></div>
    <div class="row jsEquipos"><div><span class="text-dark-gray">Cisterna</span></div><div><span class="text-dark-gray">Vigilancia</span></div></div>
    <p class="jsAgenteNombre">Mario Enrique Preciado Mendoza</p>
    <img class="jsAgenteImagen" src="https://cdn.remax.com.mx/agentes/1770235711.jpg">
    <h4 class="jsOficinaNombre">RE/MAX Pro</h4>
    <a href="tel:5589527336">Oficina</a><a href="tel:5531054496">Agente</a><a href="tel:5589527336">Duplicado</a>
    <img src="https://api.remax.com.mx/files/qrlive/RDV682749-451_QR.png">
    ${images}<img src="https://cdn.remax.com.mx/properties/682749/00000000000000000000000000000001.jpeg">
    <img src="https://remax.com.mx/images/icon.svg">
    <iframe src="https://www.google.com/maps/embed/v1/place?key=public&amp;q=19.3967,-99.1682"></iframe>
  </body></html>`;
}

test("routes RE/MAX México property URLs to its provider", () => {
  assert.equal(resolveImportProvider(new URL("https://remax.com.mx/propiedad/682749")).key, "remax-mx");
  assert.equal(resolveImportProvider(new URL("https://remax.com.mx/oficinas/123")).key, "generic");
});

test("extracts the complete RE/MAX listing without page chrome images", () => {
  const html = fixture();
  const artifact: ExtractionArtifact = {
    url: "https://remax.com.mx/propiedad/682749",
    provider: "RE/MAX México",
    strategy: "direct",
    html,
    text: "Departamento en venta",
    metadata: {},
  };
  const result = extractDeterministic(artifact);

  assert.equal(result.gate, "PASS");
  assert.equal(result.confidenceScore, 100);
  assert.equal(result.input.source.listingId, "682749");
  assert.equal(result.input.source.listingKey, "RDV682749-451");
  assert.equal(result.input.source.rawMetadata.providerKey, "remax-mx");
  assert.equal(result.input.property.title, "DEPARTAMENTO NUEVO EN VENTA EN COLONIA DEL VALLE NORTE");
  assert.deepEqual(result.input.property.price, { amount: 6_750_000, currency: "MXN" });
  assert.equal(result.input.property.address.street, "Xola");
  assert.equal(result.input.property.address.exteriorNumber, "30");
  assert.equal(result.input.property.address.neighborhood, "Del Valle Norte");
  assert.deepEqual(result.input.property.coordinates, { latitude: 19.3967, longitude: -99.1682 });
  assert.equal(result.input.property.details.landAreaM2, 115);
  assert.equal(result.input.property.details.constructionAreaM2, 115);
  assert.equal(result.input.property.details.bedrooms, 3);
  assert.equal(result.input.property.details.bathrooms, 2);
  assert.equal(result.input.property.details.serviceRoom, false);
  assert.equal(result.input.property.details.buildingLevels, 1);
  assert.equal(result.input.property.details.unitFloor, 3);
  assert.equal(result.input.property.details.maintenanceAmount, 2_500);
  assert.equal(result.input.property.technicalSheetQrUrl, "https://api.remax.com.mx/files/qrlive/RDV682749-451_QR.png");
  assert.deepEqual(result.input.contact.phones, ["5589527336", "5531054496"]);
  assert.equal(result.input.contact.agentName, "Mario Enrique Preciado Mendoza");
  assert.equal(result.input.contact.agentAvatarUrl, "https://cdn.remax.com.mx/agentes/1770235711.jpg");
  assert.equal(result.input.contact.officeName, "RE/MAX Pro");
  assert.deepEqual(result.input.features, [
    { category: "AREA", name: "Balcón" },
    { category: "AREA", name: "Elevador" },
    { category: "EQUIPMENT", name: "Cisterna" },
    { category: "EQUIPMENT", name: "Vigilancia" },
  ]);
  assert.equal(result.input.images.length, 9);
  assert.ok(result.input.images.every((image) => image.url.startsWith("https://cdn.remax.com.mx/properties/682749/")));
  assert.equal(result.evidence.hasCompleteGallery, true);
});

test("enriches RE/MAX's empty server HTML from its structured listing endpoint", async () => {
  const artifact: ExtractionArtifact = {
    url: "https://remax.com.mx/propiedad/682749",
    provider: "RE/MAX México",
    strategy: "direct",
    html: "<html><body><span class=\"jsTipo\"></span></body></html>",
    text: "RE/MAX propiedad",
    metadata: {},
  };
  const imagePaths = Array.from({ length: 9 }, (_, index) => ({
    path: `properties/682749/${(index + 1).toString(16).padStart(32, "0")}.jpeg`,
  }));
  const enriched = await remaxMexicoProvider.enrich!(artifact, {
    fetchHtml: async () => { throw new Error("not used"); },
    fetchJson: async (url, options) => {
      assert.equal(url, "https://remax.com.mx/ajax/FetchPropiedadFlyerData/682749");
      assert.deepEqual(options, { method: "POST", referer: artifact.url });
      return {
        url,
        data: {
          data: {
            propiedad: {
              propiedad_id: "682749", oficina_id: "451", clave: "RDV682749-451", operacion: "1",
              titulo: "DEPARTAMENTO NUEVO EN VENTA EN COLONIA DEL VALLE NORTE", descripcion: "<p>Departamento de 115m2.</p>",
              tipo_nombre: "Departamento", moneda: "MXN", mxn_corriente: "6750000.00",
              calle: "Xola", numero_exterior: "30", numero_interior: null, colonia_nombre: "Del Valle Norte",
              ciudad_nombre: "Ciudad de México", estado_nombre: "Ciudad de México", postal: "03103",
              latitud: "19.3967", longitud: "-99.1682", m2_terreno: "115.00", m2_construccion: "115.00",
              cuartos: "3", banos: "2", numero_estacionamientos: "1", tipo_estacionamientos: "Cubierto",
              cuarto_de_servicio: "No", edad_de_propiedad: "1", conservacion: "Excelente", orientacion: "Oriente",
              uso_suelo: "Habitacional", niveles: "1", nivel_encuentra: "3", mantenimiento: "2500.00",
              moneda_mantenimiento: "MXN", imagenes: imagePaths,
            },
            agente: { nombre: "Mario Enrique", apellido: "Preciado Mendoza", imagen: "1770235711.jpg", celular: "5531054496" },
            oficina: { oficina_id: "451", oficina_nombre: "RE/MAX Pro", oficina_telefono: "5589527336", oficina_callpicker: "" },
            datos: {
              areas: [{ datos: "Balcón" }, { datos: "Elevador" }],
              equipos: [{ datos: "Cisterna" }, { datos: "Vigilancia" }],
            },
          },
        },
      };
    },
  });
  const result = remaxMexicoProvider.extract!(enriched)!;

  assert.equal(result.gate, "PASS");
  assert.equal(result.input.property.address.formatted, "Xola 30, Del Valle Norte, Ciudad de México, Ciudad de México, 03103");
  assert.equal(result.input.property.description, "Departamento de 115m2.");
  assert.equal(result.input.property.details.unitFloor, 3);
  assert.equal(result.input.contact.agentAvatarUrl, "https://cdn.remax.com.mx/agentes/1770235711.jpg");
  assert.equal(result.input.contact.sourceOfficeId, "451");
  assert.deepEqual(result.input.contact.phones, ["5589527336", "5531054496"]);
  assert.equal(result.input.images.length, 9);
  assert.equal(result.evidence.hasCompleteGallery, true);
  assert.equal(result.input.source.rawMetadata.source, "listing-api");
});
