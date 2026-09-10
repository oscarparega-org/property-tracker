export async function serverApi<T>(path: string): Promise<T> {
  const origin = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '');
  const response = await fetch(`${origin}${path}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Server API request failed with ${response.status}`);
  return (await response.json()) as T;
}
