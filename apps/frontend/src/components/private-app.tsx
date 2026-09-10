'use client';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import Link from 'next/link';
import { MaterialIcon } from '@/components/material-icon';
import { mainContentId } from '@/components/skip-link';
import { MobileNavigation } from '@/components/mobile-navigation';

export function PrivateApp({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const signingOut = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const { data: session, isPending } = authClient.useSession();
  const visibleSession = hydrated ? session : null;
  const authPage = path === '/sign-in' || path === '/sign-up';
  const publicPage = path === '/' || path === '/catalog' || path.startsWith('/catalog/');
  useEffect(() => {
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated && !authPage && !publicPage && !isPending && !session && !signingOut.current)
      router.replace('/sign-in');
  }, [authPage, hydrated, publicPage, isPending, session, router]);
  useEffect(() => {
    accountMenu.current?.removeAttribute('open');
  }, [path]);
  if (authPage) return children;
  if (!publicPage && (!hydrated || isPending || !session)) return <p className="empty-state">Cargando sesión…</p>;
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'House Tracker';
  const displayName = visibleSession ? visibleSession.user.name || visibleSession.user.email : '';
  const initial = displayName.trim().charAt(0).toLocaleUpperCase('es-MX');

  return (
    <div className="authenticated-shell">
      <header className="app-header">
        <Link href="/" className="app-brand" aria-label={`${appName}, propiedades`}>
          <span className="brand-mark">
            <MaterialIcon name="home" />
          </span>
          <strong>{appName}</strong>
        </Link>
        <nav className="app-primary-nav" aria-label="Navegación principal">
          <Link href="/" aria-current={path === '/' || path.startsWith('/catalog') ? 'page' : undefined}>
            Explorar
          </Link>
          {visibleSession ? (
            <Link href="/searches" aria-current={path.startsWith('/searches') ? 'page' : undefined}>
              Mis búsquedas
            </Link>
          ) : null}
        </nav>
        {visibleSession ? (
          <details className="account-menu" ref={accountMenu}>
            <summary aria-label={`Abrir menú de ${displayName}`}>
              <span className="account-avatar" aria-hidden="true">
                {initial}
              </span>
              <span className="account-identity">
                <strong>{displayName}</strong>
                <small>{visibleSession.user.email}</small>
              </span>
              <MaterialIcon name="expandMore" />
            </summary>
            <div className="account-popover">
              <div className="account-popover-heading">
                <strong>{displayName}</strong>
                <span>{visibleSession.user.email}</span>
              </div>
              <Link href="/settings/integrations">
                <MaterialIcon name="settings" /> Configuración e integraciones
              </Link>
              <button
                type="button"
                onClick={async () => {
                  signingOut.current = true;
                  await authClient.signOut();
                  window.location.replace('/');
                }}
              >
                <MaterialIcon name="logout" /> Cerrar sesión
              </button>
            </div>
          </details>
        ) : (
          <div className="guest-actions">
            <Link href="/sign-in">Iniciar sesión</Link>
            <Link className="guest-sign-up" href="/sign-up">
              Crear cuenta
            </Link>
          </div>
        )}
      </header>
      <div className="authenticated-content" id={mainContentId} key={visibleSession?.user.id ?? 'guest'} tabIndex={-1}>
        {children}
      </div>
      <Suspense fallback={null}>
        <MobileNavigation authenticated={Boolean(visibleSession)} />
      </Suspense>
    </div>
  );
}
