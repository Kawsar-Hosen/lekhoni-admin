import { neon } from '@neondatabase/serverless';

export interface Env { DATABASE_URL: string; MEDIA: R2Bucket; ALLOWED_ORIGIN: string; MEDIA_PUBLIC_URL: string }
const json = (data: unknown, status = 200, origin = '*') => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' } });

export default { async fetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return json({}, 204, env.ALLOWED_ORIGIN);
  if (url.pathname === '/api/health') return json({ ok: true, service: 'lekhoni-admin-api', database: Boolean(env.DATABASE_URL) }, 200, env.ALLOWED_ORIGIN);
  try {
    if (url.pathname === '/api/media' && request.method === 'POST') {
      const form = await request.formData(); const file = form.get('file');
      if (!(file instanceof File)) return json({ error: 'Image is required' }, 400, env.ALLOWED_ORIGIN);
      if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) return json({ error: 'Only images up to 10MB are allowed' }, 400, env.ALLOWED_ORIGIN);
      const ext = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'webp'; const key = `books/${crypto.randomUUID()}.${ext}`;
      await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      return json({ key, url: `${env.MEDIA_PUBLIC_URL}/${key}` }, 201, env.ALLOWED_ORIGIN);
    }
    if (!env.DATABASE_URL) return json({ error: 'Neon DATABASE_URL is not configured' }, 503, env.ALLOWED_ORIGIN);
    const sql = neon(env.DATABASE_URL);
    if (url.pathname === '/api/books' && request.method === 'GET') return json(await sql`SELECT id,title,author,cover_url,status,views,likes,dislikes,updated_at FROM books ORDER BY updated_at DESC`, 200, env.ALLOWED_ORIGIN);
    if (url.pathname === '/api/comments' && request.method === 'GET') return json(await sql`SELECT * FROM comments WHERE status <> 'deleted' ORDER BY created_at DESC LIMIT 100`, 200, env.ALLOWED_ORIGIN);
    if (url.pathname === '/api/writers' && request.method === 'GET') return json(await sql`SELECT * FROM writer_submissions WHERE status = 'pending' ORDER BY created_at DESC`, 200, env.ALLOWED_ORIGIN);
    if (url.pathname === '/api/analytics' && request.method === 'GET') return json(await sql`SELECT COUNT(*)::int AS total_views, COUNT(DISTINCT device_id)::int AS unique_readers FROM view_events`, 200, env.ALLOWED_ORIGIN);
    return json({ error: 'Not found' }, 404, env.ALLOWED_ORIGIN);
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Request failed' }, 500, env.ALLOWED_ORIGIN); }
} };
