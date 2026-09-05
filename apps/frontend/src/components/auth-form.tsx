'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isSignUp = mode === 'sign-up';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    const name = String(form.get('name') || '').trim();

    const result = isSignUp
      ? await authClient.signUp.email({ name, email, password })
      : await authClient.signIn.email({ email, password });

    if (result.error) {
      setError(result.error.message || 'Authentication failed');
      setPending(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <form className="mx-auto mt-16 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm" onSubmit={submit}>
      <h1 className="text-3xl font-semibold tracking-tight">{isSignUp ? 'Create an account' : 'Welcome back'}</h1>
      <p className="mt-2 text-sm text-slate-600">{isSignUp ? 'Use a name, email, and password.' : 'Sign in with your email and password.'}</p>
      {isSignUp ? <Field autoComplete="name" label="Name" name="name" type="text" /> : null}
      <Field autoComplete="email" label="Email" name="email" type="email" />
      <Field autoComplete={isSignUp ? 'new-password' : 'current-password'} label="Password" minLength={8} name="password" type="password" />
      {error ? <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
      <button className="mt-6 w-full rounded-lg bg-slate-950 px-4 py-3 font-semibold text-white hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60" disabled={pending} type="submit">
        {pending ? 'Please wait…' : isSignUp ? 'Sign up' : 'Sign in'}
      </button>
      <p className="mt-5 text-center text-sm text-slate-600">
        {isSignUp ? 'Already registered?' : 'Need an account?'}{' '}
        <Link className="font-semibold text-slate-950 underline" href={isSignUp ? '/sign-in' : '/sign-up'}>{isSignUp ? 'Sign in' : 'Sign up'}</Link>
      </p>
    </form>
  );
}

type FieldProps = { label: string; name: string; type: string; autoComplete: string; minLength?: number };
function Field({ label, ...props }: FieldProps) {
  return (
    <label className="mt-5 block text-sm font-medium text-slate-700">
      {label}
      <input className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" required {...props} />
    </label>
  );
}
