'use client';
import { useState, type FormHTMLAttributes } from 'react';
import { useRouter } from 'next/navigation';
import type { PropertyDto } from '@house-tracker/shared';
import { invalidateProperties } from '@/lib/property-cache';

type Props = Omit<FormHTMLAttributes<HTMLFormElement>, 'action'> & {
  action: (form: FormData) => Promise<PropertyDto>;
  onSuccess?: (result: PropertyDto) => void;
  redirectOnPublication?: boolean;
};
export function ActionForm({ action, children, onSuccess, redirectOnPublication = true, ...props }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  return (
    <form
      {...props}
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending) return;
        const form = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        setPending(true);
        setError('');
        try {
          const result = await action(form);
          onSuccess?.(result);
          invalidateProperties();
          if (redirectOnPublication && form.has('publicationStatus')) {
            const base = result.searchId ? `/searches/${result.searchId}` : '';
            router.push(`${base}/properties/${result.id}${result.publicationStatus === 'DRAFT' ? '/review' : ''}`);
          }
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'No fue posible guardar.');
        } finally {
          setPending(false);
        }
      }}
    >
      <fieldset disabled={pending} className="contents-fieldset">
        {children}
      </fieldset>
      {pending && <p role="status">Guardando…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
