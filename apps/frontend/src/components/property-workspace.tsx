'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { setDecisionStatusAction } from '@/lib/property-actions';
import { MaterialIcon } from '@/components/material-icon';
import type { PropertyDto } from '@house-tracker/shared';
import { PropertyEditor } from '@/components/property-editor';
import { PropertyMap } from '@/components/property-map';
import { PropertyBoard } from '@/components/property-board';
import { SearchContextBar } from '@/components/search-context-bar';
import { formatMoney, propertyTypeLabels } from '@/lib/property-format';
import { filterProperties, type BathroomToken, type PropertySort, type ThresholdToken } from '@/lib/property-filtering';
import { decisionStatusLabels, SearchPropertyCard } from './search-property-card';
import { FilterDialog, MultiFilter, RangeInputs } from './workspace-filter-controls';

type ViewMode = 'board' | 'split' | 'list' | 'map';

export function PropertyWorkspace({
  initialProperties,
  searchId,
  initialView = 'list'
}: {
  initialProperties: PropertyDto[];
  searchId: string;
  initialView?: 'board' | 'list';
}) {
  const [view, setView] = useState<ViewMode>(initialView);
  const [properties, setProperties] = useState(initialProperties);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [types, setTypes] = useState<PropertyDto['propertyType'][]>([]);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [bedrooms, setBedrooms] = useState<ThresholdToken[]>([]);
  const [bathrooms, setBathrooms] = useState<BathroomToken[]>([]);
  const [minArea, setMinArea] = useState('');
  const [maxArea, setMaxArea] = useState('');
  const [sort, setSort] = useState<PropertySort>('modified_desc');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialProperties.find((item) => !item.archivedAt)?.id ?? null
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => setProperties(initialProperties), [initialProperties]);
  useEffect(() => setView(initialView), [initialView]);

  const filtered = useMemo(
    () =>
      filterProperties(properties, {
        query,
        status,
        types,
        minPrice,
        maxPrice,
        bedrooms,
        bathrooms,
        minArea,
        maxArea,
        favoritesOnly,
        showArchived,
        sort
      }),
    [
      properties,
      query,
      status,
      types,
      minPrice,
      maxPrice,
      bedrooms,
      bathrooms,
      minArea,
      maxArea,
      favoritesOnly,
      showArchived,
      sort
    ]
  );

  const editing = properties.find((property) => property.id === editingId) ?? null;
  const activeFilterCount = [
    status !== 'ALL',
    types.length > 0,
    Boolean(minPrice),
    Boolean(maxPrice),
    bedrooms.length > 0,
    bathrooms.length > 0,
    Boolean(minArea),
    Boolean(maxArea),
    sort !== 'modified_desc',
    favoritesOnly,
    showArchived
  ].filter(Boolean).length;

  function clearFilters() {
    setStatus('ALL');
    setTypes([]);
    setMinPrice('');
    setMaxPrice('');
    setBedrooms([]);
    setBathrooms([]);
    setMinArea('');
    setMaxArea('');
    setSort('modified_desc');
    setFavoritesOnly(false);
    setShowArchived(false);
  }

  const filterControls = (
    <>
      <label>
        <span>Estado</span>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Estado de decisión">
          <option value="ALL">Todos los estados</option>
          {Object.entries(decisionStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <MultiFilter
        label="Tipo"
        values={Object.keys(propertyTypeLabels) as PropertyDto['propertyType'][]}
        selected={types}
        labels={propertyTypeLabels}
        onChange={setTypes}
      />
      <RangeInputs
        label="Precio"
        minimum={minPrice}
        maximum={maxPrice}
        setMinimum={setMinPrice}
        setMaximum={setMaxPrice}
      />
      <MultiFilter label="Recámaras" values={['1', '2', '3', '4+']} selected={bedrooms} onChange={setBedrooms} />
      <MultiFilter
        label="Baños"
        values={['1', '1.5', '2', '2.5', '3', '3.5', '4+']}
        selected={bathrooms}
        onChange={setBathrooms}
      />
      <RangeInputs
        label="Construcción m²"
        minimum={minArea}
        maximum={maxArea}
        setMinimum={setMinArea}
        setMaximum={setMaxArea}
      />
      <label>
        <span>Ordenar</span>
        <select value={sort} onChange={(event) => setSort(event.target.value as PropertySort)} aria-label="Ordenar">
          <option value="modified_desc">Más recientes</option>
          <option value="price_asc">Precio: menor a mayor</option>
          <option value="price_desc">Precio: mayor a menor</option>
          <option value="area_asc">Construcción: menor a mayor</option>
          <option value="area_desc">Construcción: mayor a menor</option>
        </select>
      </label>
      <label className="check-filter">
        <input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} />{' '}
        Solo favoritas
      </label>
      <label className="check-filter">
        <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Ver
        archivadas
      </label>
    </>
  );

  async function moveProperty(id: string, nextStatus: PropertyDto['decisionStatus']) {
    const previous = properties.find((property) => property.id === id);
    if (!previous || previous.decisionStatus === nextStatus || movingId) return;
    setMoveError('');
    setMovingId(id);
    setProperties((current) =>
      current.map((property) => (property.id === id ? { ...property, decisionStatus: nextStatus } : property))
    );
    try {
      const saved = await setDecisionStatusAction(id, nextStatus, searchId);
      setProperties((current) => current.map((property) => (property.id === id ? saved : property)));
    } catch (cause) {
      setProperties((current) => current.map((property) => (property.id === id ? previous : property)));
      setMoveError(cause instanceof Error ? cause.message : 'No fue posible cambiar la etapa.');
    } finally {
      setMovingId(null);
    }
  }

  return (
    <main className="app-shell">
      <SearchContextBar searchId={searchId} />
      <header className="workspace-toolbar">
        <div className="portfolio-count">
          <span>{filtered.length}</span>
          <small>{filtered.length === 1 ? 'propiedad' : 'propiedades'}</small>
        </div>
        <div className="view-switch" aria-label="Vista">
          {(['board', 'list', 'split', 'map'] as const).map((mode) => (
            <button key={mode} type="button" className={view === mode ? 'is-active' : ''} onClick={() => setView(mode)}>
              {mode === 'board' ? 'Proceso' : mode === 'list' ? 'Lista' : mode === 'split' ? 'Mitad' : 'Mapa'}
            </button>
          ))}
          <Link className="topbar-link" href={`/searches/${searchId}/drafts`}>
            Borradores
          </Link>
          <Link className="topbar-add" href={`/searches/${searchId}/properties/new`}>
            <MaterialIcon name="add" /> Agregar
          </Link>
        </div>
      </header>

      <div className="mobile-workspace-heading">
        <div>
          <span>{filtered.length}</span>
          <strong>{filtered.length === 1 ? 'propiedad' : 'propiedades'}</strong>
        </div>
        <Link href={`/searches/${searchId}/properties/new`} aria-label="Agregar propiedad">
          <MaterialIcon name="add" />
        </Link>
      </div>

      <section className="filterbar" aria-label="Filtros">
        <label className="search-box">
          <span>
            <MaterialIcon name="search" />
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Busca colonia, calle o clave…"
          />
        </label>
        <div className="desktop-filter-controls">{filterControls}</div>
        <button className="mobile-filter-button" type="button" onClick={() => setFiltersOpen(true)}>
          <MaterialIcon name="filter" /> Filtros {activeFilterCount ? <span>{activeFilterCount}</span> : null}
        </button>
      </section>

      {filtersOpen ? (
        <FilterDialog activeCount={activeFilterCount} onClose={() => setFiltersOpen(false)} onClear={clearFilters}>
          {filterControls}
        </FilterDialog>
      ) : null}

      {moveError ? (
        <div className="board-error" role="alert">
          {moveError}
        </div>
      ) : null}

      {view === 'board' ? (
        <PropertyBoard properties={filtered} busyId={movingId} onMove={moveProperty} searchId={searchId} />
      ) : (
        <section className={`workspace view-${view}`}>
          <div className="list-pane">
            {filtered.length ? (
              filtered.map((property) => (
                <SearchPropertyCard key={property.id} property={property} searchId={searchId} />
              ))
            ) : (
              <div className="empty-state">
                <span>
                  <MaterialIcon name="home" />
                </span>
                <h2>No hay propiedades aquí</h2>
                <p>Ajusta los filtros o agrega una desde el catálogo.</p>
                <Link className="button primary" href={`/searches/${searchId}/properties/new`}>
                  Agregar propiedad
                </Link>
              </div>
            )}
          </div>
          <div className="map-pane">
            <PropertyMap properties={filtered} selectedId={selectedId} onSelect={setSelectedId} />
            {view === 'map' &&
              selectedId &&
              (() => {
                const selected = filtered.find((item) => item.id === selectedId);
                return selected && !selected.catalogStatus ? (
                  <button type="button" className="map-selection" onClick={() => setEditingId(selected.id)}>
                    <span>{selected.neighborhood ?? propertyTypeLabels[selected.propertyType]}</span>
                    <strong>{formatMoney(selected.priceAmount, selected.priceCurrency)}</strong>
                    <small>
                      Editar propiedad <MaterialIcon name="arrowForward" />
                    </small>
                  </button>
                ) : null;
              })()}
          </div>
        </section>
      )}

      {editing && <PropertyEditor property={editing} onClose={() => setEditingId(null)} />}
    </main>
  );
}
