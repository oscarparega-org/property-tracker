'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ImportJobDto, ImportStartDto, ImportRequest } from '@template/shared';
import { requestApi } from '@/lib/request-api';
import { MaterialIcon } from './material-icon';

export function UrlImportForm() {
  const router = useRouter();
  const [job, setJob] = useState<{ id: string; status: string; errorMessage?: string | null } | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(true);
  const active = Boolean(job && !['READY', 'FAILED'].includes(job.status));
  useEffect(() => {
    if (!job || !active || !polling) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await requestApi<ImportJobDto>(`/api/imports/${job.id}`);
        if (stopped) return;
        setJob(next);
        if (next.status === 'READY' && next.propertyId) router.push(`/properties/${next.propertyId}/review`);
        else if (next.status !== 'FAILED') timer = setTimeout(poll, 1500);
      } catch (cause) {
        if (!stopped) { setError(cause instanceof Error ? cause.message : 'No pudimos consultar el avance.'); setPolling(false); }
      }
    };
    timer = setTimeout(poll, 1500);
    return () => { stopped = true; clearTimeout(timer); };
  }, [job?.id, active, polling, router]);
  return <form className="import-form" onSubmit={async event => {
    event.preventDefault(); setSubmitting(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await requestApi<ImportStartDto>('/api/imports', { method: 'POST', body: JSON.stringify({ url: String(form.get('url') || '') } satisfies ImportRequest) });
      if ('existing' in result) router.push(`/properties/${result.propertyId}${result.publicationStatus === 'DRAFT' ? '/review' : ''}`);
      else { setJob({ id: result.importId, status: result.status }); setPolling(true); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible iniciar la importación.'); }
    finally { setSubmitting(false); }
  }}>
    <label><span>URL de la publicación</span><div className="url-input"><MaterialIcon name="link" /><input name="url" type="url" required placeholder="https://portal.com/propiedad/..." disabled={active || submitting} /></div></label>
    <p>Validaremos que la URL sea una publicación de propiedad. Si pasa la validación, crearemos un borrador para que lo revises.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {active && !polling && <button className="button" type="button" onClick={() => { setError(''); setPolling(true); }}>Volver a consultar</button>}
    {job && <div className={`import-progress status-${job.status.toLowerCase()}`} role="status"><MaterialIcon name={job.status === 'FAILED' ? 'error' : 'sync'} /><div><strong>{job.status === 'FAILED' ? 'No se pudo importar' : 'Importando propiedad'}</strong><span>{job.errorMessage || `Estado: ${job.status.toLowerCase()}`}</span></div></div>}
    <button className="button primary" type="submit" disabled={submitting || active}>{submitting ? 'Preparando…' : 'Importar y crear borrador'}</button>
  </form>;
}
