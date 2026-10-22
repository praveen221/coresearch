import { liveJson } from '../../../lib/live.ts';
import { workspacePath } from '../../../lib/database.ts';
import { listIdeas } from '../../../lib/research.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(request: Request): Response {
  try {
    return liveJson(request, listIdeas(workspacePath()));
  } catch {
    return Response.json({ error: 'Unable to read saved ideas.' }, { status: 500 });
  }
}
