'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function Header() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Project Template';

  async function signOut() {
    await authClient.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white/85 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6" aria-label="Main navigation">
        <Link className="font-semibold tracking-tight text-slate-950" href="/">{appName}</Link>
        <div className="flex items-center gap-3 text-sm">
          {isPending ? <span className="text-slate-500">Loading session…</span> : null}
          {!isPending && !session ? (
            <>
              <Link className="font-medium text-slate-700 hover:text-slate-950" href="/sign-in">Sign in</Link>
              <Link className="rounded-lg bg-slate-950 px-3 py-2 font-semibold text-white hover:bg-slate-700" href="/sign-up">Sign up</Link>
            </>
          ) : null}
          {!isPending && session ? (
            <>
              <span className="hidden text-slate-600 sm:inline">{session.user.email}</span>
              <Link className="font-medium text-slate-700 hover:text-slate-950" href="/dashboard">Dashboard</Link>
              <button className="rounded-lg border border-slate-300 px-3 py-2 font-semibold hover:bg-slate-100" onClick={signOut} type="button">Sign out</button>
            </>
          ) : null}
        </div>
      </nav>
    </header>
  );
}
