'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SearchDto } from '@house-tracker/shared';
import { requestApi } from '@/lib/request-api';
import { BodyNavigation } from './body-navigation';
import { NewManualEditor } from './new-manual-editor';
import { UrlImportForm } from './url-import-form';

export function SearchAddPage({ searchId, mode }: { searchId: string; mode: 'url' | 'manual' }) {
  const [searches, setSearches] = useState<SearchDto[] | null>(null);
  const [error, setError] = useState('');
  const load = () => {
    setError('');
    void requestApi<SearchDto[]>('/api/searches')
      .then(setSearches)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'No fue posible cargar tus búsquedas.'));
  };
  useEffect(load, []);
  if (error)
    return (
      <div className="empty-state">
        <p className="form-error" role="alert">
          {error}
        </p>
        <button className="button" type="button" onClick={load}>
          Reintentar
        </button>
      </div>
    );
  if (!searches)
    return (
      <p className="empty-state" role="status">
        Cargando búsquedas…
      </p>
    );
  if (!searches.some((search) => search.id === searchId)) return <p className="empty-state">Búsqueda no encontrada.</p>;
  if (mode === 'manual') return <NewManualEditor searchId={searchId} searches={searches} />;
  return (
    <main className="add-page">
      <BodyNavigation current="Agregar propiedad" backLabel="Cerrar" backHref={`/searches/${searchId}`} />
      <section className="add-card">
        <span className="eyebrow">Nueva propiedad</span>
        <h1>¿Cómo quieres agregarla?</h1>
        <nav className="add-tabs">
          <Link className="is-active" href={`/searches/${searchId}/properties/new`}>
            Desde una URL
          </Link>
          <Link href={`/searches/${searchId}/properties/new?mode=manual`}>Captura manual</Link>
        </nav>
        <UrlImportForm searchId={searchId} searches={searches} />
      </section>
    </main>
  );
}
