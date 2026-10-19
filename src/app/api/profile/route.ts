import { getProfile } from '../../../lib/profile.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(): Response {
  try {
    return Response.json(getProfile(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Unable to read the saved profile.' }, { status: 500 });
  }
}
