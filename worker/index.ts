import { neon } from '@neondatabase/serverless';

export interface Env { DATABASE_URL: string; MEDIA: R2Bucket; ALLOWED_ORIGIN: string; MEDIA_PUBLIC_URL: string }
const corsHeaders = (origin: string) => ({ 'content-type': 'application/json', 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' });
const json = (data: unknown, status = 200, origin = '*') => new Response(JSON.stringify(data), { status, headers: corsHeaders(origin) });

function uuid(id: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id); }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env.ALLOWED_ORIGIN || '*') });
    if (url.pathname === '/api/health') return json({ ok: true, service: 'lekhoni-admin-api', database: Boolean(env.DATABASE_URL) }, 200, env.ALLOWED_ORIGIN);

    try {
      // --- DB Migration (run once) ---
      if (url.pathname === '/api/admin/migrate' && request.method === 'POST') {
        if (!env.DATABASE_URL) return json({ error: 'No DB' }, 503);
        const sql = neon(env.DATABASE_URL);
        await sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS cover_url TEXT`;
        await sql`ALTER TABLE chapters ADD COLUMN IF NOT EXISTS minutes INT NOT NULL DEFAULT 5`;
        await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS url TEXT NOT NULL DEFAULT ''`;
        await sql`CREATE TABLE IF NOT EXISTS writers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), username TEXT UNIQUE NOT NULL, writer_name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL DEFAULT '', bio TEXT DEFAULT '', avatar_url TEXT, follower_count INT DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`ALTER TABLE writers ADD COLUMN IF NOT EXISTS salt TEXT NOT NULL DEFAULT ''`;
        await sql`CREATE TABLE IF NOT EXISTS follows (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), device_id UUID REFERENCES devices(id), writer_id UUID REFERENCES writers(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(device_id, writer_id))`;
        await sql`CREATE TABLE IF NOT EXISTS stories (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), writer_id UUID REFERENCES writers(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', cover_url TEXT, category TEXT DEFAULT '', views INT DEFAULT 0, likes INT DEFAULT 0, chapters_count INT DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`CREATE TABLE IF NOT EXISTS story_chapters (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), story_id UUID REFERENCES stories(id) ON DELETE CASCADE, title TEXT NOT NULL, body TEXT DEFAULT '', position INT DEFAULT 0, minutes INT DEFAULT 5, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`CREATE TABLE IF NOT EXISTS writer_activities (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), writer_id UUID REFERENCES writers(id) ON DELETE CASCADE, type TEXT NOT NULL, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`DELETE FROM writers WHERE salt = '' OR salt IS NULL`;
        await sql`ALTER TABLE writers ADD COLUMN IF NOT EXISTS salt TEXT NOT NULL DEFAULT ''`;
        await sql`CREATE TABLE IF NOT EXISTS writer_notifications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), writer_id UUID REFERENCES writers(id) ON DELETE CASCADE, title TEXT NOT NULL, body TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'info', story_id UUID, is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`ALTER TABLE stories ADD COLUMN IF NOT EXISTS review_note TEXT DEFAULT ''`;
        await sql`ALTER TABLE writer_notifications ADD COLUMN IF NOT EXISTS url TEXT DEFAULT ''`;
        await sql`CREATE TABLE IF NOT EXISTS home_settings (id INT PRIMARY KEY DEFAULT 1, sections JSONB NOT NULL DEFAULT '[]', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`INSERT INTO home_settings (id, sections) VALUES (1, '[]') ON CONFLICT (id) DO NOTHING`;
        await sql`ALTER TABLE home_settings ADD COLUMN IF NOT EXISTS views_visible BOOLEAN NOT NULL DEFAULT TRUE`;
        await sql`ALTER TABLE books ADD COLUMN IF NOT EXISTS home_section TEXT`;
        await sql`ALTER TABLE books ADD COLUMN IF NOT EXISTS views_visible BOOLEAN NOT NULL DEFAULT TRUE`;
        await sql`CREATE TABLE IF NOT EXISTS user_state (device_key TEXT PRIMARY KEY, settings JSONB NOT NULL DEFAULT '{}', favorites JSONB NOT NULL DEFAULT '[]', downloads JSONB NOT NULL DEFAULT '[]', history JSONB NOT NULL DEFAULT '[]', positions JSONB NOT NULL DEFAULT '{}', bookmarks JSONB NOT NULL DEFAULT '[]', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        // Backfill: sync chapters from published writer stories into their books (fix: books with missing chapters)
        try {
          const pubStories = await sql`SELECT s.id,s.title,w.writer_name FROM stories s JOIN writers w ON s.writer_id=w.id WHERE s.status='published'`;
          for (const st of pubStories) {
            const bookRows = await sql`SELECT id FROM books WHERE title=${st.title as string} AND author=${st.writer_name as string} LIMIT 1`;
            if (!bookRows.length) continue;
            const bId = bookRows[0].id;
            const storyChs = await sql`SELECT title,body,position,minutes FROM story_chapters WHERE story_id=${st.id} ORDER BY position`;
            const existing = await sql`SELECT title FROM chapters WHERE book_id=${bId}`;
            const have = new Set(existing.map((e: any) => (e.title || '').trim()));
            let added = 0;
            for (const c of storyChs) {
              if (have.has((c.title || '').trim())) continue;
              await sql`INSERT INTO chapters (book_id,title,body,position,status,minutes) VALUES (${bId},${c.title},${c.body||''},${c.position},'published',${c.minutes||5})`;
              added++;
            }
            if (added > 0) { console.log('backfilled', added, 'chapters for', st.title); }
          }
        } catch (e) { console.error('backfill error', e); }
        return json({ ok: true, message: 'Migration applied' });
      }

      // --- R2 Media Upload ---
      if (url.pathname === '/api/media' && request.method === 'POST') {
        const form = await request.formData(); const file = form.get('file');
        if (!file || typeof file === 'string') return json({ error: 'Image is required' }, 400);
        const fileName = (file as any).name || 'upload.jpg';
        const fileType = (file as any).type || 'image/jpeg';
        const fileSize = (file as any).size || 0;
        if (fileSize > 10 * 1024 * 1024) return json({ error: 'Only images up to 10MB are allowed' }, 400);
        const ext = fileName.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'jpg';
        const key = `books/${crypto.randomUUID()}.${ext}`;
        await env.MEDIA.put(key, (file as any).stream ? (file as any).stream() : file as any, { httpMetadata: { contentType: fileType } });
        return json({ key, url: `${env.MEDIA_PUBLIC_URL}/${key}` }, 201);
      }

      if (!env.DATABASE_URL) return json({ error: 'Neon DATABASE_URL is not configured' }, 503);
      const sql = neon(env.DATABASE_URL);

      // ==================== ADMIN ROUTES ====================

      // --- Categories CRUD ---
      if (url.pathname === '/api/admin/categories' && request.method === 'GET')
        return json(await sql`SELECT id,name,icon,color,cover_url,position,is_active,created_at FROM categories ORDER BY position,created_at DESC`);
      if (url.pathname === '/api/admin/categories' && request.method === 'POST') {
        const b = await request.json() as { name?: string; icon?: string; color?: string; cover_url?: string; position?: number };
        if (!b.name) return json({ error: 'name required' }, 400);
        const r = await sql`INSERT INTO categories (name,icon,color,cover_url,position) VALUES (${b.name},${b.icon||'book-open'},${b.color||'#DDF5EC'},${b.cover_url||null},${b.position||0}) RETURNING id,name,icon,color,cover_url,position,is_active,created_at`;
        return json(r[0], 201);
      }
      const catMatch = url.pathname.match(/^\/api\/admin\/categories\/([^/]+)$/);
      if (catMatch && request.method === 'PUT') {
        if (!uuid(catMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json() as { name?: string; icon?: string; color?: string; cover_url?: string | null; position?: number; is_active?: boolean };
        if (!Object.keys(b).length) return json({ error: 'No fields to update' }, 400);
        let r;
        if ('cover_url' in b) {
          r = await sql`UPDATE categories SET name=COALESCE(${b.name},name), icon=COALESCE(${b.icon},icon), color=COALESCE(${b.color},color), cover_url=${b.cover_url}, position=COALESCE(${b.position},position), is_active=COALESCE(${b.is_active},is_active) WHERE id=${catMatch[1]} RETURNING id,name,icon,color,cover_url,position,is_active,created_at`;
        } else {
          r = await sql`UPDATE categories SET name=COALESCE(${b.name},name), icon=COALESCE(${b.icon},icon), color=COALESCE(${b.color},color), position=COALESCE(${b.position},position), is_active=COALESCE(${b.is_active},is_active) WHERE id=${catMatch[1]} RETURNING id,name,icon,color,cover_url,position,is_active,created_at`;
        }
        return json(r[0] || { error: 'Not found' }, r.length ? 200 : 404);
      }
      if (catMatch && request.method === 'DELETE') {
        if (!uuid(catMatch[1])) return json({ error: 'Invalid ID' }, 400);
        await sql`DELETE FROM categories WHERE id=${catMatch[1]}`;
        return json({ ok: true });
      }

      // --- Books CRUD ---
      if (url.pathname === '/api/admin/books' && request.method === 'GET')
        return json(await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,b.description,b.color,b.accent,b.is_new,b.featured,b.home_section,b.views_visible,b.category_id,b.created_at,b.updated_at,COALESCE(c.name,'') AS category_name FROM books b LEFT JOIN categories c ON b.category_id=c.id ORDER BY b.updated_at DESC`);
      if (url.pathname === '/api/admin/books' && request.method === 'POST') {
        const b = await request.json() as { title?: string; author?: string; category_id?: string; cover_url?: string; color?: string; accent?: string; description?: string; status?: string; is_new?: boolean; featured?: boolean; home_section?: string };
        if (!b.title) return json({ error: 'title required' }, 400);
        const r = await sql`INSERT INTO books (title,author,category_id,cover_url,color,accent,description,status,is_new,featured,home_section) VALUES (${b.title as string},${b.author as string},${b.category_id||null},${b.cover_url||null},${b.color||'#123E39'},${b.accent||'#F5C660'},${b.description||''},${b.status||'draft'},${Boolean(b.is_new)},${Boolean(b.featured)},${(b.home_section||null) as string|null}) RETURNING id,title,author,status,created_at`;
        return json(r[0], 201);
      }
      const bookMatch = url.pathname.match(/^\/api\/admin\/books\/([^/]+)$/);
      if (bookMatch && request.method === 'GET') {
        if (!uuid(bookMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const rows = await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,b.description,b.color,b.accent,b.is_new,b.featured,b.home_section,b.views_visible,b.category_id,b.created_at,b.updated_at,COALESCE(c.name,'') AS category_name FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.id=${bookMatch[1]}`;
        if (!rows.length) return json({ error: 'Not found' }, 404);
        const chs = await sql`SELECT id,title,body,position,status,views,created_at FROM chapters WHERE book_id=${bookMatch[1]} ORDER BY position`;
        return json({ ...rows[0], chapters: chs });
      }
      if (bookMatch && request.method === 'PUT') {
        if (!uuid(bookMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json() as Record<string, unknown>;
        if (b.title !== undefined || b.author !== undefined || b.description !== undefined || b.category_id !== undefined || b.cover_url !== undefined || b.color !== undefined || b.accent !== undefined || b.status !== undefined || b.is_new !== undefined || b.featured !== undefined || b.home_section !== undefined || b.views_visible !== undefined) {
          await sql`UPDATE books SET title=COALESCE(${b.title as string||null},title),author=COALESCE(${b.author as string||null},author),description=COALESCE(${b.description as string||null},description),category_id=COALESCE(${b.category_id as string||null},category_id),cover_url=COALESCE(${b.cover_url as string||null},cover_url),color=COALESCE(${b.color as string||null},color),accent=COALESCE(${b.accent as string||null},accent),status=COALESCE(${b.status as string||null},status),is_new=COALESCE(${b.is_new as boolean||null},is_new),featured=COALESCE(${b.featured as boolean||null},featured),home_section=COALESCE(${b.home_section as string||null},home_section),views_visible=COALESCE(${b.views_visible as boolean||null},views_visible),updated_at=NOW() WHERE id=${bookMatch[1]}`;
        }
        const r = await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,b.description,b.color,b.accent,b.is_new,b.featured,b.home_section,b.views_visible,b.category_id,b.updated_at,COALESCE(c.name,'') AS category_name FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.id=${bookMatch[1]}`;
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

      // --- Writer Story Review (approve -> publish as book) ---
      if (url.pathname === '/api/admin/writers' && request.method === 'GET')
        return json(await sql`SELECT s.id,s.title,s.description,s.status,s.cover_url,s.category,s.views,s.likes,s.chapters_count,s.review_note,s.created_at,s.updated_at,w.writer_name,w.avatar_url,
        (SELECT COUNT(*)::int FROM story_chapters sc WHERE sc.story_id=s.id) AS chapter_count
        FROM stories s JOIN writers w ON s.writer_id=w.id
        ORDER BY CASE s.status WHEN 'pending' THEN 0 WHEN 'published' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END,s.updated_at DESC`);
      // --- Admin: Writer user profiles (stats + detail) ---
      if (url.pathname === '/api/admin/writer-users' && request.method === 'GET') {
        return json(await sql`SELECT w.id,w.username,w.writer_name,w.email,w.avatar_url,w.bio,w.follower_count,w.is_active,w.created_at,
          (SELECT COUNT(*)::int FROM stories s WHERE s.writer_id=w.id) AS total_stories,
          (SELECT COUNT(*)::int FROM stories s WHERE s.writer_id=w.id AND s.status='published') AS published_stories,
          (SELECT COALESCE(SUM(s.views),0)::int FROM stories s WHERE s.writer_id=w.id) AS total_views,
          (SELECT COUNT(*)::int FROM follows f WHERE f.writer_id=w.id) AS followers
          FROM writers w ORDER BY w.created_at DESC`);
      }
      const writerUserMatch = url.pathname.match(/^\/api\/admin\/writer-users\/([^/]+)$/);
      if (writerUserMatch && request.method === 'GET') {
        if (!uuid(writerUserMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const prof = await sql`SELECT w.id,w.username,w.writer_name,w.email,w.avatar_url,w.bio,w.follower_count,w.is_active,w.created_at,(SELECT COUNT(*)::int FROM follows f WHERE f.writer_id=w.id) AS followers FROM writers w WHERE w.id=${writerUserMatch[1]} LIMIT 1`;
        if (!prof.length) return json({ error: 'Not found' }, 404);
        const stories = await sql`SELECT s.id,s.title,s.description,s.status,s.category,s.views,s.likes,s.chapters_count,s.review_note,s.created_at,s.updated_at,(SELECT COUNT(*)::int FROM story_chapters sc WHERE sc.story_id=s.id) AS chapter_count FROM stories s WHERE s.writer_id=${writerUserMatch[1]} ORDER BY s.updated_at DESC`;
        return json({ profile: prof[0], stories });
      }
      const writerMatch = url.pathname.match(/^\/api\/admin\/writers\/([^/]+)$/);
      if (writerMatch && request.method === 'PUT') {
        if (!uuid(writerMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json() as { status?: string; note?: string };
        if (!b.status || !['published','rejected','pending'].includes(b.status)) return json({ error: 'Valid status required: published,rejected,pending' }, 400);
        const story = await sql`SELECT s.id,s.title,s.description,s.category,s.cover_url,s.writer_id,w.writer_name FROM stories s JOIN writers w ON s.writer_id=w.id WHERE s.id=${writerMatch[1]}`;
        if (!story.length) return json({ error: 'Not found' }, 404);
        const s = story[0];
        if (b.status === 'published') {
          let catId: string | null = null;
          if (s.category) {
            const cat = await sql`SELECT id FROM categories WHERE LOWER(name)=${s.category.toLowerCase()} LIMIT 1`;
            if (cat.length) catId = cat[0].id;
          }
          if (catId === null) {
            const cat = await sql`INSERT INTO categories (name,icon,color) VALUES (${s.category||'গল্প'},'book-open','#DDF5EC') RETURNING id`;
            catId = cat[0].id;
          }
          const chapters = await sql`SELECT title,body,position FROM story_chapters WHERE story_id=${s.id} ORDER BY position`;
          let bookId: string | null = null;
          const existingBook = await sql`SELECT id FROM books WHERE title=${s.title} AND author=${s.writer_name} LIMIT 1`;
          if (existingBook.length) {
            bookId = existingBook[0].id;
          } else {
            const bk = await sql`INSERT INTO books (title,author,category_id,cover_url,description,status) VALUES (${s.title},${s.writer_name},${catId},${s.cover_url||null},${s.description||''},'published') RETURNING id`;
            bookId = bk[0]?.id || null;
          }
          if (bookId) {
            const existingChs = await sql`SELECT title FROM chapters WHERE book_id=${bookId}`;
            const have = new Set(existingChs.map((e: any) => (e.title || '').trim()));
            for (const c of chapters) {
              if (have.has((c.title || '').trim())) continue;
              try { await sql`INSERT INTO chapters (book_id,title,body,position,status) VALUES (${bookId},${c.title},${c.body||''},${c.position},'published')`; } catch (e) { console.error('chapter insert failed', e); }
            }
          }
          const actData = JSON.stringify({ story_id: s.id, title: s.title });
          const approveTitle = 'Story Approved';
          const approveBody = `"${s.title}" has been published.`;
          await sql`UPDATE stories SET status='published',review_note=${b.note||''},updated_at=NOW() WHERE id=${s.id}`;
          await sql`INSERT INTO writer_activities (writer_id,type,data) VALUES (${s.writer_id},'story_approved',${actData}::jsonb)`;
          await sql`INSERT INTO writer_notifications (writer_id,title,body,type) VALUES (${s.writer_id},${approveTitle},${approveBody},${'approved'})`;
          return json({ ok: true, book_id: bookId });
        } else if (b.status === 'rejected') {
          await sql`UPDATE stories SET status='rejected',review_note=${b.note||''},updated_at=NOW() WHERE id=${s.id}`;
          await sql`INSERT INTO writer_notifications (writer_id,title,body,type) VALUES (${s.writer_id},${'Story Rejected'},${'"' + s.title + '" was rejected.' + (b.note ? ' Reason: '+b.note : '')},${'rejected'})`;
          return json({ ok: true });
        } else {
          await sql`UPDATE stories SET status='pending',review_note='',updated_at=NOW() WHERE id=${s.id}`;
          return json({ ok: true });
        }
      }

      // --- Notifications CRUD ---
      if (url.pathname === '/api/admin/notifications' && request.method === 'GET') {
        const [notifs, wNotifs] = await Promise.all([
          sql`SELECT id,title,body,icon,url,'reader' AS target,status,created_at FROM notifications ORDER BY created_at DESC`,
          sql`SELECT (array_agg(wn.id ORDER BY wn.created_at))[1] AS id,wn.title,wn.body,'bell' AS icon,wn.url,'writer' AS target,'sent' AS status,MIN(wn.created_at) AS created_at,COUNT(*)::int AS writer_count FROM writer_notifications wn GROUP BY wn.title,wn.body,wn.url ORDER BY MIN(wn.created_at) DESC`,
        ]);
        return json([...notifs, ...wNotifs].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      }
      if (url.pathname === '/api/admin/notifications' && request.method === 'POST') {
        const b = await request.json() as { title?: string; body?: string; icon?: string; url?: string };
        if (!b.title || !b.body) return json({ error: 'title and body required' }, 400);
        const r = await sql`INSERT INTO notifications (title,body,icon,url,status) VALUES (${b.title},${b.body},${b.icon||'bell'},${b.url||''},'sent') RETURNING id,title,body,icon,url,status,created_at`;
        return json(r[0], 201);
      }
      const notifMatch = url.pathname.match(/^\/api\/admin\/notifications\/([^/]+)$/);
      if (notifMatch && request.method === 'DELETE') {
        if (!uuid(notifMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const existing = await sql`SELECT title,body,url FROM notifications WHERE id=${notifMatch[1]}`;
        if (existing.length) {
          await sql`DELETE FROM notifications WHERE id=${notifMatch[1]}`;
        } else {
          const wNotifs = await sql`SELECT title,body,url FROM writer_notifications WHERE id=${notifMatch[1]}`;
          if (wNotifs.length) {
            await sql`DELETE FROM writer_notifications WHERE title=${wNotifs[0].title} AND body=${wNotifs[0].body} AND COALESCE(url,'')=${wNotifs[0].url || ''}`;
          }
        }
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
          sql`SELECT COUNT(*)::int AS n FROM stories WHERE status='pending'`,
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

      // --- Admin: Home sections config ---
      if (url.pathname === '/api/admin/home-config' && request.method === 'GET') {
        const row = await sql`SELECT sections FROM home_settings WHERE id=1 LIMIT 1`;
        if (!row[0]) return json([]);
        const raw = row[0].sections;
        return json(JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw)));
      }
      if (url.pathname === '/api/admin/home-config' && request.method === 'PUT') {
        const b = await request.json() as { sections: { key: string; enabled: boolean; title?: string }[] };
        const sections = (b.sections || []).filter((s) => s && s.key).map((s) => ({ key: s.key, enabled: s.enabled !== false, title: s.title || '' }));
        await sql`UPDATE home_settings SET sections=${JSON.stringify(sections) as any}, updated_at=NOW() WHERE id=1`;
        return json({ ok: true });
      }
      // --- Admin: App config (global settings) ---
      if (url.pathname === '/api/admin/app-config' && request.method === 'GET') {
        const row = await sql`SELECT views_visible FROM home_settings WHERE id=1 LIMIT 1`;
        return json({ views_visible: row[0]?.views_visible !== false });
      }
      if (url.pathname === '/api/admin/app-config' && request.method === 'PUT') {
        const b = await request.json() as { views_visible?: boolean };
        await sql`UPDATE home_settings SET views_visible=${b.views_visible === true}, updated_at=NOW() WHERE id=1`;
        return json({ ok: true, views_visible: b.views_visible === true });
      }
      // --- Admin: Writer Stories (all writers' stories for approval) ---
      if (url.pathname === '/api/admin/stories' && request.method === 'GET')
        return json(await sql`SELECT s.id,s.title,s.description,s.status,s.cover_url,s.category,s.views,s.likes,s.chapters_count,s.review_note,s.created_at,s.updated_at,w.writer_name,w.username FROM stories s LEFT JOIN writers w ON s.writer_id=w.id ORDER BY CASE s.status WHEN 'pending' THEN 0 WHEN 'published' THEN 1 ELSE 2 END,s.updated_at DESC`);
      const adminStoryMatch = url.pathname.match(/^\/api\/admin\/stories\/([^/]+)$/);
      if (adminStoryMatch && request.method === 'PUT') {
        if (!uuid(adminStoryMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json() as { status?: string; review_note?: string };
        if (b.status && !['draft','pending','published','rejected'].includes(b.status)) return json({ error: 'Invalid status' }, 400);
        await sql`UPDATE stories SET status=COALESCE(${b.status},status),review_note=COALESCE(${b.review_note},review_note),updated_at=NOW() WHERE id=${adminStoryMatch[1]}`;
        const s = await sql`SELECT s.id,s.title,s.description,s.category,s.cover_url,s.writer_id,w.writer_name FROM stories s JOIN writers w ON s.writer_id=w.id WHERE s.id=${adminStoryMatch[1]}`;
        if (b.status === 'published' && s.length) {
          try {
            const st = s[0];
            let catId: string | null = null;
            if (st.category) { const cat = await sql`SELECT id FROM categories WHERE LOWER(name)=${st.category.toLowerCase()} LIMIT 1`; if (cat.length) catId = cat[0].id; }
            if (!catId) { const cat = await sql`INSERT INTO categories (name,icon,color) VALUES (${st.category||'গল্প'},'book-open','#DDF5EC') RETURNING id`; catId = cat[0].id; }
            const chapters = await sql`SELECT title,body,position FROM story_chapters WHERE story_id=${st.id} ORDER BY position`;
            let bookId: string | null = null;
            const existingBook = await sql`SELECT id FROM books WHERE title=${st.title} AND author=${st.writer_name} LIMIT 1`;
            if (existingBook.length) { bookId = existingBook[0].id; }
            else { const bk = await sql`INSERT INTO books (title,author,category_id,cover_url,description,status) VALUES (${st.title},${st.writer_name},${catId},${st.cover_url||null},${st.description||''},'published') RETURNING id`; bookId = bk[0]?.id || null; }
            if (bookId) {
              const existingChs = await sql`SELECT title FROM chapters WHERE book_id=${bookId}`;
              const have = new Set(existingChs.map((e: any) => (e.title || '').trim()));
              for (const c of chapters) { if (have.has((c.title || '').trim())) continue; try { await sql`INSERT INTO chapters (book_id,title,body,position,status) VALUES (${bookId},${c.title},${c.body||''},${c.position},'published')`; } catch (e) { console.error('chapter insert failed', e); } }
            }
          } catch (e) { console.error('stories publish sync failed', e); }
        }
        if (s.length) {
          const notifTitle = b.status === 'published' ? 'Story Approved!' : b.status === 'rejected' ? 'Story Rejected' : 'Story Updated';
          const notifBody = b.status === 'published' ? `"${s[0].title}" has been published.` : b.status === 'rejected' ? `"${s[0].title}" was rejected.${b.review_note ? ' Reason: ' + b.review_note : ''}` : `Your story "${s[0].title}" status updated.`;
          await sql`INSERT INTO writer_notifications (writer_id,title,body,type,story_id) VALUES (${s[0].writer_id},${notifTitle},${notifBody},${b.status || 'info'},${adminStoryMatch[1]})`;
        }
        return json({ ok: true });
      }
      const adminStoryChMatch = url.pathname.match(/^\/api\/admin\/stories\/([^/]+)\/chapters$/);
      if (adminStoryChMatch && request.method === 'GET') {
        if (!uuid(adminStoryChMatch[1])) return json({ error: 'Invalid ID' }, 400);
        return json(await sql`SELECT id,story_id,title,body,position,minutes,created_at FROM story_chapters WHERE story_id=${adminStoryChMatch[1]} ORDER BY position`);
      }

      // --- Admin: Writer Notifications ---
      if (url.pathname === '/api/admin/writer-notifications' && request.method === 'GET')
        return json(await sql`SELECT wn.id,wn.title,wn.body,wn.type,wn.is_read,wn.created_at,w.writer_name,w.username FROM writer_notifications wn LEFT JOIN writers w ON wn.writer_id=w.id ORDER BY wn.created_at DESC LIMIT 100`);
      if (url.pathname === '/api/admin/writer-notifications/send' && request.method === 'POST') {
        const b = await request.json() as { writer_id?: string; title?: string; body?: string; type?: string; url?: string };
        if (!b.title || !b.body) return json({ error: 'title, body required' }, 400);
        const title = b.title; const body = b.body; const type = b.type || 'info'; const notifUrl = b.url || '';
        if (b.writer_id) {
          const r = await sql`INSERT INTO writer_notifications (writer_id,title,body,type,url) VALUES (${b.writer_id},${title},${body},${type},${notifUrl}) RETURNING id,title,body,type,url,created_at`;
          return json(r[0], 201);
        }
        const writers = await sql`SELECT id FROM writers WHERE is_active=true`;
        if (!writers.length) return json({ ok: true, count: 0 });
        for (const w of writers) {
          await sql`INSERT INTO writer_notifications (writer_id,title,body,type,url) VALUES (${w.id},${title},${body},${type},${notifUrl})`;
        }
        return json({ ok: true, count: writers.length }, 201);
      }
      const wnAdminMatch = url.pathname.match(/^\/api\/admin\/writer-notifications\/([^/]+)$/);
      if (wnAdminMatch && request.method === 'DELETE') {
        if (!uuid(wnAdminMatch[1])) return json({ error: 'Invalid ID' }, 400);
        await sql`DELETE FROM writer_notifications WHERE id=${wnAdminMatch[1]}`;
        return json({ ok: true });
      }

      // ==================== PUBLIC MOBILE APP ROUTES ====================

      if (url.pathname === '/api/public/categories' && request.method === 'GET')
        return json(await sql`SELECT id,name,icon,color,cover_url FROM categories WHERE is_active=true ORDER BY position`);
      if (url.pathname === '/api/public/books' && request.method === 'GET')
        return json(await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,COALESCE(b.description,'') AS description,COALESCE(c.name,'') AS category,COALESCE(b.color,'#123E39') AS color,COALESCE(b.accent,'#F5C660') AS accent,b.is_new,b.featured,b.home_section,b.views_visible,b.updated_at FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.status='published' ORDER BY b.updated_at DESC`);
      if (url.pathname === '/api/public/chapters' && request.method === 'GET')
        return json(await sql`SELECT id,book_id,title,body,position,minutes FROM chapters WHERE status='published' ORDER BY position`);

      // --- Public: Home sections config ---
      if (url.pathname === '/api/home-config' && request.method === 'GET') {
        const row = await sql`SELECT sections FROM home_settings WHERE id=1 LIMIT 1`;
        const raw = row[0]?.sections;
        const known = ['featured', 'newEpisodes', 'mostPopular', 'weeklyPopular', 'monthlyPopular', 'popularAuthors'];
        const saved = raw ? (JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw)) as { key: string; enabled: boolean; title?: string }[]).filter((s) => s && known.includes(s.key)) : [];
        const seen = new Set(saved.map((s) => s.key));
        for (const k of known) if (!seen.has(k)) { saved.push({ key: k, enabled: true, title: '' }); seen.add(k); }
        return json(saved.map((s) => ({ key: s.key, enabled: s.enabled !== false, title: s.title || '' })));
      }

      // --- Public: Home section book lists (time-based auto + manual override) ---
      if (url.pathname === '/api/home-sections' && request.method === 'GET') {
        const cfgRow = await sql`SELECT sections, views_visible FROM home_settings WHERE id=1 LIMIT 1`;
        const cfgRaw = cfgRow[0]?.sections;
        const savedCfg = cfgRaw ? (JSON.parse(typeof cfgRaw === 'string' ? cfgRaw : JSON.stringify(cfgRaw)) as { key: string; enabled: boolean; title?: string }[]) : [];
        const titleOf = (k: string) => { const s = savedCfg.find((x) => x.key === k); return (s && s.title) ? s.title : ''; };
        const now = Date.now();
        const books = await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,COALESCE(b.description,'') AS description,COALESCE(c.name,'') AS category,COALESCE(b.color,'#123E39') AS color,COALESCE(b.accent,'#F5C660') AS accent,b.is_new,b.featured,b.home_section,b.views_visible,b.created_at,b.updated_at FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.status='published'`;
        const eff = (b: any) => {
          if (b.home_section) return b.home_section;
          const ageDays = (now - new Date(b.created_at).getTime()) / 86400000;
          if (ageDays < 7) return 'ongoing';
          if (ageDays <= 30) return 'weekly';
          return 'monthly';
        };
        const byViews = (a: any, b: any) => +b.views - +a.views;
        const byNewest = (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        const fn = (id: string | null) => (id ? `${id}` : '');
        const fmt = (b: any) => ({ id: fn(b.id), title: b.title, author: b.author, cover_url: b.cover_url, views: `${b.views}`, likes: b.likes, description: b.description, category: b.category, color: b.color, accent: b.accent, is_new: b.is_new, featured: b.featured, home_section: b.home_section || eff(b), views_visible: b.views_visible !== false });
        const ongoing = books.filter((b: any) => eff(b) === 'ongoing');
        const weekly = books.filter((b: any) => eff(b) === 'weekly');
        const monthly = books.filter((b: any) => eff(b) === 'monthly');
        const featured = books.filter((b: any) => eff(b) === 'featured' || b.featured);
        const sections = [
          { key: 'featured', title: titleOf('featured'), books: [...featured].sort(byViews) },
          { key: 'newEpisodes', title: titleOf('newEpisodes'), books: [...ongoing].sort(byNewest) },
          { key: 'weeklyPopular', title: titleOf('weeklyPopular'), books: [...weekly].sort(byViews) },
          { key: 'monthlyPopular', title: titleOf('monthlyPopular'), books: [...monthly].sort(byViews) },
          { key: 'mostPopular', title: titleOf('mostPopular'), books: [...books].sort(byViews).slice(0, 12) },
        ].map((s) => ({ key: s.key, title: s.title, books: s.books.slice(0, 12).map(fmt) }));
        const writers = await sql`SELECT id,writer_name,bio,avatar_url,follower_count FROM writers WHERE is_active=true ORDER BY follower_count DESC LIMIT 12`;
        return json({ viewsVisible: cfgRow?.[0]?.views_visible !== false, sections, writers: writers.map((w: any) => ({ id: `${w.id}`, writer_name: w.writer_name, bio: w.bio, avatar_url: w.avatar_url, follower_count: w.follower_count })) });
      }

      const pubBookMatch = url.pathname.match(/^\/api\/public\/books\/([^/]+)$/);
      if (pubBookMatch && request.method === 'GET') {
        const bookId = pubBookMatch[1];
        const rows = await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,COALESCE(b.description,'') AS description,COALESCE(c.name,'') AS category,COALESCE(b.color,'#123E39') AS color,COALESCE(b.accent,'#F5C660') AS accent,b.is_new,b.featured,b.home_section,b.views_visible,b.updated_at FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.id=${bookId} AND b.status='published'`;
        if (!rows.length) return json({ error: 'Not found' }, 404);
        const chs = await sql`SELECT id,book_id,title,body,position,minutes FROM chapters WHERE book_id=${bookId} AND status='published' ORDER BY position`;
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
        } else if (b.event_type === 'like' || b.event_type === 'dislike') {
          const existing = await sql`SELECT value FROM reactions WHERE device_id=${dId} AND book_id=${b.book_id} LIMIT 1`;
          const newVal = b.event_type === 'like' ? 'like' : 'dislike';
          const oldVal = existing.length ? existing[0].value : null;
          if (oldVal === newVal) {
            await sql`UPDATE reactions SET value=${newVal}, created_at=NOW() WHERE device_id=${dId} AND book_id=${b.book_id}`;
          } else {
            await sql`INSERT INTO reactions (device_id, book_id, value, created_at) VALUES (${dId},${b.book_id},${newVal},NOW()) ON CONFLICT (device_id, book_id) DO UPDATE SET value=${newVal}, created_at=NOW()`;
            if (oldVal === 'like') await sql`UPDATE books SET likes = GREATEST(likes - 1, 0), dislikes = dislikes + 1 WHERE id = ${b.book_id}`;
            else if (oldVal === 'dislike') await sql`UPDATE books SET dislikes = GREATEST(dislikes - 1, 0), likes = likes + 1 WHERE id = ${b.book_id}`;
            else if (b.event_type === 'like') await sql`UPDATE books SET likes = likes + 1 WHERE id = ${b.book_id}`;
            else await sql`UPDATE books SET dislikes = dislikes + 1 WHERE id = ${b.book_id}`;
          }
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

      const pubLikeMatch = url.pathname.match(/^\/api\/public\/books\/([^/]+)\/like$/);
      if (pubLikeMatch && request.method === 'POST') {
        const bookId = pubLikeMatch[1];
        const b = await request.json() as { device_id?: string; value?: boolean };
        if (!b.device_id || typeof b.value !== 'boolean') return json({ error: 'device_id and value required' }, 400);
        await sql`INSERT INTO devices (device_key, last_seen_at) VALUES (${b.device_id},NOW()) ON CONFLICT (device_key) DO UPDATE SET last_seen_at=NOW()`;
        const deviceRow = await sql`SELECT id FROM devices WHERE device_key=${b.device_id} LIMIT 1`;
        const dId = deviceRow.length ? deviceRow[0].id : null;
        const cur = await sql`SELECT value FROM reactions WHERE device_id=${dId} AND book_id=${bookId} LIMIT 1`;
        const curVal = cur.length ? cur[0].value : null;
        if (b.value) {
          if (curVal === 'dislike') await sql`UPDATE books SET likes=likes+1, dislikes=GREATEST(dislikes-1,0) WHERE id=${bookId}`;
          else if (!curVal) await sql`UPDATE books SET likes=likes+1 WHERE id=${bookId}`;
          if (dId) await sql`INSERT INTO reactions (device_id,book_id,value,created_at) VALUES (${dId},${bookId},'like',NOW()) ON CONFLICT (device_id,book_id) DO UPDATE SET value='like',created_at=NOW()`;
        } else {
          if (curVal === 'like') await sql`UPDATE books SET likes=GREATEST(likes-1,0) WHERE id=${bookId}`;
          if (dId) await sql`DELETE FROM reactions WHERE device_id=${dId} AND book_id=${bookId}`;
        }
        const l = await sql`SELECT likes FROM books WHERE id=${bookId} LIMIT 1`;
        return json({ ok: true, likes: l.length ? (l[0].likes as number) : 0 });
      }

      if (url.pathname === '/api/public/notifications' && request.method === 'GET')
        return json(await sql`SELECT id,title,body,COALESCE(NULLIF(CASE WHEN icon IN ('bell','book-open','heart','star','zap','gift','message-circle','megaphone','sparkles','alert-circle','check-circle','info','trending-up','award','download') THEN icon ELSE '' END,''),'bell') AS icon,COALESCE(NULLIF(url,''),'') AS url,created_at FROM notifications WHERE status='sent' ORDER BY created_at DESC LIMIT 20`);

      // --- PBKDF2 Hashing ---
      async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
        const s = salt || crypto.randomUUID().replace(/-/g, '').slice(0, 32);
        const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' } as any, false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(s), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
        const hash = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
        return { hash, salt: s };
      }

      // --- JWT ---
      const JWT_SECRET = 'lekhoni-writer-jwt-secret-2024';
      async function createJWT(payload: Record<string, any>): Promise<string> {
        const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
        const body = btoa(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 }));
        const data = `${header}.${body}`;
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
        return `${data}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;
      }
      async function verifyJWT(token: string): Promise<Record<string, any> | null> {
        try {
          const [h, b, s] = token.split('.');
          const data = `${h}.${b}`;
          const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
          const sig = Uint8Array.from(atob(s), c => c.charCodeAt(0));
          const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(data));
          if (!valid) return null;
          const payload = JSON.parse(atob(b));
          if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
          return payload;
        } catch { return null; }
      }

      // --- Writer Signup ---
      if (url.pathname === '/api/public/writers/signup' && request.method === 'POST') {
        const b = await request.json() as { username?: string; writer_name?: string; email?: string; password?: string };
        if (!b.username || !b.writer_name || !b.email || !b.password) return json({ error: 'All fields required' }, 400);
        if (b.password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
        const uname = b.username.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
        if (!uname) return json({ error: 'Invalid username' }, 400);
        const { hash, salt } = await hashPassword(b.password);
        try {
          const r = await sql`INSERT INTO writers (username,writer_name,email,password_hash,salt) VALUES (${uname},${b.writer_name},${b.email.toLowerCase()},${hash},${salt}) RETURNING id,username,writer_name,email,created_at`;
          const token = await createJWT({ id: r[0].id, username: r[0].username });
          return json({ writer: r[0], token }, 201);
        } catch (e: any) {
          if (e.message?.includes('writers_username')) return json({ error: 'Username already taken' }, 409);
          if (e.message?.includes('writers_email')) return json({ error: 'Email already registered' }, 409);
          if (e.message?.includes('unique')) return json({ error: 'Username or email already exists' }, 409);
          throw e;
        }
      }

      // --- Writer Login (email or username) ---
      if (url.pathname === '/api/public/writers/login' && request.method === 'POST') {
        const b = await request.json() as { email_or_username?: string; password?: string };
        if (!b.email_or_username || !b.password) return json({ error: 'Email/username and password required' }, 400);
        const ident = b.email_or_username.trim().toLowerCase();
        const r = await sql`SELECT id,username,writer_name,email,bio,avatar_url,follower_count,salt,password_hash,created_at FROM writers WHERE (email=${ident} OR username=${ident}) AND is_active=true`;
        if (!r.length) return json({ error: 'Invalid credentials' }, 401);
        const { hash } = await hashPassword(b.password, r[0].salt);
        if (hash !== r[0].password_hash) return json({ error: 'Invalid credentials' }, 401);
        const token = await createJWT({ id: r[0].id, username: r[0].username });
        const { salt: _, password_hash: __, ...writer } = r[0];
        return json({ writer, token });
      }

      // --- Writer Verify Token ---
      if (url.pathname === '/api/public/writers/verify' && request.method === 'POST') {
        const b = await request.json() as { token?: string };
        if (!b.token) return json({ error: 'Token required' }, 400);
        const payload = await verifyJWT(b.token);
        if (!payload?.id) return json({ error: 'Invalid token' }, 401);
        const r = await sql`SELECT id,username,writer_name,bio,avatar_url,follower_count,created_at FROM writers WHERE id=${payload.id} AND is_active=true`;
        if (!r.length) return json({ error: 'Writer not found' }, 404);
        return json({ writer: r[0] });
      }

      // --- Public Writers List ---
      if (url.pathname === '/api/public/writers' && request.method === 'GET')
        return json(await sql`SELECT id,username,writer_name,bio,avatar_url,follower_count,created_at FROM writers WHERE is_active=true ORDER BY follower_count DESC,created_at DESC`);

      const writerPubMatch = url.pathname.match(/^\/api\/public\/writers\/([^/]+)$/);
      if (writerPubMatch && request.method === 'GET') {
        if (!uuid(writerPubMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const r = await sql`SELECT id,username,writer_name,bio,avatar_url,follower_count,created_at FROM writers WHERE id=${writerPubMatch[1]} AND is_active=true`;
        if (!r.length) return json({ error: 'Not found' }, 404);
        return json(r[0]);
      }

      // --- Follow/Unfollow ---
      if (url.pathname === '/api/public/follows' && request.method === 'GET') {
        const deviceId = url.searchParams.get('device_id');
        if (!deviceId) return json({ error: 'device_id required' }, 400);
        await sql`INSERT INTO devices (device_key, last_seen_at) VALUES (${deviceId},NOW()) ON CONFLICT (device_key) DO UPDATE SET last_seen_at=NOW()`;
        const dRow = await sql`SELECT id FROM devices WHERE device_key=${deviceId} LIMIT 1`;
        if (!dRow.length) return json({ error: 'Device not found' }, 500);
        const followed = await sql`SELECT w.id,w.username,w.writer_name,w.bio,w.avatar_url,w.follower_count,f.created_at AS followed_at FROM follows f JOIN writers w ON f.writer_id=w.id WHERE f.device_id=${dRow[0].id} AND w.is_active=true ORDER BY f.created_at DESC`;
        return json(followed);
      }
      if (url.pathname === '/api/public/follows' && request.method === 'POST') {
        const b = await request.json() as { device_id?: string; writer_id?: string };
        if (!b.device_id || !b.writer_id) return json({ error: 'device_id and writer_id required' }, 400);
        if (!uuid(b.writer_id)) return json({ error: 'Invalid writer_id' }, 400);
        await sql`INSERT INTO devices (device_key, last_seen_at) VALUES (${b.device_id},NOW()) ON CONFLICT (device_key) DO UPDATE SET last_seen_at=NOW()`;
        const dRow = await sql`SELECT id FROM devices WHERE device_key=${b.device_id} LIMIT 1`;
        if (!dRow.length) return json({ error: 'Device not found' }, 500);
        await sql`INSERT INTO follows (device_id,writer_id) VALUES (${dRow[0].id},${b.writer_id}) ON CONFLICT (device_id,writer_id) DO NOTHING`;
        await sql`UPDATE writers SET follower_count = follower_count + 1 WHERE id=${b.writer_id}`;
        return json({ ok: true }, 201);
      }
      if (url.pathname.startsWith('/api/public/follows/') && request.method === 'DELETE') {
        const writerId = url.pathname.split('/').pop();
        const deviceId = url.searchParams.get('device_id');
        if (!writerId || !deviceId) return json({ error: 'writer_id and device_id required' }, 400);
        const dRow = await sql`SELECT id FROM devices WHERE device_key=${deviceId} LIMIT 1`;
        if (!dRow.length) return json({ ok: true });
        await sql`DELETE FROM follows WHERE device_id=${dRow[0].id} AND writer_id=${writerId}`;
        await sql`UPDATE writers SET follower_count = GREATEST(follower_count - 1, 0) WHERE id=${writerId}`;
        return json({ ok: true });
      }

      // --- Online user settings sync (keyed by device_key) ---
      if (url.pathname === '/api/public/user-state' && request.method === 'GET') {
        const deviceKey = url.searchParams.get('device_key');
        if (!deviceKey) return json({ error: 'device_key required' }, 400);
        const uptime = await sql`SELECT settings,favorites,downloads,history,positions,bookmarks,updated_at FROM user_state WHERE device_key=${deviceKey} LIMIT 1`;
        if (!uptime.length) return json({ synced: false });
        return json({ synced: true, state: uptime[0] });
      }
      if (url.pathname === '/api/public/user-state' && request.method === 'PUT') {
        const b = await request.json() as { device_key?: string; settings?: unknown; favorites?: string[]; downloads?: string[]; history?: string[]; positions?: Record<string, number>; bookmarks?: unknown[] };
        if (!b.device_key) return json({ error: 'device_key required' }, 400);
        const cur = await sql`SELECT settings,favorites,downloads,history,positions,bookmarks FROM user_state WHERE device_key=${b.device_key} LIMIT 1`;
        const s = cur[0] || {};
        const merge = (curVal: unknown, newVal: unknown) => (newVal === undefined ? curVal ?? null : newVal);
        await sql`INSERT INTO user_state (device_key,settings,favorites,downloads,history,positions,bookmarks,updated_at) VALUES (${b.device_key},
                ${JSON.stringify(merge(s.settings, b.settings))},
                ${JSON.stringify(merge(s.favorites, b.favorites))},
                ${JSON.stringify(merge(s.downloads, b.downloads))},
                ${JSON.stringify(merge(s.history, b.history))},
                ${JSON.stringify(merge(s.positions, b.positions))},
                ${JSON.stringify(merge(s.bookmarks, b.bookmarks))},
                NOW())
           ON CONFLICT (device_key) DO UPDATE SET
                settings=EXCLUDED.settings, favorites=EXCLUDED.favorites, downloads=EXCLUDED.downloads,
                history=EXCLUDED.history, positions=EXCLUDED.positions, bookmarks=EXCLUDED.bookmarks,
                updated_at=NOW()`;
        return json({ ok: true });
      }

      // ==================== WRITER AUTHENTICATED ROUTES ====================
      // All /api/writer/* routes require JWT
      if (url.pathname.startsWith('/api/writer/')) {
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '');
        if (!token) return json({ error: 'Unauthorized' }, 401);
        const payload = await verifyJWT(token);
        if (!payload?.id) return json({ error: 'Invalid token' }, 401);
        const writerId = payload.id;

        // --- Writer Dashboard Stats ---
        if (url.pathname === '/api/writer/stats' && request.method === 'GET') {
          const [storyCount, totalViews, followerCount, recentActivity] = await Promise.all([
            sql`SELECT COUNT(*)::int AS n FROM stories WHERE writer_id=${writerId}`,
            sql`SELECT COALESCE(SUM(views),0)::int AS n FROM stories WHERE writer_id=${writerId}`,
            sql`SELECT COUNT(*)::int AS n FROM follows WHERE writer_id=${writerId}`,
            sql`SELECT id,type,data,created_at FROM writer_activities WHERE writer_id=${writerId} ORDER BY created_at DESC LIMIT 10`,
          ]);
          return json({
            stories: storyCount[0].n,
            views: totalViews[0].n,
            followers: followerCount[0].n,
            activities: recentActivity,
          });
        }

        // --- Writer Stories CRUD ---
        if (url.pathname === '/api/writer/stories' && request.method === 'GET') {
          const stories = await sql`SELECT id,title,description,status,cover_url,category,views,likes,chapters_count,created_at,updated_at FROM stories WHERE writer_id=${writerId} ORDER BY updated_at DESC`;
          return json(stories);
        }
        if (url.pathname === '/api/writer/stories' && request.method === 'POST') {
          const b = await request.json() as { title?: string; description?: string; category?: string; cover_url?: string };
          if (!b.title) return json({ error: 'Title required' }, 400);
          const r = await sql`INSERT INTO stories (writer_id,title,description,category,cover_url) VALUES (${writerId},${b.title},${b.description||''},${b.category||''},${b.cover_url||null}) RETURNING id,title,status,created_at`;
          await sql`INSERT INTO writer_activities (writer_id,type,data) VALUES (${writerId},'story_created',${JSON.stringify({ story_id: r[0].id, title: b.title })}::jsonb)`;
          return json(r[0], 201);
        }

        const storyMatch = url.pathname.match(/^\/api\/writer\/stories\/([^/]+)$/);
        if (storyMatch) {
          const storyId = storyMatch[1];
          // Verify ownership
          const owned = await sql`SELECT id FROM stories WHERE id=${storyId} AND writer_id=${writerId}`;
          if (!owned.length) return json({ error: 'Not found' }, 404);

          if (request.method === 'GET') {
            const story = await sql`SELECT id,title,description,status,cover_url,category,views,likes,chapters_count,created_at,updated_at FROM stories WHERE id=${storyId}`;
            if (story.length && story[0].status === 'published') {
              try {
                const stRow4 = await sql`SELECT w.writer_name,s.title FROM stories s JOIN writers w ON s.writer_id=w.id WHERE s.id=${storyId}`;
                const bkRow4 = await sql`SELECT id FROM books WHERE title=${stRow4[0].title} AND author=${stRow4[0].writer_name} LIMIT 1`;
                if (bkRow4.length) {
                  const allChs = await sql`SELECT title,body,position,minutes FROM story_chapters WHERE story_id=${storyId} ORDER BY position`;
                  const exist4 = await sql`SELECT title FROM chapters WHERE book_id=${bkRow4[0].id}`;
                  const have4 = new Set(exist4.map((e: any) => (e.title || '').trim()));
                  for (const c of allChs) { if (have4.has((c.title || '').trim())) continue; await sql`INSERT INTO chapters (book_id,title,body,position,status,minutes) VALUES (${bkRow4[0].id},${c.title},${c.body||''},${c.position},'published',${c.minutes||5})`; }
                }
              } catch (e) { console.error('story chapter backfill failed', e); }
            }
            const chapters = await sql`SELECT id,title,body,position,minutes,created_at FROM story_chapters WHERE story_id=${storyId} ORDER BY position`;
            return json({ ...story[0], chapters });
          }
          if (request.method === 'PUT') {
            const b = await request.json() as { title?: string; description?: string; status?: string; category?: string };
            await sql`UPDATE stories SET title=COALESCE(${b.title},title),description=COALESCE(${b.description},description),status=COALESCE(${b.status},status),category=COALESCE(${b.category},category),updated_at=NOW() WHERE id=${storyId}`;
            if (b.status === 'published') {
              await sql`INSERT INTO writer_activities (writer_id,type,data) VALUES (${writerId},'story_published',${JSON.stringify({ story_id: storyId, title: b.title || '' })}::jsonb)`;
            }
            return json({ ok: true });
          }
          if (request.method === 'DELETE') {
            await sql`DELETE FROM story_chapters WHERE story_id=${storyId}`;
            await sql`DELETE FROM stories WHERE id=${storyId}`;
            return json({ ok: true });
          }
        }

        // --- Story Chapters ---
        const chMatch = url.pathname.match(/^\/api\/writer\/stories\/([^/]+)\/chapters$/);
        if (chMatch) {
          const storyId = chMatch[1];
          const owned = await sql`SELECT id FROM stories WHERE id=${storyId} AND writer_id=${writerId}`;
          if (!owned.length) return json({ error: 'Not found' }, 404);

          if (request.method === 'GET') {
            const chapters = await sql`SELECT id,title,body,position,minutes,created_at FROM story_chapters WHERE story_id=${storyId} ORDER BY position`;
            return json(chapters);
          }
          if (request.method === 'POST') {
            const b = await request.json() as { title?: string; body?: string; position?: number };
            if (!b.title) return json({ error: 'Title required' }, 400);
            const pos = b.position ?? (await sql`SELECT COALESCE(MAX(position),0)+1 AS n FROM story_chapters WHERE story_id=${storyId}`)[0].n;
            const r = await sql`INSERT INTO story_chapters (story_id,title,body,position) VALUES (${storyId},${b.title},${b.body||''},${pos}) RETURNING id,title,position,created_at`;
            await sql`UPDATE stories SET chapters_count = (SELECT COUNT(*)::int FROM story_chapters WHERE story_id=${storyId}), updated_at=NOW() WHERE id=${storyId}`;
            const stRow = await sql`SELECT st.status,w.writer_name,st.title FROM stories st JOIN writers w ON st.writer_id=w.id WHERE st.id=${storyId}`;
            if (stRow.length && stRow[0].status === 'published') {
              const bkRow = await sql`SELECT id FROM books WHERE title=${stRow[0].title} AND author=${stRow[0].writer_name} LIMIT 1`;
              if (bkRow.length) await sql`INSERT INTO chapters (book_id,title,body,position,status,minutes) VALUES (${bkRow[0].id},${b.title},${b.body||''},${pos},'published',5)`;
            }
            return json(r[0], 201);
          }
        }

        // --- Single Chapter Update/Delete ---
        const chSingleMatch = url.pathname.match(/^\/api\/writer\/stories\/([^/]+)\/chapters\/([^/]+)$/);
        if (chSingleMatch) {
          const storyId = chSingleMatch[1];
          const chapterId = chSingleMatch[2];
          const owned = await sql`SELECT id FROM stories WHERE id=${storyId} AND writer_id=${writerId}`;
          if (!owned.length) return json({ error: 'Not found' }, 404);

          if (request.method === 'PUT') {
            const b = await request.json() as { title?: string; body?: string; position?: number };
            await sql`UPDATE story_chapters SET title=COALESCE(${b.title},title),body=COALESCE(${b.body},body),position=COALESCE(${b.position},position) WHERE id=${chapterId} AND story_id=${storyId}`;
            if (b.title || b.body || b.position) {
              const stRow2 = await sql`SELECT st.status,w.writer_name,st.title FROM stories st JOIN writers w ON st.writer_id=w.id WHERE st.id=${storyId}`;
              if (stRow2.length && stRow2[0].status === 'published') {
                const bkRow2 = await sql`SELECT id FROM books WHERE title=${stRow2[0].title} AND author=${stRow2[0].writer_name} LIMIT 1`;
                if (bkRow2.length) await sql`UPDATE chapters ch SET title=COALESCE(${b.title},ch.title),body=COALESCE(${b.body},ch.body),position=COALESCE(${b.position},ch.position) WHERE ch.book_id=${bkRow2[0].id} AND ch.title=(SELECT title FROM story_chapters WHERE id=${chapterId} AND story_id=${storyId})`;
              }
            }
            return json({ ok: true });
          }
          if (request.method === 'DELETE') {
            const delTitle = (await sql`SELECT title FROM story_chapters WHERE id=${chapterId} AND story_id=${storyId}`)[0]?.title;
            await sql`DELETE FROM story_chapters WHERE id=${chapterId} AND story_id=${storyId}`;
            await sql`UPDATE stories SET chapters_count = (SELECT COUNT(*)::int FROM story_chapters WHERE story_id=${storyId}), updated_at=NOW() WHERE id=${storyId}`;
            const stRow3 = await sql`SELECT st.status,w.writer_name,st.title FROM stories st JOIN writers w ON st.writer_id=w.id WHERE st.id=${storyId}`;
            if (stRow3.length && stRow3[0].status === 'published') {
              const bkRow3 = await sql`SELECT id FROM books WHERE title=${stRow3[0].title} AND author=${stRow3[0].writer_name} LIMIT 1`;
              if (bkRow3.length && delTitle) await sql`DELETE FROM chapters WHERE book_id=${bkRow3[0].id} AND title=${delTitle}`;
            }
            return json({ ok: true });
          }
        }

        // --- Writer Profile ---
        if (url.pathname === '/api/writer/profile' && request.method === 'GET') {
          const r = await sql`SELECT id,username,writer_name,email,bio,avatar_url,follower_count,created_at FROM writers WHERE id=${writerId}`;
          return json(r[0] || null);
        }
        if (url.pathname === '/api/writer/profile' && request.method === 'PUT') {
          const b = await request.json() as { writer_name?: string; bio?: string; avatar_url?: string; username?: string };
          if (b.username) {
            const existing = await sql`SELECT id FROM writers WHERE username=${b.username} AND id!=${writerId}`;
            if (existing.length) return json({ error: 'Username already taken' }, 409);
          }
          await sql`UPDATE writers SET username=COALESCE(${b.username},username),writer_name=COALESCE(${b.writer_name},writer_name),bio=COALESCE(${b.bio},bio),avatar_url=COALESCE(${b.avatar_url},avatar_url) WHERE id=${writerId}`;
          return json({ ok: true });
        }

        // --- Writer Image Upload ---
        if (url.pathname === '/api/writer/upload' && request.method === 'POST') {
          const form = await request.formData();
          const file = form.get('file');
          if (!(file instanceof File)) return json({ error: 'Image required' }, 400);
          if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) return json({ error: 'Only images up to 10MB' }, 400);
          const ext = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'webp';
          const key = `writers/${writerId}/${crypto.randomUUID()}.${ext}`;
          await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
          return json({ url: `${env.MEDIA_PUBLIC_URL}/${key}` }, 201);
        }

        // --- Writer Notifications ---
        if (url.pathname === '/api/writer/notifications' && request.method === 'GET') {
          const r = await sql`SELECT id,title,body,type,story_id,is_read,url,created_at FROM writer_notifications WHERE writer_id=${writerId} ORDER BY created_at DESC LIMIT 50`;
          return json(r);
        }
        if (url.pathname === '/api/writer/notifications/read' && request.method === 'POST') {
          const b = await request.json() as { ids?: string[] };
          if (b.ids?.length) await sql`UPDATE writer_notifications SET is_read=true WHERE writer_id=${writerId} AND id = ANY(${b.ids})`;
          else await sql`UPDATE writer_notifications SET is_read=true WHERE writer_id=${writerId}`;
          return json({ ok: true });
        }
        const wnMatch = url.pathname.match(/^\/api\/writer\/notifications\/([^/]+)$/);
        if (wnMatch && request.method === 'DELETE') {
          await sql`DELETE FROM writer_notifications WHERE id=${wnMatch[1]} AND writer_id=${writerId}`;
          return json({ ok: true });
        }

        // --- Submit Story for Review ---
        const storySubmitMatch = url.pathname.match(/^\/api\/writer\/stories\/([^/]+)\/submit$/);
        if (storySubmitMatch && request.method === 'POST') {
          if (!uuid(storySubmitMatch[1])) return json({ error: 'Invalid ID' }, 400);
          const s = await sql`SELECT id,title,writer_id FROM stories WHERE id=${storySubmitMatch[1]} AND writer_id=${writerId}`;
          if (!s.length) return json({ error: 'Not found' }, 404);
          await sql`UPDATE stories SET status='pending',updated_at=NOW() WHERE id=${storySubmitMatch[1]}`;
          return json({ ok: true, status: 'pending' });
        }

        // --- Writer Dashboard Stats ---
        if (url.pathname === '/api/writer/dashboard' && request.method === 'GET') {
          const [storyCount, totalViews, followerCount, publishedCount, pendingCount] = await Promise.all([
            sql`SELECT COUNT(*)::int AS n FROM stories WHERE writer_id=${writerId}`,
            sql`SELECT COALESCE(SUM(views),0)::int AS n FROM stories WHERE writer_id=${writerId}`,
            sql`SELECT COUNT(*)::int AS n FROM follows WHERE writer_id=${writerId}`,
            sql`SELECT COUNT(*)::int AS n FROM stories WHERE writer_id=${writerId} AND status='published'`,
            sql`SELECT COUNT(*)::int AS n FROM stories WHERE writer_id=${writerId} AND status='pending'`,
          ]);
          const recent = await sql`SELECT id,title,status,views,created_at,updated_at FROM stories WHERE writer_id=${writerId} ORDER BY updated_at DESC LIMIT 5`;
          const activities = await sql`SELECT id,type,data,created_at FROM writer_activities WHERE writer_id=${writerId} ORDER BY created_at DESC LIMIT 10`;
          return json({
            stories: storyCount[0].n, totalViews: totalViews[0].n, followers: followerCount[0].n,
            published: publishedCount[0].n, pending: pendingCount[0].n,
            recent, activities
          });
        }

        return json({ error: 'Not found' }, 404);
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) { return json({ error: error instanceof Error ? error.message : 'Request failed' }, 500); }
  }
};
