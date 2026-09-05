import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export async function GET() {
  const api = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '');
  try {
    const response = await fetch(`${api}/health`, { cache: 'no-store' });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 503 });
  }
}
