'use client';

import { useEffect, useState } from 'react';
import type { IntegrationProvider, ProviderSettingsDto } from '@house-tracker/shared';
import { requestApi } from '@/lib/request-api';

const labels: Record<IntegrationProvider, { name: string; description: string; credential: string }> = {
  OPENAI: {
    name: 'OpenAI',
    description: 'Normaliza los datos extraídos y completa campos estructurados cuando la publicación es incompleta.',
    credential: 'API key de OpenAI'
  },
  FIRECRAWL: {
    name: 'Firecrawl',
    description:
      'Renderiza la publicación durante una mejora profunda. Se usa únicamente junto con OpenAI cuando tú la solicitas.',
    credential: 'API key de Firecrawl'
  }
};

function ProviderCard({
  initial,
  onChange
}: {
  initial: ProviderSettingsDto;
  onChange: (value: ProviderSettingsDto) => void;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [model, setModel] = useState(initial.model ?? '');
  const [credential, setCredential] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const copy = labels[initial.provider];

  useEffect(() => {
    setEnabled(initial.enabled);
    setModel(initial.model ?? '');
  }, [initial]);

  async function run(action: () => Promise<ProviderSettingsDto>, success: string) {
    setPending(true);
    setMessage(null);
    try {
      const result = await action();
      onChange(result);
      setCredential('');
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible guardar la configuración.');
    } finally {
      setPending(false);
    }
  }

  const statusLabel =
    initial.status === 'READY'
      ? 'Activa'
      : initial.status === 'NEEDS_ATTENTION'
        ? 'Requiere atención'
        : initial.status === 'DISABLED'
          ? 'Desactivada'
          : 'Sin configurar';
  return (
    <article className="integration-card">
      <div className="integration-heading">
        <div>
          <span className="eyebrow">Integración</span>
          <h2>{copy.name}</h2>
          <p>{copy.description}</p>
        </div>
        <span className={`integration-status status-${initial.status.toLowerCase()}`}>{statusLabel}</span>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            () =>
              requestApi(`/api/settings/providers/${initial.provider.toLowerCase()}`, {
                method: 'PUT',
                body: JSON.stringify({
                  enabled,
                  ...(credential ? { credential } : {}),
                  model: initial.provider === 'OPENAI' ? model : null
                })
              }),
            'Configuración guardada y validada.'
          );
        }}
      >
        <label className="integration-secret">
          <span>{copy.credential}</span>
          <input
            type="password"
            value={credential}
            onChange={(event) => setCredential(event.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            placeholder={initial.credentialHint ?? 'Pega una credencial nueva'}
          />
        </label>
        {initial.credentialConfigured && (
          <small>Credencial almacenada: {initial.credentialHint}. Déjalo vacío para conservarla.</small>
        )}
        {initial.provider === 'OPENAI' && (
          <label>
            <span>Modelo</span>
            <select value={model} onChange={(event) => setModel(event.target.value)}>
              {initial.allowedModels.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="integration-toggle">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          <span>Usar {copy.name} en mis importaciones</span>
        </label>
        {message && (
          <p
            className={message.includes('guardada') || message.includes('válida') ? 'form-note' : 'form-error'}
            role="status"
          >
            {message}
          </p>
        )}
        <div className="integration-actions">
          <button className="button primary" type="submit" disabled={pending}>
            {pending ? 'Validando…' : 'Guardar y validar'}
          </button>
          {initial.credentialConfigured && (
            <button
              className="button subtle"
              type="button"
              disabled={pending}
              onClick={() =>
                void run(
                  () =>
                    requestApi(`/api/settings/providers/${initial.provider.toLowerCase()}/test`, { method: 'POST' }),
                  'La conexión es válida.'
                )
              }
            >
              Probar conexión
            </button>
          )}
          {initial.credentialConfigured && (
            <button
              className="text-button"
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`¿Eliminar la credencial de ${copy.name}?`))
                  void run(
                    () =>
                      requestApi(`/api/settings/providers/${initial.provider.toLowerCase()}/credential`, {
                        method: 'DELETE'
                      }),
                    'Credencial eliminada.'
                  );
              }}
            >
              Eliminar credencial
            </button>
          )}
        </div>
      </form>
    </article>
  );
}

export function ProviderSettingsPanel() {
  const [settings, setSettings] = useState<ProviderSettingsDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void requestApi<ProviderSettingsDto[]>('/api/settings/providers')
      .then(setSettings)
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : 'No fue posible cargar las integraciones.')
      );
  }, []);
  function replace(value: ProviderSettingsDto) {
    setSettings((current) => current?.map((item) => (item.provider === value.provider ? value : item)) ?? [value]);
  }
  return (
    <section className="settings-content">
      <span className="eyebrow">Configuración</span>
      <h1>Integraciones personales</h1>
      <p className="settings-intro">
        Tus credenciales se guardan cifradas y se usan únicamente en tus importaciones. La extracción directa sigue
        disponible sin configurar proveedores.
      </p>
      {error && <p className="form-error">{error}</p>}
      {!settings && !error && <p className="form-note">Cargando integraciones…</p>}
      <div className="integration-grid">
        {settings?.map((item) => (
          <ProviderCard key={item.provider} initial={item} onChange={replace} />
        ))}
      </div>
    </section>
  );
}
