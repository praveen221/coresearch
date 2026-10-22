import { liveJson } from '../../../lib/live.ts';
import { listTargets } from '../../../lib/targets.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(request: Request): Response {
  try {
    return liveJson(request, listTargets());
  } catch {
    return Response.json({ error: 'Unable to read saved targets.' }, { status: 500 });
  }
}
