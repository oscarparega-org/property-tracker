'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SearchDto } from '@house-tracker/shared';
import { requestApi } from '@/lib/request-api';
import { MaterialIcon } from './material-icon';

type Impact = { name: string; membershipCount: number; orphanCount: number };

export function SearchOverview() {
  const [searches, setSearches] = useState<SearchDto[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<{ search: SearchDto; impact: Impact } | null>(null);

  async function load() {
    setError('');
    try {
      setSearches(await requestApi<SearchDto[]>('/api/searches'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar tus búsquedas.');
    }
  }
  useEffect(() => void load(), []);

  if (error && !searches)
    return (
      <main className="search-home">
        <p className="form-error" role="alert">
          {error}
        </p>
        <button className="button" type="button" onClick={() => void load()}>
          Reintentar
        </button>
      </main>
    );
  if (!searches)
    return (
      <main className="search-home search-home-loading" aria-label="Cargando búsquedas">
        <div />
        <div />
      </main>
    );

  return (
    <main className="search-home">
      <header className="search-home-heading">
        <div>
          <h1>Tus búsquedas de propiedad</h1>
          <p>Cada búsqueda conserva su propia decisión. Los datos de una propiedad se comparten entre todas.</p>
        </div>
        <span className="search-capacity">
          <strong>{searches.length}</strong> de 3 activas
        </span>
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {!searches.length ? (
        <section className="first-search">
          <span className="first-search-mark">
            <MaterialIcon name="home" />
          </span>
          <div>
            <h2>Empieza por una zona o una idea</h2>
            <p>Después podrás agregar propiedades y seguir decisiones diferentes en cada búsqueda.</p>
          </div>
          <button className="button primary" type="button" onClick={() => setCreating(true)}>
            Crear mi primera búsqueda
          </button>
        </section>
      ) : (
        <section className="search-folio" aria-label="Búsquedas activas">
          {searches.map((search, index) => (
            <article className={`search-sheet${index === 0 ? ' is-current' : ''}`} key={search.id}>
              <Link href={`/searches/${search.id}`} className="search-sheet-main">
                <span className="search-sheet-index">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h2>{search.name}</h2>
                  <p>
                    {search.propertyCount} {search.propertyCount === 1 ? 'propiedad' : 'propiedades'}
                    {search.draftCount ? ` · ${search.draftCount} en revisión` : ''}
                  </p>
                </div>
                <MaterialIcon name="arrowForward" />
              </Link>
              <div className="search-progress" aria-label="Distribución por etapa">
                {Object.entries(search.statusCounts).map(([status, count]) => (
                  <span key={status} title={`${status}: ${count}`} style={{ flexGrow: count }} />
                ))}
              </div>
              <button
                className="search-delete"
                type="button"
                onClick={async () => {
                  setError('');
                  try {
                    const impact = await requestApi<Impact>(`/api/searches/${search.id}/deletion-impact`);
                    setDeleting({ search, impact });
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : 'No fue posible calcular el impacto.');
                  }
                }}
              >
                Eliminar
              </button>
            </article>
          ))}
          {searches.length < 3 ? (
            <button className="search-create-slot" type="button" onClick={() => setCreating(true)}>
              <MaterialIcon name="add" />
              <span>Nueva búsqueda</span>
            </button>
          ) : null}
        </section>
      )}

      {creating ? (
        <form
          className="inline-search-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const name = String(new FormData(event.currentTarget).get('name') || '');
            try {
              await requestApi('/api/searches', { method: 'POST', body: JSON.stringify({ name }) });
              setCreating(false);
              await load();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'No fue posible crear la búsqueda.');
            }
          }}
        >
          <label>
            <span>Nombre de la búsqueda</span>
            <input name="name" required maxLength={80} autoFocus placeholder="Ej. Roma Norte" />
          </label>
          <div>
            <button className="button primary" type="submit">
              Crear búsqueda
            </button>
            <button className="text-button" type="button" onClick={() => setCreating(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {deleting ? (
        <form
          className="delete-search-panel"
          onSubmit={async (event) => {
            event.preventDefault();
            const confirmationName = String(new FormData(event.currentTarget).get('confirmationName') || '');
            try {
              await requestApi(`/api/searches/${deleting.search.id}`, {
                method: 'DELETE',
                body: JSON.stringify({
                  confirmationName,
                  expectedMembershipCount: deleting.impact.membershipCount,
                  expectedOrphanCount: deleting.impact.orphanCount
                })
              });
              setDeleting(null);
              await load();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'No fue posible eliminar la búsqueda.');
            }
          }}
        >
          <h2>Eliminar “{deleting.search.name}”</h2>
          <p>
            Se eliminarán {deleting.impact.membershipCount} vínculos. {deleting.impact.orphanCount} propiedades dejarán
            de pertenecer a otra búsqueda y se eliminarán permanentemente.
          </p>
          <label>
            <span>Escribe {deleting.search.name} para confirmar</span>
            <input name="confirmationName" required autoFocus />
          </label>
          <div>
            <button className="button danger" type="submit">
              Eliminar búsqueda
            </button>
            <button className="text-button" type="button" onClick={() => setDeleting(null)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </main>
  );
}
