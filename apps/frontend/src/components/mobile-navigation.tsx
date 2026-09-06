'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { MaterialIcon, type MaterialIconName } from '@/components/material-icon';

const destinations: Array<{ href: string; label: string; icon: MaterialIconName; match: string }> = [
  { href: '/', label: 'Propiedades', icon: 'list', match: 'properties' },
  { href: '/?view=process', label: 'Proceso', icon: 'process', match: 'process' },
  { href: '/properties/new', label: 'Agregar', icon: 'add', match: 'add' },
  { href: '/drafts', label: 'Borradores', icon: 'draft', match: 'drafts' }
];

export function MobileNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current =
    pathname === '/drafts'
      ? 'drafts'
      : pathname.startsWith('/properties/new')
        ? 'add'
        : pathname === '/' && searchParams.get('view') === 'process'
          ? 'process'
          : pathname === '/'
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
