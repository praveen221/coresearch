import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Blocks DNS rebinding: another site's hostname resolving to this unauthenticated loopback server.
// Next's Server Action Origin/Host comparison does not catch it because both carry the attacker's name.
export function proxy(request: NextRequest): NextResponse {
  const hostname = (request.headers.get('host') ?? '').replace(/:\d+$/, '');
  if (hostname === '127.0.0.1' || hostname === 'localhost') return NextResponse.next();
  return new NextResponse('Forbidden host.', { status: 403 });
}
