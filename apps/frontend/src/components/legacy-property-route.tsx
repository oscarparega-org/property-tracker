'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PropertyDto } from '@house-tracker/shared';
import { requestApi } from '@/lib/request-api';

export function LegacyPropertyRoute({ id, review = false }: { id: string; review?: boolean }) {
  const router = useRouter();
  const [property, setProperty] = useState<PropertyDto | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setError('');
    void requestApi<PropertyDto>(`/api/properties/${id}`)
      .then((value) => {
        const onlyMembership = value.memberships[0];
        if (value.memberships.length === 1 && onlyMembership)
          router.replace(`/searches/${onlyMembership.searchId}/properties/${id}${review ? '/review' : ''}`);
        else setProperty(value);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'No fue posible cargar la propiedad.'));
  }, [id, review, revision, router]);
  if (error)
    return (
      <div className="empty-state">
        <p className="form-error" role="alert">
          {error}
        </p>
        <button className="button" type="button" onClick={() => setRevision((value) => value + 1)}>
          Reintentar
        </button>
      </div>
    );
  if (!property)
    return (
      <p className="empty-state" role="status">
        Buscando la propiedad…
      </p>
    );
  return (
    <main className="legacy-search-choice">
      <h1>¿Desde qué búsqueda quieres verla?</h1>
      {property.memberships.map((item) => (
        <Link
          className="button"
          key={item.searchId}
          href={`/searches/${item.searchId}/properties/${id}${review ? '/review' : ''}`}
        >
          {item.name}
        </Link>
      ))}
    </main>
  );
}
