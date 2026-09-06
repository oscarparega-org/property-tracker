"use client";
import Link from "next/link";
import { toggleFavoriteAction } from "@/lib/property-actions";
import { MaterialIcon } from "@/components/material-icon";
import { PropertyDecisionPanel } from "@/components/property-decision-panel";
import { PropertyGallery } from "@/components/property-gallery";
import { PropertyLocationMap } from "@/components/property-location-map";
import type { PropertyDto } from "@template/shared";
import { ActionForm } from "@/components/action-form";
import { PropertyEnhancement } from "@/components/property-enhancement";
import { BodyNavigation } from "@/components/body-navigation";



const typeLabels = {
  APARTMENT: "Departamento",
  HOUSE: "Casa",
  LAND: "Terreno",
  OTHER: "Otro",
} as const;

function money(amount: number | null, currency: string | null) {
  if (amount === null) return "Sin dato";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency ?? "MXN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="full-fact"><span>{label}</span><strong>{value ?? "Sin dato"}</strong></div>;
}

export function PropertyDetail({ property }: { property: PropertyDto }) {
  const areas = property.features.filter((feature) => feature.category === "AREA");
  const equipment = property.features.filter((feature) => feature.category === "EQUIPMENT");
  const others = property.features.filter((feature) => feature.category === "OTHER");

  return (
    <main className="detail-page">
      <BodyNavigation current={property.title} backLabel="Volver al mapa y la lista" />

      <div className="detail-layout">
        {property.publicationStatus === "DRAFT" && <div className="draft-banner"><span><MaterialIcon name="draft" /> Esta propiedad es un borrador</span><Link href={`/properties/${property.id}/review`}>Revisar y publicar</Link></div>}
        <div className="detail-title-row">
          <div>
            <span className="detail-kicker">{typeLabels[property.propertyType]} · En venta</span>
            <h1>{property.title}</h1>
            <p>{property.formattedAddress ?? property.neighborhood ?? "Ubicación pendiente"}</p>
          </div>
          <div className="detail-price-actions">
            <div className="detail-price">
              <small>Precio publicado</small>
              <strong>{money(property.priceAmount, property.priceCurrency)}</strong>
            </div>
            <ActionForm action={toggleFavoriteAction.bind(null, property.id, !property.isFavorite)}>
              <button
                className={`detail-favorite${property.isFavorite ? " is-active" : ""}`}
                type="submit"
                aria-label={property.isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                aria-pressed={property.isFavorite}
                title={property.isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
              >
                <MaterialIcon name={property.isFavorite ? "favorite" : "favoriteBorder"} />
              </button>
            </ActionForm>
          </div>
        </div>

        <article className="property-full">
          <PropertyGallery images={property.images} title={property.title} />

          <section className="detail-section">
            <div className="section-heading"><span>Resumen</span><h2>Datos de la propiedad</h2></div>
            <div className="full-facts-grid">
              <Fact label="Tipo" value={typeLabels[property.propertyType]} />
              <Fact label="Operación" value="Venta" />
              <Fact label="Construcción" value={property.constructionAreaM2 === null ? null : `${property.constructionAreaM2} m²`} />
              <Fact label="Terreno" value={property.landAreaM2 === null ? null : `${property.landAreaM2} m²`} />
              <Fact label="Recámaras" value={property.bedrooms} />
              <Fact label="Baños" value={property.bathrooms} />
              <Fact label="Estacionamientos" value={property.parkingSpaces} />
              <Fact label="Tipo estacionamiento" value={property.parkingType} />
              <Fact label="Cuarto de servicio" value={property.serviceRoom === null ? null : property.serviceRoom ? "Sí" : "No"} />
              <Fact label="Antigüedad" value={property.propertyAgeYears === null ? null : `${property.propertyAgeYears} años`} />
              <Fact label="Conservación" value={property.condition} />
              <Fact label="Orientación" value={property.orientation} />
              <Fact label="Uso de suelo" value={property.landUse} />
              <Fact label="Niveles del edificio" value={property.buildingLevels} />
              <Fact label="Piso de la unidad" value={property.unitFloor} />
              <Fact label="Mantenimiento" value={money(property.maintenanceAmount, property.maintenanceCurrency)} />
            </div>
          </section>

          <section className="detail-section">
            <div className="section-heading"><span>Publicación</span><h2>Descripción</h2></div>
            <p className="full-description">{property.description ?? "Sin descripción."}</p>
          </section>

          <section className="detail-section">
            <div className="section-heading"><span>Dirección</span><h2>Ubicación</h2></div>
            {property.latitude !== null && property.longitude !== null && (
              <PropertyLocationMap
                latitude={property.latitude}
                longitude={property.longitude}
                title={property.title}
              />
            )}
            <div className="full-facts-grid">
              <Fact label="Calle" value={property.street} />
              <Fact label="Número exterior" value={property.exteriorNumber} />
              <Fact label="Número interior" value={property.interiorNumber} />
              <Fact label="Colonia" value={property.neighborhood} />
              <Fact label="Municipio / alcaldía" value={property.municipality} />
              <Fact label="Estado" value={property.state} />
              <Fact label="Código postal" value={property.postalCode} />
              <Fact label="País" value={property.countryCode} />
              <Fact label="Latitud" value={property.latitude} />
              <Fact label="Longitud" value={property.longitude} />
            </div>
          </section>

          <section className="detail-section">
            <div className="section-heading"><span>Incluido</span><h2>Áreas y equipo</h2></div>
            <div className="feature-columns">
              <div><h3>Áreas</h3>{areas.length ? areas.map((item) => <span key={item.id}>{item.name}</span>) : <small>Sin datos</small>}</div>
              <div><h3>Equipo</h3>{equipment.length ? equipment.map((item) => <span key={item.id}>{item.name}</span>) : <small>Sin datos</small>}</div>
              {others.length > 0 && <div><h3>Otros</h3>{others.map((item) => <span key={item.id}>{item.name}</span>)}</div>}
            </div>
          </section>

          <section className="detail-section">
            <div className="section-heading"><span>Asesoría</span><h2>Contacto</h2></div>
            <div className="full-contact">
              {property.agentAvatarUrl && (
                <img src={property.agentAvatarUrl} alt={property.agentName ?? "Agente"} />
              )}
              <div><strong>{property.agentName ?? "Agente no especificado"}</strong><span>{property.officeName ?? "Oficina no especificada"}</span></div>
              <div>{property.agentPhones.map((phone) => <a href={`tel:${phone}`} key={phone}>{phone}</a>)}{property.agentEmail && <a href={`mailto:${property.agentEmail}`}>{property.agentEmail}</a>}</div>
            </div>
          </section>

          <section className="detail-section source-section">
            <div className="section-heading"><span>Origen</span><h2>Fuente y metadatos</h2></div>
            <div className="full-facts-grid">
              <Fact label="Portal" value={property.sourceProvider} />
              <Fact label="ID del portal" value={property.sourceListingId} />
              <Fact label="Clave" value={property.sourceListingKey} />
              <Fact label="Oficina ID" value={property.sourceOfficeId} />
              <Fact label="Observada" value={new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short" }).format(new Date(property.sourceObservedAt))} />
              <Fact label="Última actualización" value={new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short" }).format(new Date(property.updatedAt))} />
            </div>
            <div className="source-buttons">
              {property.sourceUrl && <a href={property.sourceUrl} target="_blank" rel="noreferrer">Abrir publicación original ↗</a>}
              {property.technicalSheetQrUrl && <a href={property.technicalSheetQrUrl} target="_blank" rel="noreferrer">Abrir ficha QR ↗</a>}
            </div>
            {property.sourceUrl && <PropertyEnhancement propertyId={property.id} />}
            <details className="metadata-details">
              <summary>Ver metadatos originales JSON</summary>
              <pre>{JSON.stringify(property.sourceMetadata, null, 2)}</pre>
            </details>
          </section>
        </article>

        <PropertyDecisionPanel property={property} />
      </div>
    </main>
  );
}
