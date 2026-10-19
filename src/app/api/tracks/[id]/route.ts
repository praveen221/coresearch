import { workspacePath } from '../../../../lib/database.ts';
import { NotFoundError } from '../../../../lib/errors.ts';
import { getTrackDetail } from '../../../../lib/research.ts';
import { targetIdSchema } from '../../../../lib/targets.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: RouteContext<'/api/tracks/[id]'>): Promise<Response> {
  const id = targetIdSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: 'Invalid track.' }, { status: 404 });
  try {
    return Response.json(getTrackDetail(workspacePath(), id.data), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: 'Unable to read the track.' }, { status: error instanceof NotFoundError ? 404 : 500 });
  }
}
