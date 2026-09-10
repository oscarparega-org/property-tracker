import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000').origin;
  const developmentScriptSource = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '';
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentScriptSource}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${apiOrigin} https://tile.openstreetmap.org`,
    "worker-src 'self' blob:"
  ].join('; ');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
};
