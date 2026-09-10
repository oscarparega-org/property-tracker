'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PropertyDto } from '@house-tracker/shared';
import { requestApi } from '@/lib/request-api';
import { PropertyEditor } from './property-editor';

export function AdminCatalogReview({ id }: { id: string }) {
  const router = useRouter();
  const [property, setProperty] = useState<PropertyDto | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void requestApi<PropertyDto>(`/api/admin/catalog/properties/${id}`)
      .then(setProperty)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'No fue posible cargar el borrador.'));
  }, [id]);
  if (error) return <p className="empty-state">{error}</p>;
  if (!property) return <p className="empty-state">Cargando borrador…</p>;
  return <PropertyEditor property={property} catalogAdmin onClose={() => router.push('/catalog')} />;
}
