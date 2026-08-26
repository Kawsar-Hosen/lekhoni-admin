import { neon } from '@neondatabase/serverless';

export interface Env { DATABASE_URL: string; MEDIA: R2Bucket; ALLOWED_ORIGIN: string; MEDIA_PUBLIC_URL: string }
const corsHeaders = (origin: string) => ({ 'content-type': 'application/json', 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' });
const json = (data: unknown, status = 200, origin = '*') => new Response(JSON.stringify(data), { status, headers: corsHeaders(origin) });

function uuid(id: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id); }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return json({}, 204, env.ALLOWED_ORIGIN);
    if (url.pathname === '/api/health') return json({ ok: true, service: 'lekhoni-admin-api', database: Boolean(env.DATABASE_URL) }, 200, env.ALLOWED_ORIGIN);

    try {
      // --- R2 Media Upload ---
      if (url.pathname === '/api/media' && request.method === 'POST') {
        const form = await request.formData(); const file = form.get('file');
        if (!(file instanceof File)) return json({ error: 'Image is required' }, 400);
        if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) return json({ error: 'Only images up to 10MB are allowed' }, 400);
        const ext = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'webp';
        const key = `books/${crypto.randomUUID()}.${ext}`;
        await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
        return json({ key, url: `${env.MEDIA_PUBLIC_URL}/${key}` }, 201);
      }

      if (!env.DATABASE_URL) return json({ error: 'Neon DATABASE_URL is not configured' }, 503);
      const sql = neon(env.DATABASE_URL);

      // ==================== ADMIN ROUTES ====================

      // --- Categories CRUD ---
      if (url.pathname === '/api/admin/categories' && request.method === 'GET')
        return json(await sql`SELECT id,name,icon,color,position,is_active,created_at FROM categories ORDER BY position,created_at DESC`);
      if (url.pathname === '/api/admin/categories' && request.method === 'POST') {
        const b = await request.json() as { name?: string; icon?: string; color?: string; position?: number };
        if (!b.name) return json({ error: 'name required' }, 400);
        const r = await sql`INSERT INTO categories (name,icon,color,position) VALUES (${b.name},${b.icon||'book-open'},${b.color||'#DDF5EC'},${b.position||0}) RETURNING id,name,icon,color,position,is_active,created_at`;
        return json(r[0], 201);
      }
      const catMatch = url.pathname.match(/^\/api\/admin\/categories\/([^/]+)$/);
      if (catMatch && request.method === 'PUT') {
        if (!uuid(catMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json() as Record<string, unknown>;
        const fields: string[] = []; const vals: unknown[] = [];
        for (const k of ['name','icon','color','position','is_active'] as const) { if (b[k] !== undefined) { fields.push(`${k}=${typeof b[k]==='string'?`'${b[k]}'`:b[k]}`); vals.push(b[k]); } }
        if (!fields.length) return json({ error: 'No fields to update' }, 400);
        const r = await sql`UPDATE categories SET ${sql(fields.join(','))} WHERE id=${catMatch[1]} RETURNING id,name,icon,color,position,is_active,created_at`;
        return json(r[0] || { error: 'Not found' }, r.length ? 200 : 404);
      }
      if (catMatch && request.method === 'DELETE') {
        if (!uuid(catMatch[1])) return json({ error: 'Invalid ID' }, 400);
        await sql`DELETE FROM categories WHERE id=${catMatch[1]}`;
        return json({ ok: true });
      }

      // --- Books CRUD ---
      if (url.pathname === '/api/admin/books' && request.method === 'GET')
        return json(await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,b.description,b.color,b.accent,b.is_new,b.featured,b.category_id,b.created_at,b.updated_at,COALESCE(c.name,'') AS category_name FROM books b LEFT JOIN categories c ON b.category_id=c.id ORDER BY b.updated_at DESC`);
      if (url.pathname === '/api/admin/books' && request.method === 'POST') {
        const b = await request.json() as Record<string, unknown>;
        if (!b.title || !b.author) return json({ error: 'title and author required' }, 400);
        const r = await sql`INSERT INTO books (title,author,category_id,cover_url,color,accent,description,status,is_new,featured) VALUES (${b.title as string},${b.author as string},${b.category_id||null},${b.cover_url||null},${b.color||'#123E39'},${b.accent||'#F5C660'},${b.description||''},${b.status||'draft'},${Boolean(b.is_new)},${Boolean(b.featured)}) RETURNING id,title,author,status,created_at`;
        return json(r[0], 201);
      }
      const bookMatch = url.pathname.match(/^\/api\/admin\/books\/([^/]+)$/);
      if (bookMatch && request.method === 'GET') {
        if (!uuid(bookMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const rows = await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,b.description,b.color,b.accent,b.is_new,b.featured,b.category_id,b.created_at,b.updated_at,COALESCE(c.name,'') AS category_name FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.id=${bookMatch[1]}`;
        if (!rows.length) return json({ error: 'Not found' }, 404);
        const chs = await sql`SELECT id,title,body,position,status,views,created_at FROM chapters WHERE book_id=${bookMatch[1]} ORDER BY position`;
        return json({ ...rows[0], chapters: chs });
      }
      if (bookMatch && request.method === 'PUT') {
        if (!uuid(bookMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json() as Record<string, unknown>;
        if (b.title !== undefined || b.author !== undefined || b.description !== undefined || b.category_id !== undefined || b.cover_url !== undefined || b.color !== undefined || b.accent !== undefined || b.status !== undefined || b.is_new !== undefined || b.featured !== undefined) {
          await sql`UPDATE books SET title=COALESCE(${b.title as string||null},title),author=COALESCE(${b.author as string||null},author),description=COALESCE(${b.description as string||null},description),category_id=COALESCE(${b.category_id as string||null},category_id),cover_url=COALESCE(${b.cover_url as string||null},cover_url),color=COALESCE(${b.color as string||null},color),accent=COALESCE(${b.accent as string||null},accent),status=COALESCE(${b.status as string||null},status),is_new=COALESCE(${b.is_new as boolean||null},is_new),featured=COALESCE(${b.featured as boolean||null},featured),updated_at=NOW() WHERE id=${bookMatch[1]}`;
        }
        const r = await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,b.description,b.color,b.accent,b.is_new,b.featured,b.category_id,b.updated_at,COALESCE(c.name,'') AS category_name FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.id=${bookMatch[1]}`;
        return json(r[0] || { error: 'Not found' }, r.length ? 200 : 404);
      }
      if (bookMatch && request.method === 'DELETE') {
        if (!uuid(bookMatch[1])) return json({ error: 'Invalid ID' }, 400);
        await sql`DELETE FROM books WHERE id=${bookMatch[1]}`;
        return json({ ok: true });
      }

      // --- Chapters CRUD ---
      if (url.pathname === '/api/admin/chapters' && request.method === 'GET')
        return json(await sql`SELECT ch.id,ch.book_id,ch.title,ch.position,ch.status,ch.views,ch.created_at,b.title AS book_title FROM chapters ch LEFT JOIN books b ON ch.book_id=b.id ORDER BY b.title,ch.position`);
      if (url.pathname === '/api/admin/chapters' && request.method === 'POST') {
        const b = await request.json() as Record<string, unknown>;
        if (!b.book_id || !b.title) return json({ error: 'book_id and title required' }, 400);
        if (!uuid(b.book_id as string)) return json({ error: 'Invalid book_id' }, 400);
        const r = await sql`INSERT INTO chapters (book_id,title,body,position,status) VALUES (${b.book_id as string},${b.title as string},${b.body||''},${b.position||0},${b.status||'draft'}) RETURNING id,book_id,title,position,status,created_at`;
        return json(r[0], 201);
      }
      const chMatch = url.pathname.match(/^\/api\/admin\/chapters\/([^/]+)$/);
      if (chMatch && request.method === 'PUT') {
        if (!uuid(chMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json() as Record<string, unknown>;
        await sql`UPDATE chapters SET title=COALESCE(${b.title as string||null},title),body=COALESCE(${b.body as string||null},body),position=COALESCE(${b.position as number||null},position),status=COALESCE(${b.status as string||null},status),updated_at=NOW() WHERE id=${chMatch[1]}`;
        const r = await sql`SELECT id,book_id,title,body,position,status,views,created_at,updated_at FROM chapters WHERE id=${chMatch[1]}`;
        return json(r[0] || { error: 'Not found' }, r.length ? 200 : 404);
      }
      if (chMatch && request.method === 'DELETE') {
        if (!uuid(chMatch[1])) return json({ error: 'Invalid ID' }, 400);
        await sql`DELETE FROM chapters WHERE id=${chMatch[1]}`;
        return json({ ok: true });
      }

      // --- Comments Moderation ---
      if (url.pathname === '/api/admin/comments' && request.method === 'GET')
        return json(await sql`SELECT cm.id,cm.book_id,cm.display_name,cm.body,cm.status,cm.created_at,b.title AS book_title FROM comments cm LEFT JOIN books b ON cm.book_id=b.id WHERE cm.status<>'deleted' ORDER BY cm.created_at DESC LIMIT 100`);
      const comMatch = url.pathname.match(/^\/api\/admin\/comments\/([^/]+)$/);
      if (comMatch && request.method === 'PUT') {
        if (!uuid(comMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json() as { status?: string };
        if (!b.status || !['approved','hidden','deleted','pending'].includes(b.status)) return json({ error: 'Valid status required: pending,approved,hidden,deleted' }, 400);
        await sql`UPDATE comments SET status=${b.status} WHERE id=${comMatch[1]}`;
        return json({ ok: true });
      }

      // --- Writer Submissions ---
      if (url.pathname === '/api/admin/writers' && request.method === 'GET')
        return json(await sql`SELECT ws.id,ws.author_name,ws.title,ws.body,ws.status,ws.note,ws.created_at,ws.reviewed_at FROM writer_submissions ws ORDER BY CASE ws.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,ws.created_at DESC`);
      const writerMatch = url.pathname.match(/^\/api\/admin\/writers\/([^/]+)$/);
      if (writerMatch && request.method === 'PUT') {
        if (!uuid(writerMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json() as { status?: string; note?: string };
        if (!b.status || !['approved','rejected','pending'].includes(b.status)) return json({ error: 'Valid status required' }, 400);
        await sql`UPDATE writer_submissions SET status=${b.status},note=${b.note||''},reviewed_at=NOW() WHERE id=${writerMatch[1]}`;
        return json({ ok: true });
      }

      // --- Notifications CRUD ---
      if (url.pathname === '/api/admin/notifications' && request.method === 'GET')
        return json(await sql`SELECT id,title,body,icon,status,created_at FROM notifications ORDER BY created_at DESC`);
      if (url.pathname === '/api/admin/notifications' && request.method === 'POST') {
        const b = await request.json() as { title?: string; body?: string; icon?: string };
        if (!b.title || !b.body) return json({ error: 'title and body required' }, 400);
        const r = await sql`INSERT INTO notifications (title,body,icon,status) VALUES (${b.title},${b.body},${b.icon||'bell'},'sent') RETURNING id,title,body,icon,status,created_at`;
        return json(r[0], 201);
      }
      const notifMatch = url.pathname.match(/^\/api\/admin\/notifications\/([^/]+)$/);
      if (notifMatch && request.method === 'DELETE') {
        if (!uuid(notifMatch[1])) return json({ error: 'Invalid ID' }, 400);
        await sql`DELETE FROM notifications WHERE id=${notifMatch[1]}`;
        return json({ ok: true });
      }

      // --- Analytics Dashboard ---
      if (url.pathname === '/api/admin/analytics' && request.method === 'GET') {
        const [totalBooks, publishedBooks, totalViews, uniqueReaders, totalComments, pendingComments, pendingWriters, totalReactions] = await Promise.all([
          sql`SELECT COUNT(*)::int AS n FROM books`,
          sql`SELECT COUNT(*)::int AS n FROM books WHERE status='published'`,
          sql`SELECT COUNT(*)::int AS n FROM view_events`,
          sql`SELECT COUNT(DISTINCT device_id)::int AS n FROM view_events`,
          sql`SELECT COUNT(*)::int AS n FROM comments WHERE status<>'deleted'`,
          sql`SELECT COUNT(*)::int AS n FROM comments WHERE status='pending'`,
          sql`SELECT COUNT(*)::int AS n FROM writer_submissions WHERE status='pending'`,
          sql`SELECT COUNT(*)::int AS n FROM reactions`,
        ]);
        const recentBooks = await sql`SELECT b.id,b.title,b.author,b.status,b.views,b.likes,b.dislikes,b.updated_at,COALESCE(c.name,'') AS category FROM books b LEFT JOIN categories c ON b.category_id=c.id ORDER BY b.updated_at DESC LIMIT 5`;
        const recentComments = await sql`SELECT cm.id,cm.display_name,cm.body,cm.status,cm.created_at,b.title AS book_title FROM comments cm LEFT JOIN books b ON cm.book_id=b.id WHERE cm.status<>'deleted' ORDER BY cm.created_at DESC LIMIT 5`;
        return json({
          totalBooks: totalBooks[0].n, publishedBooks: publishedBooks[0].n,
          totalViews: totalViews[0].n, uniqueReaders: uniqueReaders[0].n,
          totalComments: totalComments[0].n, pendingComments: pendingComments[0].n,
          pendingWriters: pendingWriters[0].n, totalReactions: totalReactions[0].n,
          recentBooks, recentComments
        });
      }

      // --- Live Readers (view_events last 5 min) ---
      if (url.pathname === '/api/admin/live' && request.method === 'GET')
        return json(await sql`SELECT ve.device_id,d.device_key,d.display_name,ve.book_id,b.title AS book_title,ve.created_at FROM view_events ve LEFT JOIN devices d ON ve.device_id=d.id LEFT JOIN books b ON ve.book_id=b.id WHERE ve.created_at>NOW()-INTERVAL '5 minutes' ORDER BY ve.created_at DESC LIMIT 20`);

      // ==================== PUBLIC MOBILE APP ROUTES ====================

      if (url.pathname === '/api/public/books' && request.method === 'GET')
        return json(await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,COALESCE(b.description,'') AS description,COALESCE(c.name,'') AS category,COALESCE(b.color,'#123E39') AS color,COALESCE(b.accent,'#F5C660') AS accent,b.updated_at FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.status='published' ORDER BY b.updated_at DESC`);
      if (url.pathname === '/api/public/chapters' && request.method === 'GET')
        return json(await sql`SELECT id,book_id,title,body,position FROM chapters WHERE status='published' ORDER BY position`);

      const pubBookMatch = url.pathname.match(/^\/api\/public\/books\/([^/]+)$/);
      if (pubBookMatch && request.method === 'GET') {
        const bookId = pubBookMatch[1];
        const rows = await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,COALESCE(b.description,'') AS description,COALESCE(c.name,'') AS category,COALESCE(b.color,'#123E39') AS color,COALESCE(b.accent,'#F5C660') AS accent,b.updated_at FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.id=${bookId} AND b.status='published'`;
        if (!rows.length) return json({ error: 'Not found' }, 404);
        const chs = await sql`SELECT id,book_id,title,body,position FROM chapters WHERE book_id=${bookId} AND status='published' ORDER BY position`;
        return json({ ...rows[0], chapters: chs });
      }

      if (url.pathname === '/api/public/events' && request.method === 'POST') {
        const b = await request.json() as { device_id?: string; book_id?: string; event_type?: string };
        if (!b.device_id || !b.book_id || !b.event_type) return json({ error: 'device_id, book_id, event_type required' }, 400);
        await sql`INSERT INTO devices (device_key, last_seen_at) VALUES (${b.device_id},NOW()) ON CONFLICT (device_key) DO UPDATE SET last_seen_at=NOW()`;
        const deviceRow = await sql`SELECT id FROM devices WHERE device_key=${b.device_id} LIMIT 1`;
        if (!deviceRow.length) return json({ error: 'Device registration failed' }, 500);
        const dId = deviceRow[0].id;
        if (b.event_type === 'view') {
          await sql`INSERT INTO view_events (device_id, book_id, created_at) VALUES (${dId},${b.book_id},NOW())`;
          await sql`UPDATE books SET views = views + 1 WHERE id = ${b.book_id}`;
        } else if (b.event_type === 'like') {
          await sql`INSERT INTO reactions (device_id, book_id, value, created_at) VALUES (${dId},${b.book_id},'like',NOW()) ON CONFLICT (device_id, book_id) DO UPDATE SET value='like'`;
          await sql`UPDATE books SET likes = likes + 1 WHERE id = ${b.book_id}`;
        } else if (b.event_type === 'dislike') {
          await sql`INSERT INTO reactions (device_id, book_id, value, created_at) VALUES (${dId},${b.book_id},'dislike',NOW()) ON CONFLICT (device_id, book_id) DO UPDATE SET value='dislike'`;
          await sql`UPDATE books SET dislikes = dislikes + 1 WHERE id = ${b.book_id}`;
        }
        return json({ ok: true }, 201);
      }

      const pubComMatch = url.pathname.match(/^\/api\/public\/books\/([^/]+)\/comments$/);
      if (pubComMatch && request.method === 'GET')
        return json(await sql`SELECT id,book_id,display_name,body,status,created_at FROM comments WHERE book_id=${pubComMatch[1]} AND status='approved' ORDER BY created_at DESC LIMIT 50`);
      if (pubComMatch && request.method === 'POST') {
        const bookId = pubComMatch[1];
        const b = await request.json() as { device_id?: string; name?: string; body?: string };
        if (!b.device_id || !b.name || !b.body) return json({ error: 'device_id, name, body required' }, 400);
        await sql`INSERT INTO devices (device_key, last_seen_at) VALUES (${b.device_id},NOW()) ON CONFLICT (device_key) DO UPDATE SET last_seen_at=NOW()`;
        const deviceRow = await sql`SELECT id FROM devices WHERE device_key=${b.device_id} LIMIT 1`;
        const dId = deviceRow.length ? deviceRow[0].id : null;
        await sql`INSERT INTO comments (book_id, device_id, display_name, body, status, created_at) VALUES (${bookId},${dId},${b.name},${b.body},'pending',NOW())`;
        return json({ ok: true, message: 'Comment submitted for moderation' }, 201);
      }

      if (url.pathname === '/api/public/notifications' && request.method === 'GET')
        return json(await sql`SELECT id,title,body,COALESCE(icon,'bell') AS icon,created_at FROM notifications WHERE status='sent' ORDER BY created_at DESC LIMIT 20`);

      return json({ error: 'Not found' }, 404);
    } catch (error) { return json({ error: error instanceof Error ? error.message : 'Request failed' }, 500); }
  }
};
