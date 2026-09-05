'use client';

import { useEffect, useState } from 'react';
import type { EnhancementCapabilityDto, EnhancementPreviewDto, ImportJobDto, ImportStatus } from '@template/shared';
import { requestApi } from '@/lib/request-api';
import { MaterialIcon } from './material-icon';

export function PropertyEnhancement({ propertyId }: { propertyId: string }) {
  const [capability, setCapability] = useState<EnhancementCapabilityDto | null>(null);
  const [job, setJob] = useState<{ id: string; status: ImportStatus } | null>(null);
  const [preview, setPreview] = useState<EnhancementPreviewDto | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    void requestApi<EnhancementCapabilityDto>(`/api/properties/${propertyId}/enhancement-capability`).then(setCapability).catch(() => setCapability({ available: false, reason: null }));
  }, [propertyId]);

  useEffect(() => {
    if (!job || ['READY', 'FAILED'].includes(job.status)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const current = await requestApi<ImportJobDto>(`/api/imports/${job.id}`);
        if (stopped) return;
        setJob({ id: current.id, status: current.status });
        if (current.status === 'READY') setPreview(await requestApi<EnhancementPreviewDto>(`/api/enhancements/${current.id}`));
        else if (current.status === 'FAILED') setError(current.errorMessage ?? 'No fue posible mejorar la propiedad.');
        else timer = setTimeout(poll, 1500);
      } catch (cause) { if (!stopped) setError(cause instanceof Error ? cause.message : 'No fue posible consultar la mejora.'); }
    };
    timer = setTimeout(poll, 800);
    return () => { stopped = true; clearTimeout(timer); };
  }, [job?.id, job?.status]);

  if (!capability?.available) return null;
  const active = Boolean(job && !['READY', 'FAILED'].includes(job.status));
  return <div className="enhancement-tool">
    <button className="button enhancement-button" type="button" disabled={pending || active} onClick={async () => {
      setPending(true); setError(''); setMessage(''); setPreview(null);
      try {
        const result = await requestApi<{ importId: string; status: ImportStatus }>(`/api/properties/${propertyId}/enhancements`, { method: 'POST' });
        setJob({ id: result.importId, status: result.status });
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible iniciar la mejora.'); }
      finally { setPending(false); }
    }}><MaterialIcon name="autoAwesome" /> {pending || active ? 'Mejorando…' : 'Mejorar con Firecrawl + IA'}</button>
    {active && <p className="form-note" role="status">Firecrawl está leyendo la publicación y la IA está preparando una comparación.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="form-note" role="status">{message}</p>}
    {preview && <section className="enhancement-preview">
      <div><span className="eyebrow">Vista previa</span><h3>Información nueva encontrada</h3><p>Solo se completarán campos vacíos. Tus correcciones y decisiones actuales se conservarán.</p></div>
      {preview.changes.length > 0 && <div className="enhancement-changes">{preview.changes.map(change => <div key={change.field}><span>{change.label}</span><strong>{change.proposed}</strong></div>)}</div>}
      <p><strong>{preview.addedImages.length}</strong> imágenes nuevas · <strong>{preview.addedFeatures.length}</strong> características nuevas</p>
      {!preview.changes.length && !preview.addedImages.length && !preview.addedFeatures.length && <p>No se encontró información adicional para aplicar.</p>}
      <div className="enhancement-actions">
        <button className="button primary" type="button" disabled={pending || (!preview.changes.length && !preview.addedImages.length && !preview.addedFeatures.length)} onClick={async () => {
          setPending(true); setError('');
          try {
            await requestApi(`/api/enhancements/${preview.importId}/apply`, { method: 'POST' });
            setPreview(null); setMessage('La información nueva fue aplicada.');
            window.setTimeout(() => window.dispatchEvent(new Event('properties-changed')), 800);
          } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible aplicar la mejora.'); }
          finally { setPending(false); }
        }}>Aplicar información nueva</button>
        <button className="button subtle" type="button" disabled={pending} onClick={() => setPreview(null)}>Descartar</button>
      </div>
    </section>}
  </div>;
}
