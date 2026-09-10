'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type {
  CatalogLocationTreeDto,
  CatalogPageDto,
  CatalogPropertyDto,
  CurrentUserCapabilitiesDto,
  SearchDto
} from '@house-tracker/shared';
import { requestApi } from '@/lib/request-api';
import { MaterialIcon } from './material-icon';
import { PropertyCardContent } from './property-card-content';
import { propertyTypeLabels } from '@/lib/property-format';
import {
  bathroomOptions,
  catalogSortLabels,
  ChoiceGroup,
  listParam,
  optionalNumber,
  propertyTypeOptions,
  RangeFilter,
  roomOptions,
  sameList,
  type BathroomToken,
  type CatalogSort,
  type PropertyType,
  type RoomToken
} from './catalog-filter-controls';

export function CatalogBrowser({
  searchId,
  initialCatalog = null,
  initialLocations = []
}: {
  searchId?: string;
  initialCatalog?: CatalogPageDto | null;
  initialLocations?: CatalogLocationTreeDto;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const selectedProperty = params.get('selected');
  const [catalog, setCatalog] = useState<CatalogPageDto | null>(initialCatalog);
  const [locations, setLocations] = useState<CatalogLocationTreeDto>(initialLocations);
  const [capabilities, setCapabilities] = useState<CurrentUserCapabilitiesDto | null>(null);
  const [searches, setSearches] = useState<SearchDto[]>([]);
  const [selectedSearch, setSelectedSearch] = useState(searchId ?? '');
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const [neighborhoodId, setNeighborhoodId] = useState(() => params.get('neighborhoodId') ?? '');
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>(() =>
    listParam(params.get('propertyTypes'), propertyTypeOptions)
  );
  const [minPrice, setMinPrice] = useState(() => params.get('minPrice') ?? '');
  const [maxPrice, setMaxPrice] = useState(() => params.get('maxPrice') ?? '');
  const [bedrooms, setBedrooms] = useState<RoomToken[]>(() => listParam(params.get('bedrooms'), roomOptions));
  const [bathrooms, setBathrooms] = useState<BathroomToken[]>(() =>
    listParam(params.get('bathrooms'), bathroomOptions)
  );
  const [minArea, setMinArea] = useState(() => params.get('minConstructionAreaM2') ?? '');
  const [maxArea, setMaxArea] = useState(() => params.get('maxConstructionAreaM2') ?? '');
  const [sort, setSort] = useState<CatalogSort>(() => {
    const value = params.get('sort');
    return value && value in catalogSortLabels ? (value as CatalogSort) : 'modified_desc';
  });
  const [page, setPage] = useState(() => Math.max(1, Number(params.get('page')) || 1));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const rangeError = useMemo(() => {
    const priceMin = optionalNumber(minPrice);
    const priceMax = optionalNumber(maxPrice);
    const areaMin = optionalNumber(minArea);
    const areaMax = optionalNumber(maxArea);
    if ([priceMin, priceMax, areaMin, areaMax].some((value) => value !== undefined && value < 0))
      return 'Usa valores mayores o iguales a cero.';
    if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax)
      return 'El precio máximo debe ser mayor al mínimo.';
    if (areaMin !== undefined && areaMax !== undefined && areaMin > areaMax)
      return 'La construcción máxima debe ser mayor a la mínima.';
    return '';
  }, [minPrice, maxPrice, minArea, maxArea]);

  const activeFilterCount =
    propertyTypes.length +
    bedrooms.length +
    bathrooms.length +
    (minPrice || maxPrice ? 1 : 0) +
    (minArea || maxArea ? 1 : 0);

  useEffect(() => {
    void Promise.all([
      requestApi<CatalogLocationTreeDto>('/api/catalog/locations'),
      requestApi<CurrentUserCapabilitiesDto>('/api/capabilities')
    ])
      .then(([tree, access]) => {
        setLocations(tree);
        setCapabilities(access);
        const first = tree[0]?.municipalities[0]?.neighborhoods[0];
        if (first) setNeighborhoodId((current) => current || first.id);
        if (access.authenticated)
          void requestApi<SearchDto[]>('/api/searches')
            .then((items) => {
              setSearches(items);
              setSelectedSearch((current) => current || items[0]?.id || '');
            })
            .catch((cause) =>
              setError(cause instanceof Error ? cause.message : 'No fue posible cargar tus búsquedas.')
            );
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'No fue posible preparar el catálogo.'));
  }, []);

  useEffect(() => {
    function restoreFiltersFromHistory() {
      const historyParams = new URLSearchParams(window.location.search);
      const nextTypes = listParam(historyParams.get('propertyTypes'), propertyTypeOptions);
      const nextBedrooms = listParam(historyParams.get('bedrooms'), roomOptions);
      const nextBathrooms = listParam(historyParams.get('bathrooms'), bathroomOptions);
      const nextSort = historyParams.get('sort');
      setQuery(historyParams.get('q') ?? '');
      setNeighborhoodId(
        historyParams.get('neighborhoodId') ?? locations[0]?.municipalities[0]?.neighborhoods[0]?.id ?? ''
      );
      setPropertyTypes((current) => (sameList(current, nextTypes) ? current : nextTypes));
      setMinPrice(historyParams.get('minPrice') ?? '');
      setMaxPrice(historyParams.get('maxPrice') ?? '');
      setBedrooms((current) => (sameList(current, nextBedrooms) ? current : nextBedrooms));
      setBathrooms((current) => (sameList(current, nextBathrooms) ? current : nextBathrooms));
      setMinArea(historyParams.get('minConstructionAreaM2') ?? '');
      setMaxArea(historyParams.get('maxConstructionAreaM2') ?? '');
      setSort(nextSort && nextSort in catalogSortLabels ? (nextSort as CatalogSort) : 'modified_desc');
      setPage(Math.max(1, Number(historyParams.get('page')) || 1));
    }

    window.addEventListener('popstate', restoreFiltersFromHistory);
    return () => window.removeEventListener('popstate', restoreFiltersFromHistory);
  }, [locations]);

  useEffect(() => {
    if (rangeError) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      const publicParams = new URLSearchParams();
      if (selectedProperty) publicParams.set('selected', selectedProperty);
      if (query.trim()) publicParams.set('q', query.trim());
      if (neighborhoodId) publicParams.set('neighborhoodId', neighborhoodId);
      if (propertyTypes.length) publicParams.set('propertyTypes', propertyTypes.join(','));
      if (minPrice) publicParams.set('minPrice', minPrice);
      if (maxPrice) publicParams.set('maxPrice', maxPrice);
      if (bedrooms.length) publicParams.set('bedrooms', bedrooms.join(','));
      if (bathrooms.length) publicParams.set('bathrooms', bathrooms.join(','));
      if (minArea) publicParams.set('minConstructionAreaM2', minArea);
      if (maxArea) publicParams.set('maxConstructionAreaM2', maxArea);
      if (sort !== 'modified_desc') publicParams.set('sort', sort);
      if (page > 1) publicParams.set('page', String(page));
      router.replace(publicParams.size ? `/?${publicParams}` : '/', { scroll: false });

      const apiParams = new URLSearchParams(publicParams);
      apiParams.delete('selected');
      apiParams.set('pageSize', '24');
      setError('');
      void requestApi<CatalogPageDto>(`/api/catalog/properties?${apiParams}`, { signal: controller.signal })
        .then((result) => {
          if (result.totalPages > 0 && page > result.totalPages) setPage(1);
          else setCatalog(result);
        })
        .catch((cause) => {
          if (!controller.signal.aborted)
            setError(cause instanceof Error ? cause.message : 'No fue posible cargar las propiedades.');
        });
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    query,
    neighborhoodId,
    propertyTypes,
    minPrice,
    maxPrice,
    bedrooms,
    bathrooms,
    minArea,
    maxArea,
    sort,
    page,
    rangeError,
    router,
    selectedProperty
  ]);

  const municipality = locations[0]?.municipalities[0];
  const neighborhood = useMemo(
    () =>
      locations
        .flatMap((state) => state.municipalities.flatMap((item) => item.neighborhoods))
        .find((item) => item.id === neighborhoodId),
    [locations, neighborhoodId]
  );

  function clearFilters() {
    setPropertyTypes([]);
    setMinPrice('');
    setMaxPrice('');
    setBedrooms([]);
    setBathrooms([]);
    setMinArea('');
    setMaxArea('');
  }

  async function add(property: CatalogPropertyDto) {
    if (!capabilities?.authenticated) {
      const returnParams = new URLSearchParams(params);
      returnParams.set('selected', property.id);
      router.push(`/sign-in?returnTo=${encodeURIComponent(`/?${returnParams}`)}`);
      return;
    }
    if (!selectedSearch) {
      setError('Crea una búsqueda antes de agregar propiedades.');
      return;
    }
    setBusyId(property.id);
    setError('');
    try {
      await requestApi(`/api/searches/${encodeURIComponent(selectedSearch)}/properties`, {
        method: 'POST',
        body: JSON.stringify({ propertyId: property.id })
      });
      router.push(`/searches/${selectedSearch}/properties/${property.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible agregar la propiedad.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="catalog-page catalog-app-page">
      <section className="catalog-intro">
        <div>
          <h1>Explora propiedades</h1>
          <p>Compara el inventario disponible en Narvarte Poniente y guarda las opciones que quieras seguir.</p>
        </div>
        {capabilities?.role === 'ADMIN' ? (
          <Link className="button subtle" href="/admin/catalog/import">
            <MaterialIcon name="add" /> Importar propiedad
          </Link>
        ) : null}
      </section>

      <section className="catalog-location-bar" aria-label="Ubicación del catálogo">
        <label>
          <span>Estado</span>
          <select aria-label="Estado" value={locations[0]?.id ?? ''} disabled>
            <option value={locations[0]?.id ?? ''}>{locations[0]?.name ?? 'Ciudad de México'}</option>
          </select>
        </label>
        <label>
          <span>Alcaldía</span>
          <select aria-label="Alcaldía" value={municipality?.id ?? ''} disabled>
            <option value={municipality?.id ?? ''}>{municipality?.name ?? 'Benito Juárez'}</option>
          </select>
        </label>
        <label>
          <span>Colonia</span>
          <select value={neighborhoodId} onChange={(event) => setNeighborhoodId(event.target.value)}>
            {locations
              .flatMap((state) => state.municipalities.flatMap((item) => item.neighborhoods))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
      </section>

      <section className="catalog-filter-workbench" aria-label="Filtros de propiedades">
        <div className="catalog-filterbar">
          <label className="search-box">
            <MaterialIcon name="search" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por calle, título o clave"
              aria-label="Buscar propiedades"
            />
          </label>
          <button
            className="catalog-filter-toggle"
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="catalog-advanced-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <MaterialIcon name="filter" /> Filtros{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </button>
          <label className="catalog-sort">
            <span>Ordenar</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as CatalogSort)}>
              {Object.entries(catalogSortLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={`catalog-advanced-filters${filtersOpen ? ' is-open' : ''}`} id="catalog-advanced-filters">
          <ChoiceGroup
            legend="Tipo"
            options={propertyTypeOptions}
            selected={propertyTypes}
            labels={propertyTypeLabels}
            onChange={setPropertyTypes}
          />
          <RangeFilter
            legend="Precio"
            unit="MXN"
            step="100000"
            minimum={minPrice}
            maximum={maxPrice}
            setMinimum={setMinPrice}
            setMaximum={setMaxPrice}
          />
          <ChoiceGroup legend="Recámaras" options={roomOptions} selected={bedrooms} onChange={setBedrooms} compact />
          <ChoiceGroup legend="Baños" options={bathroomOptions} selected={bathrooms} onChange={setBathrooms} compact />
          <RangeFilter
            legend="Construcción"
            unit="m²"
            step="5"
            minimum={minArea}
            maximum={maxArea}
            setMinimum={setMinArea}
            setMaximum={setMaxArea}
          />
        </div>

        {rangeError || activeFilterCount ? (
          <div className="catalog-filter-summary">
            {rangeError ? <p role="alert">{rangeError}</p> : <span>{activeFilterCount} filtros activos</span>}
            {activeFilterCount ? (
              <button type="button" onClick={clearFilters}>
                Limpiar filtros
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="catalog-results" aria-live="polite">
        <header className="catalog-results-heading">
          <div className="catalog-result-context">
            <div>
              <strong>{catalog?.total ?? '—'}</strong>
              <span>{catalog?.total === 1 ? 'propiedad disponible' : 'propiedades disponibles'}</span>
            </div>
            <p>
              {neighborhood?.name ?? 'Narvarte Poniente'}, {municipality?.name ?? 'Benito Juárez'}
            </p>
          </div>
          {capabilities?.authenticated ? (
            searches.length ? (
              <label className="catalog-destination">
                <span>Guardar en búsqueda</span>
                <select
                  value={selectedSearch}
                  onChange={(event) => setSelectedSearch(event.target.value)}
                  aria-label="Búsqueda de destino"
                >
                  {searches.map((search) => (
                    <option key={search.id} value={search.id}>
                      {search.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <Link className="catalog-create-search" href="/searches">
                Crea una búsqueda para guardar propiedades
              </Link>
            )
          ) : null}
        </header>

        {error ? (
          <div className="catalog-guidance" role="alert">
            <p>{error}</p>
            {capabilities?.authenticated && !searches.length ? <Link href="/searches">Crear búsqueda</Link> : null}
          </div>
        ) : null}
        {!catalog && !rangeError ? (
          <div className="catalog-loading" aria-label="Cargando propiedades">
            <span />
            <span />
          </div>
        ) : catalog?.items.length ? (
          <div className="catalog-grid">
            {catalog.items.map((property) => {
              return (
                <article
                  className={`property-card catalog-property-card${selectedProperty === property.id ? ' is-selected' : ''}`}
                  key={property.id}
                  id={selectedProperty === property.id ? 'selected-property' : undefined}
                >
                  <Link className="card-select" href={`/catalog/${property.id}`} aria-label={`Ver ${property.title}`}>
                    <PropertyCardContent
                      property={property}
                      badges={<span className="status-badge catalog-status-badge">Disponible</span>}
                    />
                  </Link>
                  <div className="catalog-property-action">
                    <button
                      className="button primary"
                      type="button"
                      disabled={busyId === property.id}
                      onClick={() => void add(property)}
                    >
                      {busyId === property.id ? 'Agregando…' : 'Agregar a mi búsqueda'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="catalog-empty">
            <h2>No encontramos propiedades con esos filtros</h2>
            <p>Ajusta o limpia los filtros para ampliar los resultados.</p>
          </div>
        )}
        {catalog && catalog.totalPages > 1 ? (
          <nav className="catalog-pagination" aria-label="Páginas del catálogo">
            <button type="button" disabled={catalog.page <= 1} onClick={() => setPage((current) => current - 1)}>
              Anterior
            </button>
            <span>
              Página {catalog.page} de {catalog.totalPages}
            </span>
            <button
              type="button"
              disabled={catalog.page >= catalog.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Siguiente
            </button>
          </nav>
        ) : null}
      </section>
    </main>
  );
}
