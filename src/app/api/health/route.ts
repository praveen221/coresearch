export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ app: 'coresearch', instance: process.env['CORESEARCH_INSTANCE'] ?? 'development', pid: process.pid },
    { headers: { 'Cache-Control': 'no-store' } });
}
