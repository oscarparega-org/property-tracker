'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchDto } from '@house-tracker/shared';
import { requestApi } from '@/lib/request-api';

export function SearchContextBar({ searchId }: { searchId: string }) {
  const router = useRouter();
  const [searches, setSearches] = useState<SearchDto[]>([]);
  const [error, setError] = useState(false);
  const load = () => {
    setError(false);
    void requestApi<SearchDto[]>('/api/searches')
      .then(setSearches)
      .catch(() => setError(true));
  };
  useEffect(load, []);
  return (
    <nav className="search-context" aria-label="Búsqueda actual">
      <Link href="/">Todas las búsquedas</Link>
      <span>/</span>
      <select
        aria-label="Cambiar búsqueda"
        value={searchId}
        onChange={(event) => router.push(`/searches/${event.target.value}`)}
      >
        {searches.length ? (
          searches.map((search) => (
            <option key={search.id} value={search.id}>
              {search.name}
            </option>
          ))
        ) : (
          <option value={searchId}>Cargando…</option>
        )}
      </select>
      {error ? (
        <button className="text-button" type="button" onClick={load}>
          Reintentar
        </button>
      ) : null}
    </nav>
  );
}
