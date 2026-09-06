'use client';
import { useEffect, useState } from 'react';
import type { PropertyDto } from '@house-tracker/shared';
import { requestApi } from '@/lib/request-api';
import { PropertyWorkspace } from './property-workspace';
import { PropertyDetail } from './property-detail';
import { ReviewPropertyEditor } from './review-property-editor';
import { DraftList } from './draft-list';

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
  const [data, setData] = useState<PropertyDto[] | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const base = `/api/searches/${encodeURIComponent(searchId)}/properties`;
  const path = id
    ? `${base}/${encodeURIComponent(id)}`
    : `${base}?publicationStatus=${mode === 'drafts' ? 'DRAFT' : 'PUBLISHED'}`;
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener('properties-changed', refresh);
    return () => window.removeEventListener('properties-changed', refresh);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void requestApi<PropertyDto | PropertyDto[]>(path, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(Array.isArray(value) ? value : [value]);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No fue posible cargar.');
      });
    return () => controller.abort();
  }, [path, revision]);
  if (error)
    return (
      <div className="empty-state">
        <p role="alert">{error}</p>
        <button className="button" onClick={() => setRevision((value) => value + 1)}>
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
