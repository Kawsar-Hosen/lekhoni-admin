import { neon } from '@neondatabase/serverless';

export interface Env { DATABASE_URL: string; MEDIA: R2Bucket; ALLOWED_ORIGIN: string; MEDIA_PUBLIC_URL: string }
const corsHeaders = (origin: string) => ({ 'content-type': 'application/json', 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' });
const json = (data: unknown, status = 200, origin = '*') => new Response(JSON.stringify(data), { status, headers: corsHeaders(origin) });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return json({}, 204, env.ALLOWED_ORIGIN);

    if (url.pathname === '/api/health') return json({ ok: true, service: 'lekhoni-admin-api', database: Boolean(env.DATABASE_URL) }, 200, env.ALLOWED_ORIGIN);

    try {
      if (url.pathname === '/api/media' && request.method === 'POST') {
        const form = await request.formData(); const file = form.get('file');
        if (!(file instanceof File)) return json({ error: 'Image is required' }, 400, env.ALLOWED_ORIGIN);
        if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) return json({ error: 'Only images up to 10MB are allowed' }, 400, env.ALLOWED_ORIGIN);
        const ext = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'webp';
        const key = `books/${crypto.randomUUID()}.${ext}`;
        await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
        return json({ key, url: `${env.MEDIA_PUBLIC_URL}/${key}` }, 201, env.ALLOWED_ORIGIN);
      }

      if (!env.DATABASE_URL) return json({ error: 'Neon DATABASE_URL is not configured' }, 503, env.ALLOWED_ORIGIN);
      const sql = neon(env.DATABASE_URL);

      // --- Admin routes ---
      if (url.pathname === '/api/books' && request.method === 'GET')
        return json(await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,b.updated_at,COALESCE(c.name,'') AS category FROM books b LEFT JOIN categories c ON b.category_id=c.id ORDER BY b.updated_at DESC`, 200, env.ALLOWED_ORIGIN);
      if (url.pathname === '/api/comments' && request.method === 'GET')
        return json(await sql`SELECT cm.id,cm.book_id,cm.display_name,cm.body,cm.status,cm.created_at,b.title AS book_title FROM comments cm LEFT JOIN books b ON cm.book_id=b.id WHERE cm.status <> 'deleted' ORDER BY cm.created_at DESC LIMIT 100`, 200, env.ALLOWED_ORIGIN);
      if (url.pathname === '/api/writers' && request.method === 'GET')
        return json(await sql`SELECT * FROM writer_submissions WHERE status = 'pending' ORDER BY created_at DESC`, 200, env.ALLOWED_ORIGIN);
      if (url.pathname === '/api/analytics' && request.method === 'GET')
        return json(await sql`SELECT COUNT(*)::int AS total_views, COUNT(DISTINCT device_key)::int AS unique_readers FROM view_events ve LEFT JOIN devices d ON ve.device_id=d.id`, 200, env.ALLOWED_ORIGIN);

      // --- Public mobile app routes ---

      // List published books
      if (url.pathname === '/api/public/books' && request.method === 'GET')
        return json(await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,COALESCE(b.description,'') AS description,COALESCE(c.name,'') AS category,COALESCE(b.color,'#123E39') AS color,COALESCE(b.accent,'#F5C660') AS accent,b.updated_at FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.status='published' ORDER BY b.updated_at DESC`, 200, env.ALLOWED_ORIGIN);

      // List all chapters
      if (url.pathname === '/api/public/chapters' && request.method === 'GET')
        return json(await sql`SELECT id,book_id,title,body,position FROM chapters WHERE status='published' ORDER BY position`, 200, env.ALLOWED_ORIGIN);

      // Book detail with chapters
      const bookMatch = url.pathname.match(/^\/api\/public\/books\/([^/]+)$/);
      if (bookMatch && request.method === 'GET') {
        const bookId = bookMatch[1];
        const rows = await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,COALESCE(b.description,'') AS description,COALESCE(c.name,'') AS category,COALESCE(b.color,'#123E39') AS color,COALESCE(b.accent,'#F5C660') AS accent,b.updated_at FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.id=${bookId}`;
        if (!rows.length) return json({ error: 'Not found' }, 404, env.ALLOWED_ORIGIN);
        const chs = await sql`SELECT id,book_id,title,body,position FROM chapters WHERE book_id=${bookId} AND status='published' ORDER BY position`;
        return json({ ...rows[0], chapters: chs }, 200, env.ALLOWED_ORIGIN);
      }

      // Track event (view, like, dislike)
      if (url.pathname === '/api/public/events' && request.method === 'POST') {
        const body = await request.json() as { device_id?: string; book_id?: string; event_type?: string };
        if (!body.device_id || !body.book_id || !body.event_type) return json({ error: 'device_id, book_id, event_type required' }, 400, env.ALLOWED_ORIGIN);
        // Auto-register device if not exists
        await sql`INSERT INTO devices (device_key, last_seen_at) VALUES (${body.device_id},NOW()) ON CONFLICT (device_key) DO UPDATE SET last_seen_at=NOW()`;
        const deviceRow = await sql`SELECT id FROM devices WHERE device_key=${body.device_id} LIMIT 1`;
        if (!deviceRow.length) return json({ error: 'Device registration failed' }, 500, env.ALLOWED_ORIGIN);
        const deviceUuid = deviceRow[0].id;
        if (body.event_type === 'view') {
          await sql`INSERT INTO view_events (device_id, book_id, created_at) VALUES (${deviceUuid},${body.book_id},NOW())`;
          await sql`UPDATE books SET views = views + 1 WHERE id = ${body.book_id}`;
        } else if (body.event_type === 'like') {
          await sql`INSERT INTO reactions (device_id, book_id, value, created_at) VALUES (${deviceUuid},${body.book_id},'like',NOW()) ON CONFLICT (device_id, book_id) DO UPDATE SET value='like'`;
          await sql`UPDATE books SET likes = likes + 1 WHERE id = ${body.book_id}`;
        } else if (body.event_type === 'dislike') {
          await sql`INSERT INTO reactions (device_id, book_id, value, created_at) VALUES (${deviceUuid},${body.book_id},'dislike',NOW()) ON CONFLICT (device_id, book_id) DO UPDATE SET value='dislike'`;
          await sql`UPDATE books SET dislikes = dislikes + 1 WHERE id = ${body.book_id}`;
        }
        return json({ ok: true }, 201, env.ALLOWED_ORIGIN);
      }

      // Get approved comments for a book
      const commentMatch = url.pathname.match(/^\/api\/public\/books\/([^/]+)\/comments$/);
      if (commentMatch && request.method === 'GET') {
        const bookId = commentMatch[1];
        return json(await sql`SELECT id,book_id,display_name,body,status,created_at FROM comments WHERE book_id=${bookId} AND status='approved' ORDER BY created_at DESC LIMIT 50`, 200, env.ALLOWED_ORIGIN);
      }

      // Submit a comment
      if (commentMatch && request.method === 'POST') {
        const bookId = commentMatch[1];
        const body = await request.json() as { device_id?: string; name?: string; body?: string };
        if (!body.device_id || !body.name || !body.body) return json({ error: 'device_id, name, body required' }, 400, env.ALLOWED_ORIGIN);
        // Auto-register device
        await sql`INSERT INTO devices (device_key, last_seen_at) VALUES (${body.device_id},NOW()) ON CONFLICT (device_key) DO UPDATE SET last_seen_at=NOW()`;
        const deviceRow = await sql`SELECT id FROM devices WHERE device_key=${body.device_id} LIMIT 1`;
        const deviceUuid = deviceRow.length ? deviceRow[0].id : null;
        await sql`INSERT INTO comments (book_id, device_id, display_name, body, status, created_at) VALUES (${bookId},${deviceUuid},${body.name},${body.body},'pending',NOW())`;
        return json({ ok: true, message: 'Comment submitted for moderation' }, 201, env.ALLOWED_ORIGIN);
      }

      // Public notifications
      if (url.pathname === '/api/public/notifications' && request.method === 'GET')
        return json(await sql`SELECT id,title,body,COALESCE(icon,'bell') AS icon,created_at FROM notifications WHERE status='sent' ORDER BY created_at DESC LIMIT 20`, 200, env.ALLOWED_ORIGIN);

      return json({ error: 'Not found' }, 404, env.ALLOWED_ORIGIN);
    } catch (error) { return json({ error: error instanceof Error ? error.message : 'Request failed' }, 500, env.ALLOWED_ORIGIN); }
  }
};
