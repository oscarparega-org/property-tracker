'use client';
import { ActionForm } from '@/components/action-form';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { setDecisionStatusAction, toggleFavoriteAction } from '@/lib/property-actions';
import { MaterialIcon } from '@/components/material-icon';
import type { PropertyDto } from '@template/shared';
import { PropertyEditor } from '@/components/property-editor';
import { PropertyMap } from '@/components/property-map';
import { PropertyBoard } from '@/components/property-board';

type ViewMode = 'board' | 'split' | 'list' | 'map';

const statusLabels: Record<PropertyDto['decisionStatus'], string> = {
  NEW: 'Nueva',
  CONTACTED: 'Contactada',
  VISIT_SCHEDULED: 'Visita agendada',
  VISITED: 'Visitada',
  OFFER_MADE: 'Oferta enviada',
  REJECTED: 'Descartada',
  PURCHASED: 'Comprada'
};

const typeLabels: Record<PropertyDto['propertyType'], string> = {
  APARTMENT: 'Departamento',
  HOUSE: 'Casa',
  LAND: 'Terreno',
  OTHER: 'Otro'
};

function money(amount: number | null, currency: string | null) {
  if (amount === null) return 'Precio por confirmar';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency ?? 'MXN',
    maximumFractionDigits: 0
  }).format(amount);
}

function Metric({ value, label }: { value: string | number | null; label: string }) {
  return (
    <span className="metric">
      <strong>{value ?? '—'}</strong>
      <small>{label}</small>
    </span>
  );
}

