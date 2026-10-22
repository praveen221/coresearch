import { createHash } from 'node:crypto';

export function liveJson(request: Request, data: unknown): Response {
  const body = JSON.stringify(data);
  const tag = `"${createHash('sha1').update(body).digest('base64url')}"`;
  const headers = { 'Cache-Control': 'no-store', ETag: tag };
  if (request.headers.get('if-none-match') === tag) return new Response(null, { status: 304, headers });
  return new Response(body, { headers: { ...headers, 'Content-Type': 'application/json' } });
}
