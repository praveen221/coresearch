import { listTargets } from '../../../lib/targets.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(): Response {
  try {
    return Response.json(listTargets(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Unable to read saved targets.' }, { status: 500 });
  }
}
