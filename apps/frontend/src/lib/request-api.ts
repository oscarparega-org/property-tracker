import { apiUrl } from './api';
export async function requestApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options, credentials: 'include', cache: 'no-store',
    headers: { ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  if (response.status === 401) {
    window.location.assign('/sign-in');
    throw new Error('Tu sesión terminó. Inicia sesión de nuevo.');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No fue posible completar la operación.');
  return result as T;
}
