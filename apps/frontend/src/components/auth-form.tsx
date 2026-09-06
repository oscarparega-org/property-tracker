'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { MaterialIcon } from '@/components/material-icon';
import { mainContentId } from '@/components/skip-link';

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isSignUp = mode === 'sign-up';
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'House Tracker';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    const name = String(form.get('name') || '').trim();

    try {
      const result = isSignUp
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });

      if (result.error) {
        setError(result.error.message || 'No fue posible iniciar sesión.');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('No pudimos conectar con el servidor. Intenta de nuevo.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-page" id={mainContentId} tabIndex={-1}>
      <section className="auth-shell" aria-label={isSignUp ? 'Crear una cuenta' : 'Iniciar sesión'}>
        <aside className="auth-story">
          <Link href="/" className="auth-brand" aria-label={appName}>
            <span className="brand-mark" aria-hidden="true">
              <MaterialIcon name="home" />
            </span>
            <strong>{appName}</strong>
          </Link>
          <div className="auth-story-copy">
            <span className="auth-kicker">Tu radar inmobiliario</span>
            <p className="auth-story-title">Decide con calma. Guarda cada señal.</p>
            <p className="auth-story-description">
              Reúne propiedades, compara lo importante y lleva cada opción desde el primer hallazgo hasta la decisión
              final.
            </p>
          </div>
          <div className="auth-stages" aria-hidden="true">
            <span className="is-complete">Encontrada</span>
            <span className="is-current">Por visitar</span>
            <span>Decisión</span>
          </div>
        </aside>

        <form className="auth-form" onSubmit={submit}>
          <div className="auth-heading">
            <span className="eyebrow">Acceso privado</span>
            <h1>{isSignUp ? 'Crear una cuenta' : 'Qué gusto verte'}</h1>
            <p>
              {isSignUp
                ? 'Empieza una colección privada para organizar tu búsqueda.'
                : 'Continúa donde dejaste tu búsqueda de propiedades.'}
            </p>
          </div>
          <div className="auth-fields">
            {isSignUp ? <Field autoComplete="name" label="Nombre" name="name" type="text" /> : null}
            <Field autoComplete="email" label="Correo" name="email" type="email" />
            <Field
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              label="Contraseña"
              minLength={8}
              name="password"
              type="password"
            />
          </div>
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="auth-submit" disabled={pending} type="submit">
            <span>{pending ? 'Espera un momento…' : isSignUp ? 'Crear cuenta' : 'Iniciar sesión'}</span>
            {!pending ? <MaterialIcon name="arrowForward" /> : null}
          </button>
          <p className="auth-switch">
            {isSignUp ? '¿Ya tienes cuenta?' : '¿Primera vez aquí?'}{' '}
            <Link href={isSignUp ? '/sign-in' : '/sign-up'}>{isSignUp ? 'Iniciar sesión' : 'Crear cuenta'}</Link>
          </p>
        </form>
      </section>
    </main>
  );
}

type FieldProps = { label: string; name: string; type: string; autoComplete: string; minLength?: number };
function Field({ label, ...props }: FieldProps) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input required {...props} />
    </label>
  );
}
