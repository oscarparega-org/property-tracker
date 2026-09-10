'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PropertyDto, SearchDto } from '@house-tracker/shared';
import { requestApi } from '@/lib/request-api';
import { invalidateProperties } from '@/lib/property-cache';

export function PropertyMemberships({ property }: { property: PropertyDto }) {
  const router = useRouter();
  const [searches, setSearches] = useState<SearchDto[]>([]);
  const [selected, setSelected] = useState(property.memberships.map((item) => item.searchId));
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [confirmationTitle, setConfirmationTitle] = useState('');
  const load = () => {
    setLoadError('');
    void requestApi<SearchDto[]>('/api/searches')
      .then(setSearches)
      .catch((cause) => setLoadError(cause instanceof Error ? cause.message : 'No fue posible cargar tus búsquedas.'));
  };
  useEffect(load, []);
  return (
    <section className="membership-panel">
      <div>
        <h2>En qué búsquedas aparece</h2>
        <p>Los datos de la propiedad se comparten. Tu estado, notas y calificación no.</p>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setMessage('');
          try {
            if (!selected.length) {
              if (property.catalogStatus) {
                await Promise.all(
                  property.memberships.map((membership) =>
                    requestApi(`/api/searches/${membership.searchId}/properties/${property.id}`, { method: 'DELETE' })
                  )
                );
                router.replace(property.searchId ? `/searches/${property.searchId}` : '/');
                return;
              }
              await requestApi(`/api/properties/${property.id}`, {
                method: 'DELETE',
                body: JSON.stringify({ confirmationTitle })
              });
              router.replace(property.searchId ? `/searches/${property.searchId}` : '/');
              return;
            }
            const updated = await requestApi<PropertyDto>(`/api/properties/${property.id}/searches`, {
              method: 'PUT',
              body: JSON.stringify({ searchIds: selected })
            });
            if (updated.searchId && updated.searchId !== property.searchId) {
              router.replace(`/searches/${updated.searchId}/properties/${property.id}`);
            } else {
              invalidateProperties();
            }
            setMessage('Búsquedas actualizadas.');
          } catch (cause) {
            setMessage(cause instanceof Error ? cause.message : 'No fue posible actualizar.');
          }
        }}
      >
        <div className="membership-options">
          {searches.map((search) => (
            <label key={search.id}>
              <input
                type="checkbox"
                checked={selected.includes(search.id)}
                onChange={(event) => {
                  setSelected((current) =>
                    event.target.checked ? [...current, search.id] : current.filter((id) => id !== search.id)
                  );
                }}
              />
              <span>{search.name}</span>
            </label>
          ))}
        </div>
        {loadError ? (
          <p className="form-error" role="alert">
            {loadError}{' '}
            <button className="text-button" type="button" onClick={load}>
              Reintentar
            </button>
          </p>
        ) : null}
        {!selected.length && !property.catalogStatus ? (
          <label>
            <span>Escribe {property.title} para eliminar esta propiedad</span>
            <input
              value={confirmationTitle}
              onChange={(event) => setConfirmationTitle(event.target.value)}
              required
              autoFocus
            />
          </label>
        ) : null}
        <button className={`button${selected.length ? '' : ' danger'}`} type="submit">
          {selected.length
            ? 'Guardar búsquedas'
            : property.catalogStatus
              ? 'Quitar de mis búsquedas'
              : 'Eliminar propiedad'}
        </button>
        {message ? <p role="status">{message}</p> : null}
      </form>
    </section>
  );
}
