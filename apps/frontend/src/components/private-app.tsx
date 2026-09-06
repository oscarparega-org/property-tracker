'use client';
import { Suspense, useEffect, useRef, type ReactNode } from 'react';
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
  const { data: session, isPending } = authClient.useSession();
  const publicPage = path === '/sign-in' || path === '/sign-up';
  useEffect(() => {
    if (!publicPage && !isPending && !session) router.replace('/sign-in');
  }, [publicPage, isPending, session, router]);
  useEffect(() => {
    accountMenu.current?.removeAttribute('open');
  }, [path]);
  if (publicPage) return children;
  if (isPending || !session) return <p className="empty-state">Cargando sesión…</p>;
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'House Tracker';
  const displayName = session.user.name || session.user.email;
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
        <details className="account-menu" ref={accountMenu}>
          <summary aria-label={`Abrir menú de ${displayName}`}>
            <span className="account-avatar" aria-hidden="true">
              {initial}
            </span>
            <span className="account-identity">
              <strong>{displayName}</strong>
              <small>{session.user.email}</small>
            </span>
            <MaterialIcon name="expandMore" />
          </summary>
          <div className="account-popover">
            <div className="account-popover-heading">
              <strong>{displayName}</strong>
              <span>{session.user.email}</span>
            </div>
            <Link href="/settings/integrations">
              <MaterialIcon name="settings" /> Configuración e integraciones
            </Link>
            <button
              type="button"
              onClick={async () => {
                await authClient.signOut();
                router.replace('/sign-in');
              }}
            >
              <MaterialIcon name="logout" /> Cerrar sesión
            </button>
          </div>
        </details>
      </header>
      <div className="authenticated-content" id={mainContentId} key={session.user.id} tabIndex={-1}>
        {children}
      </div>
      <Suspense fallback={null}>
        <MobileNavigation />
      </Suspense>
    </div>
  );
}
