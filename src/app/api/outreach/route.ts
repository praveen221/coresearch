import { liveJson } from '../../../lib/live.ts';
import { workspacePath } from '../../../lib/database.ts';
import { listFitKinds } from '../../../lib/fit.ts';
import { listOutreach } from '../../../lib/outreach.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(request: Request): Response {
  try {
    const workspace = workspacePath();
    return liveJson(request, { rows: listOutreach(workspace), kinds: listFitKinds(workspace) });
  } catch {
    return Response.json({ error: 'Unable to read outreach.' }, { status: 500 });
  }
}
