import { Suspense } from 'react';
import { CatalogBrowser } from '@/components/catalog-browser';
import type { CatalogLocationTreeDto, CatalogPageDto } from '@house-tracker/shared';
import { serverApi } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'selected' || value === undefined) continue;
    query.set(key, Array.isArray(value) ? (value[0] ?? '') : value);
  }
  query.set('pageSize', '24');
  const [initialCatalog, initialLocations] = await Promise.all([
    serverApi<CatalogPageDto>(`/api/catalog/properties?${query}`).catch(() => null),
    serverApi<CatalogLocationTreeDto>('/api/catalog/locations').catch(() => [])
  ]);
  return (
    <Suspense fallback={<p className="empty-state">Cargando propiedades…</p>}>
      <CatalogBrowser initialCatalog={initialCatalog} initialLocations={initialLocations} />
    </Suspense>
  );
}
