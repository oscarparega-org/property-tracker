'use client';

import Link from 'next/link';
import { useState, type DragEvent } from 'react';
import type { PropertyDto } from '@house-tracker/shared';
import { MaterialIcon } from '@/components/material-icon';

export const lifecycle = [
  { status: 'NEW', label: 'Nueva', description: 'Recién encontrada', tone: 'sand' },
  { status: 'CONTACTED', label: 'Contactada', description: 'Ya hablaste con el contacto', tone: 'blue' },
  { status: 'VISIT_SCHEDULED', label: 'Visita agendada', description: 'Hay una fecha en puerta', tone: 'violet' },
  { status: 'VISITED', label: 'Visitada', description: 'Lista para evaluar', tone: 'purple' },
  { status: 'OFFER_MADE', label: 'Oferta enviada', description: 'En negociación', tone: 'orange' },
  { status: 'PURCHASED', label: 'Comprada', description: 'Proceso completado', tone: 'green' },
  { status: 'REJECTED', label: 'Descartada', description: 'Fuera de consideración', tone: 'red' }
] as const satisfies ReadonlyArray<{
  status: PropertyDto['decisionStatus'];
  label: string;
  description: string;
  tone: string;
}>;

const statusLabels = Object.fromEntries(lifecycle.map((item) => [item.status, item.label])) as Record<
  PropertyDto['decisionStatus'],
  string
>;

function money(amount: number | null, currency: string | null) {
  if (amount === null) return 'Precio por confirmar';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency ?? 'MXN',
    maximumFractionDigits: 0
  }).format(amount);
}

function ProcessCard({
  property,
  busyId,
  onMove,
  searchId,
  draggable = false
}: {
  property: PropertyDto;
  busyId: string | null;
  onMove: (id: string, status: PropertyDto['decisionStatus']) => void;
  searchId: string;
  draggable?: boolean;
}) {
  return (
    <article className={`kanban-card${busyId === property.id ? ' is-saving' : ''}`} draggable={draggable}>
      <Link
        className="kanban-card-main"
        href={`/searches/${searchId}/properties/${property.id}`}
        aria-label={`Ver ${property.title}`}
      >
        <div className="kanban-card-image">
          {property.images[0] ? (
            <img src={property.images[0].url} alt="" />
          ) : (
            <div className="image-placeholder">Sin foto</div>
          )}
          {property.isFavorite ? (
            <span className="kanban-favorite">
              <MaterialIcon name="favorite" />
            </span>
          ) : null}
          {draggable ? (
            <span className="drag-handle" aria-hidden="true">
              ⠿
            </span>
          ) : null}
        </div>
        <div className="kanban-card-copy">
          <span>{property.neighborhood ?? property.municipality ?? 'Ubicación pendiente'}</span>
          <h3>{property.title}</h3>
          <strong>{money(property.priceAmount, property.priceCurrency)}</strong>
          <div className="kanban-meta">
            <span>{property.bedrooms ?? '—'} rec.</span>
            <span>{property.bathrooms ?? '—'} baños</span>
            {property.constructionAreaM2 ? <span>{property.constructionAreaM2} m²</span> : null}
          </div>
        </div>
      </Link>
      <div className="kanban-card-actions">
        <label>
          <span>Etapa</span>
          <select
            value={property.decisionStatus}
            disabled={busyId === property.id}
            onChange={(event) => onMove(property.id, event.target.value as PropertyDto['decisionStatus'])}
            aria-label={`Etapa de ${property.title}`}
          >
            {lifecycle.map((option) => (
              <option key={option.status} value={option.status}>
                {statusLabels[option.status]}
              </option>
            ))}
          </select>
        </label>
        <Link href={`/searches/${searchId}/properties/${property.id}`} aria-label={`Ver ${property.title}`}>
          <MaterialIcon name="arrowForward" />
        </Link>
      </div>
    </article>
  );
}

export function PropertyBoard({
  properties,
  busyId,
  onMove,
  searchId
}: {
  properties: PropertyDto[];
  busyId: string | null;
  onMove: (id: string, status: PropertyDto['decisionStatus']) => void;
  searchId: string;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<PropertyDto['decisionStatus'] | null>(null);

  function drop(event: DragEvent, status: PropertyDto['decisionStatus']) {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/property-id') || draggedId;
    setDraggedId(null);
    setOverStatus(null);
    if (id) onMove(id, status);
  }

  return (
    <section className="board-shell" aria-label="Proceso de propiedades">
      <div className="board-intro">
        <div>
          <span className="eyebrow">Tu proceso de compra</span>
          <h1>De hallazgo a hogar</h1>
          <p>Organiza cada propiedad por etapa. Los cambios se guardan automáticamente.</p>
        </div>
        <div className="board-legend">
          <span />
          <strong>{properties.length}</strong> activas en el proceso
        </div>
      </div>
      <div className="kanban-board">
        {lifecycle.map((stage, index) => {
          const cards = properties.filter((property) => property.decisionStatus === stage.status);
          return (
            <section
              key={stage.status}
              className={`kanban-column tone-${stage.tone}${overStatus === stage.status ? ' is-over' : ''}`}
              aria-labelledby={`stage-${stage.status}`}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setOverStatus(stage.status);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setOverStatus(null);
              }}
              onDrop={(event) => drop(event, stage.status)}
            >
              <header className="kanban-column-heading">
                <div className="stage-number">{String(index + 1).padStart(2, '0')}</div>
                <div>
                  <h2 id={`stage-${stage.status}`}>{stage.label}</h2>
                  <p>{stage.description}</p>
                </div>
                <span className="stage-count">{cards.length}</span>
              </header>
              <div className="kanban-cards">
                {cards.map((property) => (
                  <div
                    key={property.id}
                    draggable={busyId !== property.id}
                    onDragStart={(event) => {
                      setDraggedId(property.id);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/property-id', property.id);
                    }}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setOverStatus(null);
                    }}
                  >
                    <ProcessCard property={property} busyId={busyId} onMove={onMove} searchId={searchId} draggable />
                  </div>
                ))}
                {!cards.length ? <div className="kanban-empty">Suelta una propiedad aquí</div> : null}
              </div>
            </section>
          );
        })}
      </div>
      <div className="mobile-process-list">
        {lifecycle.map((stage) => {
          const cards = properties.filter((property) => property.decisionStatus === stage.status);
          return (
            <details
              className={`mobile-stage tone-${stage.tone}`}
              key={stage.status}
              open={cards.length > 0 || undefined}
            >
              <summary>
                <span className="stage-dot" />
                <span>
                  <strong>{stage.label}</strong>
                  <small>{stage.description}</small>
                </span>
                <b>{cards.length}</b>
              </summary>
              <div className="mobile-stage-cards">
                {cards.length ? (
                  cards.map((property) => (
                    <ProcessCard
                      key={property.id}
                      property={property}
                      busyId={busyId}
                      onMove={onMove}
                      searchId={searchId}
                    />
                  ))
                ) : (
                  <p>Sin propiedades en esta etapa.</p>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
