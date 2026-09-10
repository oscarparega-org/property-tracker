import type { ReactNode } from 'react';
import type { CatalogPropertyDto, PropertyDto } from '@house-tracker/shared';
import { MaterialIcon } from './material-icon';
import { formatMoney, propertyAddress, propertyTypeLabels } from '@/lib/property-format';

type SummaryProperty = PropertyDto | CatalogPropertyDto;

function Metric({ value, label }: { value: string | number | null; label: string }) {
  return (
    <span className="metric">
      <strong>{value ?? '—'}</strong>
      <small>{label}</small>
    </span>
  );
}

export function PropertyCardContent({
  property,
  badges,
  showMissingLocation = false
}: {
  property: SummaryProperty;
  badges?: ReactNode;
  showMissingLocation?: boolean;
}) {
  const hero = property.images[0];
  return (
    <>
      <div className="card-image-wrap">
        {hero ? (
          <img src={hero.url} alt={hero.alt ?? property.title} className="card-image" />
        ) : (
          <div className="image-placeholder">Sin foto</div>
        )}
        {badges}
      </div>
      <div className="card-copy">
        <span className="card-type">{propertyTypeLabels[property.propertyType]}</span>
        <h2>{property.title}</h2>
        <p className="address">{propertyAddress(property)}</p>
        <strong className="price">{formatMoney(property.priceAmount, property.priceCurrency)}</strong>
        <div className="metrics">
          <Metric value={property.bedrooms} label="rec." />
          <Metric value={property.bathrooms} label="baños" />
          <Metric value={property.parkingSpaces} label="autos" />
          <Metric value={property.constructionAreaM2 ? `${property.constructionAreaM2} m²` : null} label="const." />
        </div>
        {showMissingLocation && property.latitude === null ? (
          <span className="no-location">
            <MaterialIcon name="locationOff" /> Sin ubicación en mapa
          </span>
        ) : null}
      </div>
    </>
  );
}
