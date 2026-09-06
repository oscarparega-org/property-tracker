'use client';
import { ActionForm } from '@/components/action-form';
import { localDateInput } from '@/lib/date-input';
import { saveDecisionAction } from '@/lib/property-actions';
import type { PropertyDto } from '@house-tracker/shared';

const statuses = [
  ['NEW', 'Nueva'],
  ['CONTACTED', 'Contactada'],
  ['VISIT_SCHEDULED', 'Visita agendada'],
  ['VISITED', 'Visitada'],
  ['OFFER_MADE', 'Oferta enviada'],
  ['REJECTED', 'Descartada'],
  ['PURCHASED', 'Comprada']
] as const;

export function PropertyDecisionPanel({ property }: { property: PropertyDto }) {
  const searchName = property.memberships.find((item) => item.searchId === property.searchId)?.name;
  return (
    <aside className="decision-panel">
      <div className="decision-heading">
        <span>{searchName ? `Decisión en ${searchName}` : 'Espacio personal'}</span>
        <h2>Mi decisión</h2>
        <p>Actualiza tu evaluación sin salir de esta página.</p>
      </div>
      <ActionForm action={saveDecisionAction} className="decision-form">
        <input type="hidden" name="id" value={property.id} />
        <input type="hidden" name="searchId" value={property.searchId ?? ''} />
        <label>
          <span>Estado</span>
          <select name="decisionStatus" defaultValue={property.decisionStatus}>
            {statuses.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Calificación</span>
          <select name="rating" defaultValue={property.rating ?? ''}>
            <option value="">Sin calificar</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option value={value} key={value}>
                {'★'.repeat(value)} {value}/5
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Fecha de visita</span>
          <input name="visitAt" type="datetime-local" defaultValue={localDateInput(property.visitAt)} />
        </label>
        <label>
          <span>Mis notas</span>
          <textarea
            name="notes"
            rows={7}
            defaultValue={property.notes ?? ''}
            placeholder="Impresiones, dudas, costos por confirmar…"
          />
        </label>
        <label>
          <span>Razón para descartar</span>
          <textarea
            name="rejectionReason"
            rows={3}
            defaultValue={property.rejectionReason ?? ''}
            placeholder="Opcional"
          />
        </label>
        <label className="decision-check">
          <input
            key={`favorite-${property.isFavorite}`}
            name="isFavorite"
            type="checkbox"
            defaultChecked={property.isFavorite}
          />
          <span>Marcar como favorita</span>
        </label>
        <label className="decision-check archived-check">
          <input name="archived" type="checkbox" defaultChecked={Boolean(property.archivedAt)} />
          <span>Archivar propiedad</span>
        </label>
        <button type="submit" className="decision-save">
          Guardar mi decisión
        </button>
      </ActionForm>
    </aside>
  );
}
