import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest): NextResponse {
  const hostname = (request.headers.get('host') ?? '').replace(/:\d+$/, '').toLowerCase();
  const shared = (process.env['CORESEARCH_SHARE'] ?? '').toLowerCase();
  if (hostname === '127.0.0.1' || hostname === 'localhost' || (shared !== '' && hostname === shared)) return NextResponse.next();
  return new NextResponse('Forbidden host.', { status: 403 });
}
