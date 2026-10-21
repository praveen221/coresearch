import { workspacePath } from '../../../../../lib/database.ts';
import { NotFoundError } from '../../../../../lib/errors.ts';
import { targetOutreach } from '../../../../../lib/outreach.ts';
import { targetIdSchema } from '../../../../../lib/targets.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: RouteContext<'/api/targets/[id]/outreach'>): Promise<Response> {
  const id = targetIdSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: 'Invalid target.' }, { status: 404 });
  try {
    const workspace = workspacePath();
    return Response.json(targetOutreach(workspace, id.data), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: 'Unable to read outreach.' }, { status: error instanceof NotFoundError ? 404 : 500 });
  }
}
