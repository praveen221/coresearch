import { liveJson } from '../../../lib/live.ts';
import { getProfile } from '../../../lib/profile.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(request: Request): Response {
  try {
    return liveJson(request, getProfile());
  } catch {
    return Response.json({ error: 'Unable to read the saved profile.' }, { status: 500 });
  }
}
