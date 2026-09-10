import Link from 'next/link';
import type { PropertyDto } from '@house-tracker/shared';
import { ActionForm } from './action-form';
import { MaterialIcon } from './material-icon';
import { PropertyCardContent } from './property-card-content';
import { toggleFavoriteAction } from '@/lib/property-actions';

export const decisionStatusLabels: Record<PropertyDto['decisionStatus'], string> = {
  NEW: 'Nueva',
  CONTACTED: 'Contactada',
  VISIT_SCHEDULED: 'Visita agendada',
  VISITED: 'Visitada',
  OFFER_MADE: 'Oferta enviada',
  REJECTED: 'Descartada',
  PURCHASED: 'Comprada'
};

export function SearchPropertyCard({ property, searchId }: { property: PropertyDto; searchId: string }) {
  return (
    <article className={`property-card${property.archivedAt ? ' is-archived' : ''}`}>
      <Link
        className="card-select"
        href={`/searches/${searchId}/properties/${property.id}`}
        aria-label={`Ver ${property.title}`}
      >
        <PropertyCardContent
          property={property}
          showMissingLocation
          badges={
            <>
              <span className={`status-badge status-${property.decisionStatus.toLowerCase()}`}>
                {decisionStatusLabels[property.decisionStatus]}
              </span>
              {property.archivedAt ? <span className="archived-badge">Archivada</span> : null}
              {property.catalogStatus === 'UNAVAILABLE' ? (
                <span className="archived-badge unavailable-card-badge">No disponible</span>
              ) : null}
            </>
          }
        />
      </Link>
      <div className="card-actions">
        <ActionForm action={toggleFavoriteAction.bind(null, property.id, !property.isFavorite, searchId)}>
          <button
            className={`favorite-button${property.isFavorite ? ' is-active' : ''}`}
            type="submit"
            aria-label={property.isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          >
            <MaterialIcon name={property.isFavorite ? 'favorite' : 'favoriteBorder'} />
          </button>
        </ActionForm>
      </div>
    </article>
  );
}
