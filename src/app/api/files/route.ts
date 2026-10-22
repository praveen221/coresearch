import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { workspacePath } from '../../../lib/database.ts';
import { resolveServedFile } from '../../../lib/files.ts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const types: Record<string, string> = { '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8' };
const exportTypes: Record<string, string> = {
  ...types, '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.sqlite': 'application/vnd.sqlite3',
};

export function GET(request: Request): Response {
  const path = new URL(request.url).searchParams.get('path') ?? '';
  const file = resolveServedFile(workspacePath(), path);
  const type = file === null ? undefined : (file.folder === 'exports' ? exportTypes : types)[extname(file.path)];
  if (file === null || type === undefined) return new Response('Not found.', { status: 404 });
  return new Response(readFileSync(file.path), {
    headers: {
      'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox', 'Content-Disposition': extname(file.path) === '.sqlite' || extname(file.path) === '.json'
        ? `attachment; filename="${basename(file.path)}"` : 'inline',
    },
  });
}
