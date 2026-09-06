'use client';
import { ActionForm } from '@/components/action-form';
import { localDateInput } from '@/lib/date-input';
import { saveDecisionAction } from '@/lib/property-actions';
import type { PropertyDto } from '@house-tracker/shared';
import { useEffect, useRef, useState } from 'react';
import { MaterialIcon } from '@/components/material-icon';

const statuses = [
  ['NEW', 'Nueva'],
  ['CONTACTED', 'Contactada'],
  ['VISIT_SCHEDULED', 'Visita agendada'],
  ['VISITED', 'Visitada'],
  ['OFFER_MADE', 'Oferta enviada'],
  ['REJECTED', 'Descartada'],
  ['PURCHASED', 'Comprada']
] as const;

function DecisionForm({ property, onSuccess }: { property: PropertyDto; onSuccess?: () => void }) {
  return (
    <ActionForm action={saveDecisionAction} className="decision-form" onSuccess={onSuccess}>
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
  );
}

function DecisionDialog({ property, onClose }: { property: PropertyDto; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className="decision-dialog" aria-labelledby="decision-dialog-title" onCancel={onClose}>
      <div className="decision-heading">
        <div>
          <span>Tu evaluación</span>
          <h2 id="decision-dialog-title">Actualizar decisión</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar decisión">
          <MaterialIcon name="close" />
        </button>
      </div>
      <DecisionForm property={property} onSuccess={onClose} />
    </dialog>
  );
}

export function PropertyDecisionPanel({ property }: { property: PropertyDto }) {
  const [open, setOpen] = useState(false);
  const searchName = property.memberships.find((item) => item.searchId === property.searchId)?.name;
  return (
    <>
      <aside className="decision-panel">
        <div className="decision-heading">
          <span>{searchName ? `Decisión en ${searchName}` : 'Espacio personal'}</span>
          <h2>Mi decisión</h2>
          <p>Actualiza tu evaluación sin salir de esta página.</p>
        </div>
        <DecisionForm property={property} />
      </aside>
      <button className="mobile-decision-trigger" type="button" onClick={() => setOpen(true)}>
        <MaterialIcon name="process" /> Actualizar mi decisión
      </button>
      {open ? <DecisionDialog property={property} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
