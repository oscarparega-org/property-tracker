import Link from 'next/link';
import { MaterialIcon } from '@/components/material-icon';

export function BodyNavigation({
  current,
  backLabel = 'Volver a propiedades',
  backHref = '/',
  rootLabel = 'Mis búsquedas',
  rootHref = '/searches'
}: {
  current: string;
  backLabel?: string;
  backHref?: string;
  rootLabel?: string;
  rootHref?: string;
}) {
  return (
    <div className="body-navigation">
      <nav aria-label="Migas de pan">
        <Link href={rootHref}>{rootLabel}</Link>
        <MaterialIcon name="chevronRight" />
        <span aria-current="page">{current}</span>
      </nav>
      <Link href={backHref} className="body-back">
        <MaterialIcon name="arrowBack" /> {backLabel}
      </Link>
    </div>
  );
}
