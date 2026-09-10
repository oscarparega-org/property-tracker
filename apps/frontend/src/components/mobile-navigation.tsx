'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { MaterialIcon, type MaterialIconName } from '@/components/material-icon';

export function MobileNavigation({ authenticated }: { authenticated: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchId = pathname.match(/^\/searches\/([^/]+)/)?.[1];
  if (!searchId)
    return (
      <nav className="mobile-navigation mobile-navigation-global" aria-label="Navegación principal">
        <Link href="/" aria-current={pathname === '/' || pathname.startsWith('/catalog') ? 'page' : undefined}>
          <MaterialIcon name="search" />
          <span>Explorar</span>
        </Link>
        <Link
          href={authenticated ? '/searches' : '/sign-in'}
          aria-current={pathname === '/searches' ? 'page' : undefined}
        >
          <MaterialIcon name={authenticated ? 'list' : 'account'} />
          <span>{authenticated ? 'Mis búsquedas' : 'Ingresar'}</span>
        </Link>
      </nav>
    );
  const base = `/searches/${searchId}`;
  const destinations: Array<{ href: string; label: string; icon: MaterialIconName; match: string }> = [
    { href: base, label: 'Propiedades', icon: 'list', match: 'properties' },
    { href: `${base}?view=process`, label: 'Proceso', icon: 'process', match: 'process' },
    { href: `${base}/properties/new`, label: 'Agregar', icon: 'add', match: 'add' },
    { href: `${base}/drafts`, label: 'Borradores', icon: 'draft', match: 'drafts' }
  ];

  const current =
    pathname === `${base}/drafts`
      ? 'drafts'
      : pathname.startsWith(`${base}/properties/new`)
        ? 'add'
        : pathname === base && searchParams.get('view') === 'process'
          ? 'process'
          : pathname === base
            ? 'properties'
            : '';

  return (
    <nav className="mobile-navigation" aria-label="Navegación principal">
      {destinations.map((item) => (
        <Link key={item.match} href={item.href} aria-current={current === item.match ? 'page' : undefined}>
          <MaterialIcon name={item.icon} />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
