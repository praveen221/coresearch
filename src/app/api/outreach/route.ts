import { workspacePath } from '../../../lib/database.ts';
import { listOutreach } from '../../../lib/outreach.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(): Response {
  try {
    return Response.json({ rows: listOutreach(workspacePath()) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Unable to read outreach.' }, { status: 500 });
  }
}