function PropertyCard({
  property,
  selected,
  onSelect
}: {
  property: PropertyDto;
  selected: boolean;
  onSelect: () => void;
}) {
  const hero = property.images[0];
  return (
    <article className={`property-card${selected ? ' is-selected' : ''}${property.archivedAt ? ' is-archived' : ''}`}>
      <button type="button" className="card-select" onClick={onSelect}>
        <div className="card-image-wrap">
          {hero ? (
            // Listing images can come from arbitrary model-provided domains.
            <img src={hero.url} alt={hero.alt ?? property.title} className="card-image" />
          ) : (
            <div className="image-placeholder">Sin foto</div>
          )}
          <span className={`status-badge status-${property.decisionStatus.toLowerCase()}`}>
            {statusLabels[property.decisionStatus]}
          </span>
          {property.archivedAt && <span className="archived-badge">Archivada</span>}
        </div>
        <div className="card-copy">
          <span className="card-type">{typeLabels[property.propertyType]}</span>
          <h2>{property.title}</h2>
          <p className="address">{property.formattedAddress ?? property.neighborhood ?? 'Ubicación pendiente'}</p>
          <strong className="price">{money(property.priceAmount, property.priceCurrency)}</strong>
          <div className="metrics">
            <Metric value={property.bedrooms} label="rec." />
            <Metric value={property.bathrooms} label="baños" />
            <Metric value={property.parkingSpaces} label="autos" />
            <Metric value={property.constructionAreaM2 ? `${property.constructionAreaM2} m²` : null} label="const." />
          </div>
          {property.latitude === null && (
            <span className="no-location">
              <MaterialIcon name="locationOff" /> Sin ubicación en mapa
            </span>
          )}
        </div>
      </button>

      <div className="card-actions">
        <ActionForm action={toggleFavoriteAction.bind(null, property.id, !property.isFavorite)}>
          <button
            className={`favorite-button${property.isFavorite ? ' is-active' : ''}`}
            type="submit"
            aria-label={property.isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          >
            <MaterialIcon name={property.isFavorite ? 'favorite' : 'favoriteBorder'} />
          </button>
        </ActionForm>
      </div>
      <Link
        className="card-detail-button"
        href={`/properties/${property.id}`}
        aria-label={`Ver ${property.title}`}
        title="Ver propiedad"
      >
        <MaterialIcon name="arrowForward" />
      </Link>
    </article>
  );
}

export function PropertyWorkspace({ initialProperties }: { initialProperties: PropertyDto[] }) {
  const [view, setView] = useState<ViewMode>('board');
  const [properties, setProperties] = useState(initialProperties);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [type, setType] = useState('ALL');
  const [maxPrice, setMaxPrice] = useState('');
  const [minBedrooms, setMinBedrooms] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialProperties.find((item) => !item.archivedAt)?.id ?? null
  );
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => setProperties(initialProperties), [initialProperties]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es-MX');
    return properties.filter((property) => {
      if (!showArchived && property.archivedAt) return false;
      if (status !== 'ALL' && property.decisionStatus !== status) return false;
      if (type !== 'ALL' && property.propertyType !== type) return false;
      if (maxPrice && (property.priceAmount === null || property.priceAmount > Number(maxPrice))) return false;
      if (minBedrooms && (property.bedrooms === null || property.bedrooms < Number(minBedrooms))) return false;
      if (favoritesOnly && !property.isFavorite) return false;
      if (!needle) return true;
      return [property.title, property.neighborhood, property.formattedAddress, property.sourceListingKey]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('es-MX').includes(needle));
    });
  }, [favoritesOnly, properties, maxPrice, minBedrooms, query, showArchived, status, type]);

  const editing = properties.find((property) => property.id === editingId) ?? null;

  async function moveProperty(id: string, nextStatus: PropertyDto['decisionStatus']) {
    const previous = properties.find((property) => property.id === id);
    if (!previous || previous.decisionStatus === nextStatus || movingId) return;
    setMoveError('');
    setMovingId(id);
    setProperties((current) =>
      current.map((property) => (property.id === id ? { ...property, decisionStatus: nextStatus } : property))
    );
    try {
      const saved = await setDecisionStatusAction(id, nextStatus);
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
          <Link className="topbar-link" href="/drafts">
            Borradores
          </Link>
          <Link className="topbar-add" href="/properties/new">
            <MaterialIcon name="add" /> Agregar
          </Link>
        </div>
      </header>

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
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Estado de decisión">
          <option value="ALL">Todos los estados</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Tipo de propiedad">
          <option value="ALL">Todos los tipos</option>
          {Object.entries(typeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} aria-label="Precio máximo">
          <option value="">Cualquier precio</option>
          <option value="3000000">Hasta $3 M</option>
          <option value="5000000">Hasta $5 M</option>
          <option value="7000000">Hasta $7 M</option>
          <option value="10000000">Hasta $10 M</option>
        </select>
        <select
          value={minBedrooms}
          onChange={(event) => setMinBedrooms(event.target.value)}
          aria-label="Recámaras mínimas"
        >
          <option value="">Cualquier recámara</option>
          <option value="1">1+ recámaras</option>
          <option value="2">2+ recámaras</option>
          <option value="3">3+ recámaras</option>
          <option value="4">4+ recámaras</option>
        </select>
        <label className="check-filter">
          <input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} />{' '}
          Solo favoritas
        </label>
        <label className="check-filter">
          <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />{' '}
          Ver archivadas
        </label>
      </section>

      {moveError ? (
        <div className="board-error" role="alert">
          {moveError}
        </div>
      ) : null}

      {view === 'board' ? (
        <PropertyBoard properties={filtered} busyId={movingId} onMove={moveProperty} />
      ) : (
        <section className={`workspace view-${view}`}>
          <div className="list-pane">
            {filtered.length ? (
              filtered.map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  selected={property.id === selectedId}
                  onSelect={() => setSelectedId(property.id)}
                />
              ))
            ) : (
              <div className="empty-state">
                <span>
                  <MaterialIcon name="home" />
                </span>
                <h2>No hay propiedades aquí</h2>
                <p>Ajusta los filtros o agrega una por URL o manualmente.</p>
                <Link className="button primary" href="/properties/new">
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
                return selected ? (
                  <button type="button" className="map-selection" onClick={() => setEditingId(selected.id)}>
                    <span>{selected.neighborhood ?? typeLabels[selected.propertyType]}</span>
                    <strong>{money(selected.priceAmount, selected.priceCurrency)}</strong>
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
