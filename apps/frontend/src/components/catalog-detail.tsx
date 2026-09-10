import Link from 'next/link';
import type { CatalogPropertyDto } from '@house-tracker/shared';
import { PropertyGallery } from './property-gallery';
import { BodyNavigation } from './body-navigation';
import { formatMoney } from '@/lib/property-format';
import { PropertyLocationMap } from './property-location-map';

export function CatalogDetail({ property }: { property: CatalogPropertyDto }) {
  return (
    <main className="catalog-detail-page">
      <BodyNavigation
        current={property.title}
        backLabel="Volver a explorar"
        backHref="/"
        rootLabel="Explorar"
        rootHref="/"
      />
      <div className="catalog-detail-layout">
        <header>
          <p className="catalog-detail-location">
            {property.location.neighborhood.name}, {property.location.municipality.name}
          </p>
          <h1>{property.title}</h1>
          <strong>{formatMoney(property.priceAmount, property.priceCurrency)}</strong>
        </header>
        <PropertyGallery images={property.images} title={property.title} />
        <section className="catalog-detail-facts">
          <div>
            <span>Recámaras</span>
            <strong>{property.bedrooms ?? '—'}</strong>
          </div>
          <div>
            <span>Baños</span>
            <strong>{property.bathrooms ?? '—'}</strong>
          </div>
          <div>
            <span>Construcción</span>
            <strong>{property.constructionAreaM2 ? `${property.constructionAreaM2} m²` : '—'}</strong>
          </div>
          <div>
            <span>Estacionamientos</span>
            <strong>{property.parkingSpaces ?? '—'}</strong>
          </div>
        </section>
        <section className="catalog-detail-copy">
          <h2>Descripción</h2>
          <p>{property.description ?? 'La publicación no incluye descripción.'}</p>
        </section>
        <section className="catalog-detail-copy">
          <h2>Ubicación y detalles</h2>
          {property.latitude !== null && property.longitude !== null ? (
            <PropertyLocationMap latitude={property.latitude} longitude={property.longitude} title={property.title} />
          ) : null}
          <div className="full-facts-grid">
            <div className="full-fact">
              <span>Dirección</span>
              <strong>{property.formattedAddress ?? property.street ?? 'Sin dato'}</strong>
            </div>
            <div className="full-fact">
              <span>Terreno</span>
              <strong>{property.landAreaM2 === null ? 'Sin dato' : `${property.landAreaM2} m²`}</strong>
            </div>
            <div className="full-fact">
              <span>Antigüedad</span>
              <strong>{property.propertyAgeYears === null ? 'Sin dato' : `${property.propertyAgeYears} años`}</strong>
            </div>
            <div className="full-fact">
              <span>Mantenimiento</span>
              <strong>{formatMoney(property.maintenanceAmount, property.maintenanceCurrency)}</strong>
            </div>
          </div>
        </section>
        {property.agentName || property.agentEmail || property.agentPhones.length ? (
          <section className="catalog-detail-copy">
            <h2>Contacto</h2>
            <p>{property.agentName ?? property.officeName ?? 'Agente de la publicación'}</p>
            {property.agentEmail ? <a href={`mailto:${property.agentEmail}`}>{property.agentEmail}</a> : null}
            {property.agentPhones.map((phone) => (
              <a key={phone} href={`tel:${phone}`}>
                {phone}
              </a>
            ))}
          </section>
        ) : null}
        {property.sourceUrl ? (
          <a href={property.sourceUrl} target="_blank" rel="noreferrer" className="button subtle">
            Ver publicación original
          </a>
        ) : null}
        <Link className="button primary catalog-detail-add" href={`/?selected=${property.id}`}>
          Elegir búsqueda
        </Link>
      </div>
    </main>
  );
}
