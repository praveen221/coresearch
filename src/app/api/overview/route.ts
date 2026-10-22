import { liveJson } from '../../../lib/live.ts';
import { workspacePath } from '../../../lib/database.ts';
import { getOverview } from '../../../lib/overview.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(request: Request): Response {
  try {
    return liveJson(request, getOverview(workspacePath()));
  } catch {
    return Response.json({ error: 'Unable to read the overview.' }, { status: 500 });
  }
}
