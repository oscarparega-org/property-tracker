'use client';
import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import Link from 'next/link';

export function PrivateApp({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const publicPage = path === '/sign-in' || path === '/sign-up';
  useEffect(() => {
    if (!publicPage && !isPending && !session) router.replace('/sign-in');
  }, [publicPage, isPending, session, router]);
  if (publicPage) return children;
  if (isPending || !session) return <p className="empty-state">Cargando sesión…</p>;
  return <><div className="account-bar"><span>{session.user.email}</span><Link href="/settings/integrations">Configuración</Link><button className="text-button" onClick={async () => { await authClient.signOut(); router.replace('/sign-in'); }}>Cerrar sesión</button></div><div key={session.user.id}>{children}</div></>;
}
