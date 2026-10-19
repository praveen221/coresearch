import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { workspacePath } from '../../../lib/database.ts';
import { resolveServedFile } from '../../../lib/files.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const types: Record<string, string> = { '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8' };

export function GET(request: Request): Response {
  const path = new URL(request.url).searchParams.get('path') ?? '';
  const file = resolveServedFile(workspacePath(), path);
  const type = file === null ? undefined : types[extname(file)];
  if (file === null || type === undefined) return new Response('Not found.', { status: 404 });
  return new Response(readFileSync(file), {
    headers: {
      'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox', 'Content-Disposition': 'inline',
    },
  });
}
