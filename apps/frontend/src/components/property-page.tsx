'use client';
import { useEffect } from 'react';
import type { PropertyDto } from '@house-tracker/shared';
import { PropertyWorkspace } from './property-workspace';
import { PropertyDetail } from './property-detail';
import { ReviewPropertyEditor } from './review-property-editor';
import { DraftList } from './draft-list';
import { subscribeToPropertyInvalidation } from '@/lib/property-cache';
import { useApiResource } from '@/lib/use-api-resource';

export function PropertyPage({
  id,
  searchId,
  mode = 'list',
  initialView = 'list'
}: {
  id?: string;
  searchId: string;
  mode?: 'list' | 'detail' | 'review' | 'drafts';
  initialView?: 'board' | 'list';
}) {
  const base = `/api/searches/${encodeURIComponent(searchId)}/properties`;
  const path = id
    ? `${base}/${encodeURIComponent(id)}`
    : `${base}?publicationStatus=${mode === 'drafts' ? 'DRAFT' : 'PUBLISHED'}`;
  const { data: resource, error, refresh } = useApiResource<PropertyDto | PropertyDto[]>(path);
  const data = resource === null ? null : Array.isArray(resource) ? resource : [resource];
  useEffect(() => subscribeToPropertyInvalidation(refresh), [refresh]);
  if (error)
    return (
      <div className="empty-state">
        <p role="alert">{error}</p>
        <button className="button" onClick={refresh}>
          Reintentar
        </button>
      </div>
    );
  if (!data)
    return (
      <p className="empty-state" role="status">
        Cargando propiedades…
      </p>
    );
  if (mode === 'drafts') return <DraftList drafts={data} searchId={searchId} />;
  if (mode === 'detail' || mode === 'review') {
    const property = data[0];
    if (!property) return <p className="empty-state">Propiedad no encontrada.</p>;
    return mode === 'review' && property.publicationStatus === 'DRAFT' ? (
      <ReviewPropertyEditor key={property.updatedAt} property={property} searchId={searchId} />
    ) : (
      <PropertyDetail key={property.updatedAt} property={property} />
    );
  }
  return <PropertyWorkspace initialProperties={data} searchId={searchId} initialView={initialView} />;
}
