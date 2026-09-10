'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ImportJobDto } from '@house-tracker/shared';
import { requestApi } from '@/lib/request-api';

export function AdminCatalogImport() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [job, setJob] = useState<ImportJobDto | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!job || ['READY', 'FAILED'].includes(job.status)) return;
    const timer = setTimeout(async () => {
      try {
        const next = await requestApi<ImportJobDto>(`/api/admin/catalog/imports/${job.id}`);
        setJob(next);
        if (next.status === 'READY' && next.propertyId)
          router.push(`/admin/catalog/properties/${next.propertyId}/review`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'No fue posible consultar la importación.');
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [job, router]);
  return (
    <main className="add-page">
      <section className="add-card">
        <span className="eyebrow">Administración del catálogo</span>
        <h1>Importar para revisión</h1>
        <p>La propiedad permanecerá oculta hasta que revises sus datos y la publiques.</p>
        <form
          className="import-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError('');
            try {
              const started = await requestApi<{ importId: string; status: ImportJobDto['status'] }>(
                '/api/admin/catalog/imports',
                { method: 'POST', body: JSON.stringify({ url }) }
              );
              setJob({
                id: started.importId,
                kind: 'CATALOG',
                status: started.status,
                propertyId: null,
                errorMessage: null,
                retryCount: 0
              });
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'No fue posible iniciar la importación.');
            }
          }}
        >
          <label>
            <span>URL pública</span>
            <input
              type="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://portal.com/propiedad/..."
            />
          </label>
          {job ? <p role="status">Estado: {job.status.toLocaleLowerCase()}</p> : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="button primary"
            type="submit"
            disabled={Boolean(job && !['READY', 'FAILED'].includes(job.status))}
          >
            Importar borrador
          </button>
        </form>
      </section>
    </main>
  );
}
