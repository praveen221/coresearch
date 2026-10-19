import { workspacePath } from '../../../lib/database.ts';
import { listIdeas } from '../../../lib/research.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(): Response {
  try {
    return Response.json(listIdeas(workspacePath()), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Unable to read saved ideas.' }, { status: 500 });
  }
}
