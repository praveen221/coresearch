import { workspacePath } from '../../../../../lib/database.ts';
import { NotFoundError } from '../../../../../lib/errors.ts';
import { getResearch } from '../../../../../lib/research.ts';
import { getTarget, targetIdSchema } from '../../../../../lib/targets.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: RouteContext<'/api/targets/[id]/research'>): Promise<Response> {
  const id = targetIdSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: 'Invalid target.' }, { status: 404 });
  try {
    getTarget(id.data);
    return Response.json(getResearch(workspacePath(), id.data), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: 'Unable to read research.' }, { status: error instanceof NotFoundError ? 404 : 500 });
  }
}
