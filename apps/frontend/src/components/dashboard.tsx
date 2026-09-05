'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProtectedResponse } from '@template/shared';
import { authClient } from '@/lib/auth-client';
import { apiUrl } from '@/lib/api';

export function Dashboard() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [data, setData] = useState<ProtectedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && !session) router.replace('/sign-in');
  }, [isPending, router, session]);

  useEffect(() => {
    if (!session) return;
    void fetch(`${apiUrl}/api/protected`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        return response.json() as Promise<ProtectedResponse>;
      })
      .then(setData)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Request failed'));
  }, [session]);

  if (isPending || !session) return <p className="mt-16 text-slate-600">Loading session…</p>;
  return (
    <section className="mt-16 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-medium uppercase tracking-wide text-blue-700">Protected page</p>
      <h1 className="mt-3 text-3xl font-semibold">Hello, {session.user.name}</h1>
      <p className="mt-3 text-slate-600">Your browser has a valid Better Auth session.</p>
      {data ? <pre className="mt-6 overflow-auto rounded-xl bg-slate-950 p-4 text-sm text-slate-100">{JSON.stringify(data, null, 2)}</pre> : null}
      {error ? <p className="mt-5 text-red-700">Protected API check failed: {error}</p> : null}
    </section>
  );
}
