'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import type { SearchDto } from '@house-tracker/shared';
import { useApiResource } from '@/lib/use-api-resource';
import { BodyNavigation } from './body-navigation';
import { CatalogBrowser } from './catalog-browser';
import { NewManualEditor } from './new-manual-editor';
import { UrlImportForm } from './url-import-form';

type AddMode = 'catalog' | 'url' | 'manual';

function AddTabs({ searchId, mode }: { searchId: string; mode: AddMode }) {
  const base = `/searches/${searchId}/properties/new`;
  return (
    <nav className="add-tabs" aria-label="Forma de agregar propiedad">
      <Link className={mode === 'catalog' ? 'is-active' : ''} href={base}>
        Catálogo
      </Link>
      <Link className={mode === 'url' ? 'is-active' : ''} href={`${base}?mode=url`}>
        Desde una URL
      </Link>
      <Link className={mode === 'manual' ? 'is-active' : ''} href={`${base}?mode=manual`}>
        Captura manual
      </Link>
    </nav>
  );
}

export function SearchAddPage({ searchId, mode }: { searchId: string; mode: AddMode }) {
  const { data: searches, error, refresh: load } = useApiResource<SearchDto[]>('/api/searches');
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
  if (mode === 'catalog')
    return (
      <>
        <div className="catalog-add-context">
          <BodyNavigation current="Agregar propiedad" backLabel="Cerrar" backHref={`/searches/${searchId}`} />
          <AddTabs searchId={searchId} mode={mode} />
        </div>
        <Suspense fallback={<p className="empty-state">Cargando catálogo…</p>}>
          <CatalogBrowser searchId={searchId} />
        </Suspense>
      </>
    );
  return (
    <main className="add-page">
      <BodyNavigation current="Agregar propiedad" backLabel="Cerrar" backHref={`/searches/${searchId}`} />
      <section className="add-card">
        <span className="eyebrow">Nueva propiedad</span>
        <h1>¿Cómo quieres agregarla?</h1>
        <AddTabs searchId={searchId} mode={mode} />
        <UrlImportForm searchId={searchId} searches={searches} />
      </section>
    </main>
  );
}
