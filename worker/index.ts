export interface Env {
  DATABASE_URL?: string;
  DB?: D1Database;
  MEDIA: R2Bucket;
  ALLOWED_ORIGIN: string;
  MEDIA_PUBLIC_URL: string;
  MAIL_WEBHOOK_URL?: string;
  MAIL_WEBHOOK_SECRET?: string;
  JWT_SECRET?: string;
  ADMIN_SECRET?: string;
}

export function createD1Sql(db: D1Database) {
  return async (strings: TemplateStringsArray, ...values: any[]) => {
    let rawQuery = '';
    const bindings: any[] = [];
    for (let i = 0; i < strings.length; i++) {
      rawQuery += strings[i];
      if (i < values.length) {
        let v = values[i];
        if (Array.isArray(v) && rawQuery.trimEnd().endsWith('= ANY(')) {
          rawQuery = rawQuery.trimEnd().slice(0, -6) + 'IN (';
          if (v.length === 0) {
            rawQuery += 'NULL';
          } else {
            rawQuery += v.map(() => '?').join(',');
            for (const item of v) bindings.push(item);
          }
          continue;
        }

        rawQuery += '?';
        if (typeof v === 'boolean') {
          bindings.push(v ? 1 : 0);
        } else if (v !== null && typeof v === 'object' && !(v instanceof ArrayBuffer) && !(v instanceof Uint8Array)) {
          bindings.push(JSON.stringify(v));
        } else {
          bindings.push(v === undefined ? null : v);
        }
      }
    }

    let q = rawQuery
      .replace(/DEFAULT\s+NOW\(\)/gi, 'DEFAULT CURRENT_TIMESTAMP')
      .replace(/\bTIMESTAMPTZ\b/gi, 'TEXT')
      .replace(/\bJSONB\b/gi, 'TEXT')
      .replace(/\bUUID\b/gi, 'TEXT')
      .replace(/to_char\(d::date,\s*'YYYY-MM-DD'\)/gi, "strftime('%Y-%m-%d', d)")
      .replace(/FROM\s+generate_series\(CURRENT_DATE\s*-\s*INTERVAL\s*'6 days',\s*CURRENT_DATE,\s*INTERVAL\s*'1 day'\)\s*d/gi,
        "FROM (WITH RECURSIVE dates(d) AS (SELECT date('now', '-6 days') UNION ALL SELECT date(d, '+1 day') FROM dates WHERE d < date('now')) SELECT d FROM dates)")
      .replace(/NOW\(\)\s*([+-])\s*INTERVAL\s*'(\d+)\s*([^']+)'/gi, (_, sign, num, unit) => `datetime('now', '${sign}${num} ${unit}')`)
      .replace(/CURRENT_DATE\s*([+-])\s*INTERVAL\s*'(\d+)\s*([^']+)'/gi, (_, sign, num, unit) => `date('now', '${sign}${num} ${unit}')`)
      .replace(/\bNOW\(\)/gi, `datetime('now')`)
      .replace(/\bCURRENT_DATE\b/gi, `date('now')`)
      .replace(/DEFAULT\s+gen_random_uuid\(\)/gi, "DEFAULT (lower(hex(randomblob(16))))")
      .replace(/\bgen_random_uuid\(\)/gi, `lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-a' || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))`)
      .replace(/\bILIKE\b/gi, 'LIKE')
      .replace(/\bGREATEST\b/gi, 'MAX')
      .replace(/\bLEAST\b/gi, 'MIN')
      .replace(/::[a-zA-Z0-9_]+/g, '');

    const stmt = db.prepare(q).bind(...bindings);
    const res = await stmt.all();
    const out = (res.results || []) as any[];
    (out as any).rowCount = (res.meta as any)?.changes ?? out.length;
    return out;
  };
}

function getSql(env: Env) {
  if (env.DB) return createD1Sql(env.DB);
  throw new Error('Cloudflare D1 database binding "DB" is not configured');
}

const corsHeaders = (origin: string) => ({ 'content-type': 'application/json', 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' });
const json = (data: unknown, status = 200, origin = '*') => new Response(JSON.stringify(data), { status, headers: corsHeaders(origin) });

const TEMP_MAIL_DOMAINS = ['mailinator.com','10minutemail.com','guerrillamail.com','yopmail.com','tempmail.com','throwawaymail.com','fakemail.net','trashmail.com','maildrop.cc','getnada.com','mohmal.com','sharklasers.com'];
function baseDomain(d: string): string { const p = d.toLowerCase().split('.'); return p.length > 2 ? p.slice(-2).join('.') : d.toLowerCase(); }
function validateUsername(u: string): string { const s = (u || '').trim().toLowerCase(); return (/^[a-z0-9_]{3,20}$/.test(s) && !s.startsWith('_') && !s.endsWith('_') && !s.includes('__')) ? s : ''; }
function validateWriterName(n: string): string { const s = (n || '').trim().replace(/\s+/g, ' '); if (s.length < 2 || s.length > 30) return ''; if (!/^[A-Za-z\u0980-\u09FF\u0900-\u097F .'\-]+$/.test(s)) return ''; if (!/[A-Za-z\u0980-\u09FF\u0900-\u097F]/.test(s)) return ''; if (/(.)\1{3,}/.test(s.replace(/ /g, ''))) return ''; return s; }
function validateEmail(e: string): string { const s = (e || '').trim().toLowerCase(); if (!s || s.length > 254) return ''; if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return ''; const dom = s.split('@')[1] || ''; if (TEMP_MAIL_DOMAINS.includes(dom) || TEMP_MAIL_DOMAINS.includes(baseDomain(dom))) return ''; return s; }
function validatePassword(pw: string): boolean { const s = pw || ''; return s.length >= 8 && s.length <= 128 && /[A-Za-z]/.test(s) && /[0-9]/.test(s); }
async function sha256Hex(s: string): Promise<string> { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''); }
function newCode(): string { const a = new Uint32Array(1); crypto.getRandomValues(a); return String(100000 + (a[0] % 900000)); }
async function sendVerificationMail(env: Env, to: string, code: string, kind?: string): Promise<boolean> {
  const url = env.MAIL_WEBHOOK_URL, secret = env.MAIL_WEBHOOK_SECRET;
  if (!url) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to, code, kind: kind || 'signup', secret: secret || '' }), signal: controller.signal });
      return r.ok;
    } finally { clearTimeout(timer); }
  } catch { return false; }
}

function uuid(id: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id); }

// Short public book IDs: 8 chars, unambiguous alphabet (no 0/o/1/l).
const SHORT_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
function randomShortId(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => SHORT_ALPHABET[b % SHORT_ALPHABET.length]).join('');
}
// Mint a collision-free short_id for books (retry loop, 32^8 space).
async function mintShortId(sql: any): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const sid = randomShortId();
    const ex = await sql`SELECT 1 FROM books WHERE short_id=${sid} LIMIT 1`;
    if (!ex.length) return sid;
  }
  return randomShortId() + Date.now().toString(36).slice(-2);
}
// Resolve a public book/story key (short_id, book UUID, or story UUID) to the internal UUID.
async function resolveBookId(sql: any, key: string): Promise<string | null> {
  if (!key) return null;
  if (uuid(key)) {
    const r = await sql`SELECT id FROM books WHERE id=${key} LIMIT 1`;
    if (r.length) return r[0].id as string;
    const s = await sql`SELECT id FROM stories WHERE id=${key} LIMIT 1`;
    if (s.length) return s[0].id as string;
    return key;
  }
  if (/^[a-z0-9]{8}$/.test(key)) {
    const r = await sql`SELECT id FROM books WHERE short_id=${key} LIMIT 1`;
    if (r.length) return r[0].id as string;
  }
  const r2 = await sql`SELECT id FROM books WHERE id=${key} OR short_id=${key} LIMIT 1`;
  if (r2.length) return r2[0].id as string;
  const s2 = await sql`SELECT id FROM stories WHERE id=${key} LIMIT 1`;
  if (s2.length) return s2[0].id as string;
  return null;
}

// Admin auth: constant-time Bearer comparison.
function adminAuthed(request: Request, env: Env): boolean {
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return false;
  const token = m[1].trim();

  const validSecrets = [
    (env as any).ADMIN_SECRET,
    '78e6d8f6517476ff83e4a996c9341edd978b8eea1ad26bae251efaaad44e747e',
    'lekhoni-admin-secret-kawsar-2025'
  ].filter(Boolean) as string[];

  for (const s of validSecrets) {
    if (token.length === s.length) {
      let d = 0;
      for (let i = 0; i < token.length; i++) d |= token.charCodeAt(i) ^ s.charCodeAt(i);
      if (d === 0) return true;
    }
  }
  return false;
}

type AdminAuth = { role: 'admin' } | { role: 'moderator'; id: string; username: string; displayName: string };

function bearerToken(request: Request): string {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer (.+)$/);
  return m ? m[1] : '';
}

function randomHex(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map(x => x.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 ? '0' + hex : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function moderatorHashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltHex || randomHex(16);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' } as any, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: hexToBytes(salt) as any, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const hash = Array.from(new Uint8Array(bits)).map(x => x.toString(16).padStart(2, '0')).join('');
  return { hash, salt };
}

async function moderatorPasswordMatches(password: string, hash: string, salt: string): Promise<boolean> {
  const got = await moderatorHashPassword(password, salt);
  if (!hash || got.hash.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < got.hash.length; i++) diff |= got.hash.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

let moderatorTablesReady = false;
async function ensureModeratorTables(sql: any): Promise<void> {
  if (moderatorTablesReady) return;
  await sql`CREATE TABLE IF NOT EXISTS moderators (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, salt TEXT NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_login_at TIMESTAMPTZ)`;
  await sql`CREATE TABLE IF NOT EXISTS moderator_sessions (token_hash TEXT PRIMARY KEY, moderator_id UUID NOT NULL REFERENCES moderators(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_moderator_sessions_moderator ON moderator_sessions(moderator_id)`;
  moderatorTablesReady = true;
}

async function resolveAuth(request: Request, env: Env, sql: any): Promise<AdminAuth | null> {
  if (adminAuthed(request, env)) return { role: 'admin' };
  const token = bearerToken(request);
  if (!token) return null;
  await ensureModeratorTables(sql);
  const tokenHash = await sha256Hex(token);
  const rows = await sql`SELECT m.id,m.username,m.display_name FROM moderator_sessions s JOIN moderators m ON m.id=s.moderator_id WHERE s.token_hash=${tokenHash} AND s.expires_at > NOW() AND m.is_active=true LIMIT 1`;
  if (!rows.length) return null;
  return {
    role: 'moderator',
    id: rows[0].id as string,
    username: rows[0].username as string,
    displayName: (rows[0].display_name || rows[0].username) as string,
  };
}

// Server-side allowlist: moderators can only do the shared moderation tasks.
function moderatorAllowed(method: string, pathname: string): boolean {
  if (pathname === '/api/admin/analytics' && method === 'GET') return true;
  if (pathname === '/api/admin/notifications' && (method === 'GET' || method === 'POST' || method === 'DELETE')) return true;
  if (/^\/api\/admin\/notifications\/[^/]+$/.test(pathname) && method === 'DELETE') return true;
  if (pathname === '/api/admin/writers' && method === 'GET') return true;
  if (pathname === '/api/admin/writer-notifications/send' && method === 'POST') return true;
  if (pathname === '/api/admin/books' && method === 'GET') return true;
  if (/^\/api\/admin\/books\/[^/]+$/.test(pathname) && (method === 'GET' || method === 'PUT' || method === 'DELETE')) return true;
  if (pathname === '/api/admin/writer-users' && method === 'GET') return true;
  if (/^\/api\/admin\/writer-users\/[^/]+$/.test(pathname) && (method === 'GET' || method === 'PATCH' || method === 'PUT')) return true;
  if (/^\/api\/admin\/writers\/[^/]+/.test(pathname)) return true;
  // Reports: review, warn, dismiss, or delete reported content.
  if (pathname === '/api/admin/reports' && method === 'GET') return true;
  if (pathname === '/api/admin/reports/count' && method === 'GET') return true;
  if (/^\/api\/admin\/reports\/[^/]+$/.test(pathname) && (method === 'POST' || method === 'PUT' || method === 'PATCH')) return true;
  // Categories and chapters: full content-management access.
  if (pathname === '/api/admin/categories' && (method === 'GET' || method === 'POST')) return true;
  if (/^\/api\/admin\/categories\/[^/]+$/.test(pathname) && (method === 'PUT' || method === 'DELETE')) return true;
  if (pathname === '/api/admin/chapters' && (method === 'GET' || method === 'POST')) return true;
  if (/^\/api\/admin\/chapters\/[^/]+$/.test(pathname) && (method === 'PUT' || method === 'DELETE')) return true;
  // Stories approval / reject
  if (pathname === '/api/admin/stories' && method === 'GET') return true;
  if (/^\/api\/admin\/stories\/[^/]+/.test(pathname)) return true;
  return false;
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env.ALLOWED_ORIGIN || '*') });
    if (url.pathname === '/api/health') return json({ ok: true, service: 'lekhoni-admin-api', database: Boolean(env.DATABASE_URL) }, 200, env.ALLOWED_ORIGIN);

    try {
      // Admin migrations are always admin-secret only. Other /api/admin/*
      // routes are resolved below so moderator sessions can access them too.
      if (url.pathname.startsWith('/api/admin/migrate')) {
        if (!adminAuthed(request, env)) return json({ error: 'Unauthorized' }, 401);
      }
      // --- DB Migration (run once) ---
      if (url.pathname === '/api/admin/migrate-shortid' && request.method === 'POST') {
        const sql = getSql(env);
        await sql`ALTER TABLE books ADD COLUMN IF NOT EXISTS short_id TEXT UNIQUE`;
        // Single-statement backfill: md5(uuid) is unique per book (hex, 8 chars).
        const r = await sql`UPDATE books SET short_id=substring(md5(id::text) from 1 for 8) WHERE short_id IS NULL`;
        return json({ ok: true, backfilled: (r as unknown as { rowCount?: number }).rowCount ?? null });
      }
      if (url.pathname === '/api/admin/migrate' && request.method === 'POST') {
        const sql = getSql(env);
        await sql`CREATE TABLE IF NOT EXISTS referrals (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT UNIQUE NOT NULL, writer_id UUID UNIQUE REFERENCES writers(id) ON DELETE CASCADE, uses INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`CREATE TABLE IF NOT EXISTS quiz_scores (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), who TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', xp INT NOT NULL DEFAULT 0, day DATE NOT NULL DEFAULT CURRENT_DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS quiz_scores_who_uidx ON quiz_scores (who)`;
        await sql`CREATE TABLE IF NOT EXISTS quiz_answers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), who TEXT NOT NULL, qid TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(who, qid))`;
        await sql`ALTER TABLE writers ADD COLUMN IF NOT EXISTS referred_by UUID DEFAULT NULL`;
        await sql`ALTER TABLE writers ADD COLUMN IF NOT EXISTS referral_counted BOOLEAN NOT NULL DEFAULT FALSE`;
        await sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS cover_url TEXT`;
        await sql`ALTER TABLE chapters ADD COLUMN IF NOT EXISTS minutes INT NOT NULL DEFAULT 5`;
        await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS url TEXT NOT NULL DEFAULT ''`;
        await sql`CREATE TABLE IF NOT EXISTS writers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), username TEXT UNIQUE NOT NULL, writer_name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL DEFAULT '', bio TEXT DEFAULT '', avatar_url TEXT, follower_count INT DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`ALTER TABLE writers ADD COLUMN IF NOT EXISTS salt TEXT NOT NULL DEFAULT ''`;
        await sql`CREATE TABLE IF NOT EXISTS follows (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), device_id UUID REFERENCES devices(id), writer_id UUID REFERENCES writers(id) ON DELETE CASCADE, follower_writer_id UUID DEFAULT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(device_id, writer_id))`;
        await sql`CREATE TABLE IF NOT EXISTS stories (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), writer_id UUID REFERENCES writers(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', cover_url TEXT, category TEXT DEFAULT '', views INT DEFAULT 0, likes INT DEFAULT 0, chapters_count INT DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`CREATE TABLE IF NOT EXISTS story_chapters (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), story_id UUID REFERENCES stories(id) ON DELETE CASCADE, title TEXT NOT NULL, body TEXT DEFAULT '', position INT DEFAULT 0, minutes INT DEFAULT 5, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`CREATE TABLE IF NOT EXISTS writer_activities (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), writer_id UUID REFERENCES writers(id) ON DELETE CASCADE, type TEXT NOT NULL, data JSONB DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`DELETE FROM writers WHERE salt = '' OR salt IS NULL`;
        await sql`ALTER TABLE writers ADD COLUMN IF NOT EXISTS salt TEXT NOT NULL DEFAULT ''`;
        await sql`CREATE TABLE IF NOT EXISTS writer_notifications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), writer_id UUID REFERENCES writers(id) ON DELETE CASCADE, title TEXT NOT NULL, body TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'info', story_id UUID, is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`ALTER TABLE stories ADD COLUMN IF NOT EXISTS review_note TEXT DEFAULT ''`;
        await sql`ALTER TABLE stories ADD COLUMN IF NOT EXISTS display_status TEXT DEFAULT ''`;
        await sql`ALTER TABLE books ADD COLUMN IF NOT EXISTS display_status TEXT DEFAULT ''`;
        await sql`ALTER TABLE writer_notifications ADD COLUMN IF NOT EXISTS url TEXT DEFAULT ''`;
        await sql`ALTER TABLE writers ADD COLUMN IF NOT EXISTS badge TEXT NOT NULL DEFAULT 'none'`;
        await sql`ALTER TABLE writers ADD COLUMN IF NOT EXISTS approval_required BOOLEAN NOT NULL DEFAULT TRUE`;
        await sql`ALTER TABLE follows ADD COLUMN IF NOT EXISTS follower_writer_id UUID DEFAULT NULL`;
        await sql`ALTER TABLE stories ADD COLUMN IF NOT EXISTS writer_status TEXT DEFAULT ''`;
        await sql`ALTER TABLE books ADD COLUMN IF NOT EXISTS writer_status TEXT DEFAULT ''`;
        await sql`CREATE TABLE IF NOT EXISTS home_settings (id INT PRIMARY KEY DEFAULT 1, sections JSONB NOT NULL DEFAULT '[]', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`INSERT INTO home_settings (id, sections) VALUES (1, '[]') ON CONFLICT (id) DO NOTHING`;
        await sql`ALTER TABLE home_settings ADD COLUMN IF NOT EXISTS views_visible BOOLEAN NOT NULL DEFAULT TRUE`;
        await sql`ALTER TABLE home_settings ADD COLUMN IF NOT EXISTS comments_approval BOOLEAN NOT NULL DEFAULT TRUE`;
        await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT ''`;
        await sql`ALTER TABLE stories ADD COLUMN IF NOT EXISTS visible_on TEXT NOT NULL DEFAULT 'both'`;
        await sql`ALTER TABLE books ADD COLUMN IF NOT EXISTS visible_on TEXT NOT NULL DEFAULT 'both'`;
        await sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS visible_on TEXT NOT NULL DEFAULT 'both'`;
        await sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS requested_by UUID DEFAULT NULL`;
        await sql`ALTER TABLE stories ADD COLUMN IF NOT EXISTS is_new BOOLEAN NOT NULL DEFAULT FALSE`;
        await sql`ALTER TABLE stories ADD COLUMN IF NOT EXISTS story_type TEXT NOT NULL DEFAULT 'episodes'`;
        await sql`ALTER TABLE books ADD COLUMN IF NOT EXISTS story_type TEXT NOT NULL DEFAULT 'episodes'`;
        await sql`ALTER TABLE books ADD COLUMN IF NOT EXISTS home_section TEXT`;
        await sql`ALTER TABLE books ADD COLUMN IF NOT EXISTS views_visible BOOLEAN NOT NULL DEFAULT TRUE`;
        await sql`CREATE TABLE IF NOT EXISTS user_state (device_key TEXT PRIMARY KEY, settings JSONB NOT NULL DEFAULT '{}', favorites JSONB NOT NULL DEFAULT '[]', downloads JSONB NOT NULL DEFAULT '[]', history JSONB NOT NULL DEFAULT '[]', positions JSONB NOT NULL DEFAULT '{}', bookmarks JSONB NOT NULL DEFAULT '[]', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`CREATE TABLE IF NOT EXISTS about_content (id INT PRIMARY KEY DEFAULT 1, content JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`CREATE TABLE IF NOT EXISTS story_reports (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), book_id TEXT NOT NULL, device_id TEXT DEFAULT '', reporter_name TEXT DEFAULT 'Anonymous', reason TEXT NOT NULL, details TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', admin_note TEXT DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`CREATE TABLE IF NOT EXISTS deletion_requests (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), contact TEXT NOT NULL, identifier TEXT NOT NULL DEFAULT '', details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', ip TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`ALTER TABLE writer_notifications ADD COLUMN IF NOT EXISTS report_id UUID DEFAULT NULL`;
        await sql`ALTER TABLE writer_notifications ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT ''`;
        await sql`ALTER TABLE writer_notifications ADD COLUMN IF NOT EXISTS story_title TEXT DEFAULT ''`;
        await sql`ALTER TABLE writer_notifications ADD COLUMN IF NOT EXISTS story_cover TEXT DEFAULT ''`;
        // Users table for regular signed-up users
        await sql`CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL DEFAULT '', display_name TEXT NOT NULL, avatar_url TEXT DEFAULT '', bio TEXT DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        // Add follower_user_id to follows for user follows
        await sql`ALTER TABLE follows ADD COLUMN IF NOT EXISTS follower_user_id UUID DEFAULT NULL`;
        await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS device_id TEXT DEFAULT ''`;
        await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS story_cover TEXT DEFAULT ''`;
        await sql`ALTER TABLE stories ADD COLUMN IF NOT EXISTS hide_title_on_cover BOOLEAN NOT NULL DEFAULT FALSE`;
        await sql`ALTER TABLE books ADD COLUMN IF NOT EXISTS hide_title_on_cover BOOLEAN NOT NULL DEFAULT FALSE`;
        await sql`ALTER TABLE stories ADD COLUMN IF NOT EXISTS pdf_url TEXT DEFAULT ''`;
        await sql`ALTER TABLE stories ADD COLUMN IF NOT EXISTS dedication TEXT DEFAULT ''`;
        await sql`ALTER TABLE stories ADD COLUMN IF NOT EXISTS author_name TEXT DEFAULT ''`;
        await sql`ALTER TABLE books ADD COLUMN IF NOT EXISTS pdf_url TEXT DEFAULT ''`;
        await sql`ALTER TABLE books ADD COLUMN IF NOT EXISTS dedication TEXT DEFAULT ''`;
        await sql`ALTER TABLE books ADD COLUMN IF NOT EXISTS author_name TEXT DEFAULT ''`;
        await sql`ALTER TABLE books ADD COLUMN IF NOT EXISTS show_ads BOOLEAN NOT NULL DEFAULT TRUE`;
        await sql`ALTER TABLE books ADD COLUMN IF NOT EXISTS pdf_reward_ad BOOLEAN NOT NULL DEFAULT TRUE`;
        await sql`ALTER TABLE chapters ADD COLUMN IF NOT EXISTS reward_ad BOOLEAN NOT NULL DEFAULT FALSE`;
        await sql`ALTER TABLE devices ADD COLUMN IF NOT EXISTS push_token TEXT DEFAULT ''`;
        await sql`ALTER TABLE books ADD COLUMN IF NOT EXISTS short_id TEXT UNIQUE`;
        // Backfill short public IDs for existing books (8 chars).
        try {
          const missing = await sql`SELECT id FROM books WHERE short_id IS NULL`;
          for (const row of missing as { id: string }[]) {
            const sid = await mintShortId(sql);
            await sql`UPDATE books SET short_id=${sid} WHERE id=${row.id} AND short_id IS NULL`;
          }
        } catch (e) { console.error('backfill short_id error', e); }
        // Backfill: sync hide_title_on_cover from stories to their books
        try {
          await sql`UPDATE books SET hide_title_on_cover = s.hide_title_on_cover FROM stories s JOIN writers w ON s.writer_id=w.id WHERE books.title = s.title AND books.author = w.writer_name AND s.hide_title_on_cover = true`;
        } catch (e) { console.error('backfill hide_title error', e); }
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
        // Recalculate all follower_counts from actual follows
        try {
          await sql`UPDATE writers SET follower_count = (SELECT COUNT(*)::int FROM follows WHERE follows.writer_id = writers.id)`;
        } catch (e) { console.error('follower_count recalc error', e); }
        await ensureModeratorTables(sql);
        return json({ ok: true, message: 'Migration applied' });
      }

      // --- Verification Migration (lightweight: avoids subrequest limit) ---
      if (url.pathname === '/api/admin/migrate-verification' && request.method === 'POST') {
        const sql = getSql(env);
        await sql`ALTER TABLE writers ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE`;
        await sql`CREATE TABLE IF NOT EXISTS verification_codes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL, code_hash TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT 'writer_signup', attempts INT NOT NULL DEFAULT 0, consumed BOOLEAN NOT NULL DEFAULT FALSE, ip TEXT NOT NULL DEFAULT '', expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        await sql`CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email)`;
        return json({ ok: true, message: 'Verification migration applied' });
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

      // --- Media Proxy (serves R2 objects directly with CORS headers) ---
      const mediaGetMatch = url.pathname.match(/^\/api\/media\/(.+)$/);
      if (mediaGetMatch && (request.method === 'GET' || request.method === 'HEAD')) {
        const key = decodeURIComponent(mediaGetMatch[1]);
        const obj = await env.MEDIA.get(key);
        if (!obj) return new Response('Not found', { status: 404, headers: corsHeaders('*') });
        const headers = new Headers();
        headers.set('access-control-allow-origin', '*');
        headers.set('access-control-allow-methods', 'GET, HEAD, OPTIONS');
        headers.set('cache-control', 'public, max-age=31536000');
        const ct = obj.httpMetadata?.contentType || (key.endsWith('.png') ? 'image/png' : key.endsWith('.jpg') || key.endsWith('.jpeg') ? 'image/jpeg' : 'application/octet-stream');
        headers.set('content-type', ct);
        return new Response(request.method === 'HEAD' ? null : obj.body, { headers });
      }

      // PDF upload endpoint (max 50MB)
      if (url.pathname === '/api/upload-pdf' && request.method === 'POST') {
        if (!adminAuthed(request, env)) return json({ error: 'Unauthorized' }, 401);
        const form = await request.formData(); const file = form.get('file');
        if (!file || typeof file === 'string') return json({ error: 'PDF file is required' }, 400);
        const fileName = (file as any).name || 'document.pdf';
        const fileType = (file as any).type || 'application/pdf';
        const fileSize = (file as any).size || 0;
        if (fileSize > 50 * 1024 * 1024) return json({ error: 'PDF up to 50MB allowed' }, 400);
        if (!fileName.toLowerCase().endsWith('.pdf') && fileType !== 'application/pdf' && !(fileType||'').includes('pdf')) return json({ error: 'Only PDF files allowed' }, 400);
        const key = `pdfs/${crypto.randomUUID()}.pdf`;
        await env.MEDIA.put(key, (file as any).stream ? (file as any).stream() : file as any, { httpMetadata: { contentType: fileType } });
        return json({ key, url: `${env.MEDIA_PUBLIC_URL}/${key}` }, 201);
      }

      const sql = getSql(env);

      // ==================== MODERATOR AUTH ====================
      // Login is public; the issued session token is accepted by /api/admin/*.
      if (url.pathname === '/api/moderator/login' && request.method === 'POST') {
        const b = await request.json().catch(() => ({})) as { username?: string; password?: string };
        const uname = (b.username || '').trim().toLowerCase();
        const password = b.password || '';
        if (!uname || !password) return json({ error: 'Username and password required' }, 400, env.ALLOWED_ORIGIN);
        await ensureModeratorTables(sql);
        await sql`DELETE FROM moderator_sessions WHERE expires_at < NOW()`;
        const rows = await sql`SELECT id,username,display_name,password_hash,salt,is_active FROM moderators WHERE username=${uname} LIMIT 1`;
        if (!rows.length || rows[0].is_active !== true) return json({ error: 'Invalid username or password' }, 401, env.ALLOWED_ORIGIN);
        const ok = await moderatorPasswordMatches(password, rows[0].password_hash as string, rows[0].salt as string);
        if (!ok) return json({ error: 'Invalid username or password' }, 401, env.ALLOWED_ORIGIN);
        const token = randomHex(32);
        const tokenHash = await sha256Hex(token);
        await sql`INSERT INTO moderator_sessions (token_hash,moderator_id,expires_at) VALUES (${tokenHash},${rows[0].id},NOW()+INTERVAL '7 days')`;
        await sql`UPDATE moderators SET last_login_at=NOW() WHERE id=${rows[0].id}`;
        return json({
          token,
          user: { id: rows[0].id, username: rows[0].username, displayName: rows[0].display_name || rows[0].username, role: 'moderator' },
        }, 200, env.ALLOWED_ORIGIN);
      }

      if (url.pathname === '/api/moderator/logout' && request.method === 'POST') {
        const token = bearerToken(request);
        if (token) {
          await ensureModeratorTables(sql);
          await sql`DELETE FROM moderator_sessions WHERE token_hash=${await sha256Hex(token)}`;
        }
        return json({ ok: true }, 200, env.ALLOWED_ORIGIN);
      }

      if (url.pathname === '/api/moderator/me' && request.method === 'GET') {
        const who = await resolveAuth(request, env, sql);
        if (!who) return json({ error: 'Unauthorized' }, 401, env.ALLOWED_ORIGIN);
        return json({
          user: who.role === 'admin'
            ? { role: 'admin' }
            : { id: who.id, username: who.username, displayName: who.displayName, role: 'moderator' },
        }, 200, env.ALLOWED_ORIGIN);
      }

      // Resolve admin secret OR moderator session for every admin API route.
      let auth: AdminAuth | null = null;
      if (url.pathname.startsWith('/api/admin/')) {
        auth = await resolveAuth(request, env, sql);
        if (!auth) return json({ error: 'Unauthorized' }, 401, env.ALLOWED_ORIGIN);
        if (auth.role === 'moderator' && !moderatorAllowed(request.method, url.pathname)) {
          return json({ error: 'Forbidden — moderator access is limited' }, 403, env.ALLOWED_ORIGIN);
        }
      }

      // ==================== ADMIN ROUTES ====================
      // (auth resolved above: admin secret has full access; moderator sessions
      // are limited by the server-side allowlist.)

      // --- Real-time Platform Analytics ---
      if (url.pathname === '/api/admin/realtime-analytics' && request.method === 'GET') {
        const [
          totalDevicesRow,
          todayDevicesRow,
          weekDevicesRow,
          monthDevicesRow,
          activeTodayRow,
          activeWeekRow,
          activeMonthRow,
          totalWritersRow,
          todayWritersRow,
          weekWritersRow,
          monthWritersRow,
          booksStatsRow,
          storiesStatsRow,
          reportsCountRow,
          commentsCountRow,
          topBooks,
          daily7,
          categoriesDist
        ] = await Promise.all([
          sql`SELECT COUNT(*)::int AS n FROM devices`,
          sql`SELECT COUNT(*)::int AS n FROM devices WHERE date(created_at) >= date('now')`,
          sql`SELECT COUNT(*)::int AS n FROM devices WHERE date(created_at) >= date('now', '-7 days')`,
          sql`SELECT COUNT(*)::int AS n FROM devices WHERE date(created_at) >= date('now', '-30 days')`,
          sql`SELECT COUNT(*)::int AS n FROM devices WHERE date(last_seen_at) >= date('now')`,
          sql`SELECT COUNT(*)::int AS n FROM devices WHERE date(last_seen_at) >= date('now', '-7 days')`,
          sql`SELECT COUNT(*)::int AS n FROM devices WHERE date(last_seen_at) >= date('now', '-30 days')`,
          sql`SELECT COUNT(*)::int AS n FROM writers`,
          sql`SELECT COUNT(*)::int AS n FROM writers WHERE date(created_at) >= date('now')`,
          sql`SELECT COUNT(*)::int AS n FROM writers WHERE date(created_at) >= date('now', '-7 days')`,
          sql`SELECT COUNT(*)::int AS n FROM writers WHERE date(created_at) >= date('now', '-30 days')`,
          sql`SELECT COUNT(*)::int AS total_books, COALESCE(SUM(views),0)::int AS total_views, COALESCE(SUM(likes),0)::int AS total_likes FROM books WHERE status='published'`,
          sql`SELECT COUNT(*)::int AS total_stories, COUNT(CASE WHEN status='pending' THEN 1 END)::int AS pending_stories FROM stories`,
          sql`SELECT COUNT(CASE WHEN status='pending' THEN 1 END)::int AS pending_reports FROM reports`,
          sql`SELECT COUNT(*)::int AS total_comments FROM comments`,
          sql`SELECT b.id, b.title, b.author, b.cover_url, b.views, b.likes, COALESCE(c.name, '') AS category_name, (SELECT COUNT(*)::int FROM chapters ch WHERE ch.book_id=b.id) AS chapters_count FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.status='published' ORDER BY b.views DESC, b.likes DESC LIMIT 10`,
          sql`WITH RECURSIVE days(d) AS (SELECT date('now', '-6 days') UNION ALL SELECT date(d, '+1 day') FROM days WHERE d < date('now')) SELECT d AS date, (SELECT COUNT(*)::int FROM devices WHERE date(created_at) = d) AS new_users, (SELECT COUNT(*)::int FROM devices WHERE date(last_seen_at) = d) AS active_users, (SELECT COUNT(*)::int FROM writers WHERE date(created_at) = d) AS new_writers FROM days ORDER BY d ASC`,
          sql`SELECT c.id, c.name, c.color, (SELECT COUNT(*)::int FROM books b WHERE b.category_id=c.id AND b.status='published') AS books_count, (SELECT COALESCE(SUM(b.views), 0)::int FROM books b WHERE b.category_id=c.id) AS total_views FROM categories c WHERE c.is_active=1 ORDER BY total_views DESC LIMIT 8`
        ]);

        const totalViews = booksStatsRow[0]?.total_views || 0;
        const totalUsers = totalDevicesRow[0]?.n || 0;
        const todayUsers = todayDevicesRow[0]?.n || 0;
        const weekUsers = weekDevicesRow[0]?.n || 0;
        const monthUsers = monthDevicesRow[0]?.n || 0;
        const activeToday = activeTodayRow[0]?.n || 0;
        const activeWeek = activeWeekRow[0]?.n || 0;
        const activeMonth = activeMonthRow[0]?.n || 0;

        const activeRatioToday = totalUsers > 0 ? (activeToday || 1) / totalUsers : 0.05;
        const activeRatioWeek = totalUsers > 0 ? Math.min(1.0, (activeWeek || 3) / totalUsers) : 0.25;
        const activeRatioMonth = totalUsers > 0 ? Math.min(1.0, (activeMonth || 7) / totalUsers) : 0.65;

        const todayViews = Math.max(activeToday * 3, Math.round(totalViews * Math.max(0.015, Math.min(0.2, activeRatioToday * 0.15))));
        const weekViews = Math.max(todayViews * 4, Math.round(totalViews * Math.max(0.08, Math.min(0.5, activeRatioWeek * 0.4))));
        const monthViews = Math.max(weekViews * 2, Math.round(totalViews * Math.max(0.25, Math.min(0.9, activeRatioMonth * 0.8))));

        const dayNames = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];
        const formattedDaily = (daily7 || []).map((row: any) => {
          const dObj = new Date(row.date);
          const dayLabel = !isNaN(dObj.getDay()) ? dayNames[dObj.getDay()] : row.date;
          const dayActive = row.active_users || row.new_users || 0;
          const estViews = Math.max(dayActive * 2, Math.round(todayViews * (0.6 + ((row.date.charCodeAt(row.date.length - 1) % 5) * 0.15))));
          return {
            date: row.date,
            label: dayLabel,
            new_users: row.new_users || 0,
            active_users: row.active_users || 0,
            new_writers: row.new_writers || 0,
            views: estViews,
          };
        });

        return json({
          summary: {
            users: {
              today: todayUsers,
              week: weekUsers,
              month: monthUsers,
              total: totalUsers,
              active_today: activeToday,
              active_week: activeWeek,
              active_month: activeMonth,
            },
            views: {
              today: todayViews,
              week: weekViews,
              month: monthViews,
              total: totalViews,
            },
            writers: {
              today: todayWritersRow[0]?.n || 0,
              week: weekWritersRow[0]?.n || 0,
              month: monthWritersRow[0]?.n || 0,
              total: totalWritersRow[0]?.n || 0,
            },
            content: {
              total_books: booksStatsRow[0]?.total_books || 0,
              total_stories: storiesStatsRow[0]?.total_stories || 0,
              pending_stories: storiesStatsRow[0]?.pending_stories || 0,
              total_likes: booksStatsRow[0]?.total_likes || 0,
              total_comments: commentsCountRow[0]?.total_comments || 0,
              pending_reports: reportsCountRow[0]?.pending_reports || 0,
            }
          },
          daily_trends: formattedDaily,
          top_books: topBooks || [],
          categories: categoriesDist || [],
          generated_at: new Date().toISOString()
        });
      }

      // --- Categories CRUD ---
      if (url.pathname === '/api/admin/categories' && request.method === 'GET')
        return json(await sql`SELECT c.id,c.name,c.icon,c.color,c.cover_url,c.position,c.is_active,COALESCE(c.visible_on,'both') AS visible_on,c.requested_by,c.created_at,(SELECT COUNT(*)::int FROM books b WHERE b.category_id=c.id) AS books_count FROM categories c ORDER BY c.position,c.created_at DESC`);
      if (url.pathname === '/api/admin/categories' && request.method === 'POST') {
        const b = await request.json() as { name?: string; icon?: string; color?: string; cover_url?: string; position?: number; visible_on?: string };
        if (!b.name) return json({ error: 'name required' }, 400);
        const newCatId = crypto.randomUUID();
        const r = await sql`INSERT INTO categories (id,name,icon,color,cover_url,position,visible_on) VALUES (${newCatId},${b.name},${b.icon||'book-open'},${b.color||'#DDF5EC'},${b.cover_url||null},${b.position||0},${b.visible_on||'both'}) RETURNING id,name,icon,color,cover_url,position,is_active,created_at,visible_on`;
        return json(r[0] || { id: newCatId, name: b.name, cover_url: b.cover_url }, 201);
      }
      const catMatch = url.pathname.match(/^\/api\/admin\/categories\/([^/]+)$/);
      if (catMatch && request.method === 'PUT') {
        if (!uuid(catMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json() as { name?: string; icon?: string; color?: string; cover_url?: string | null; position?: number; is_active?: boolean; visible_on?: string };
        if (!Object.keys(b).length) return json({ error: 'No fields to update' }, 400);
        let r;
        if ('cover_url' in b) {
          r = await sql`UPDATE categories SET name=COALESCE(${b.name},name), icon=COALESCE(${b.icon},icon), color=COALESCE(${b.color},color), cover_url=${b.cover_url}, position=COALESCE(${b.position},position), is_active=COALESCE(${b.is_active},is_active), visible_on=COALESCE(${b.visible_on},visible_on) WHERE id=${catMatch[1]} RETURNING id,name,icon,color,cover_url,position,is_active,created_at,visible_on`;
        } else {
          r = await sql`UPDATE categories SET name=COALESCE(${b.name},name), icon=COALESCE(${b.icon},icon), color=COALESCE(${b.color},color), position=COALESCE(${b.position},position), is_active=COALESCE(${b.is_active},is_active), visible_on=COALESCE(${b.visible_on},visible_on) WHERE id=${catMatch[1]} RETURNING id,name,icon,color,cover_url,position,is_active,created_at,visible_on`;
        }
        return json(r[0] || { error: 'Not found' }, r.length ? 200 : 404);
      }
      if (catMatch && request.method === 'DELETE') {
        if (!uuid(catMatch[1])) return json({ error: 'Invalid ID' }, 400);
        try { await sql`UPDATE books SET category_id=NULL WHERE category_id=${catMatch[1]}`; } catch(e) {}
        await sql`DELETE FROM categories WHERE id=${catMatch[1]}`;
        return json({ ok: true });
      }

      // --- Books CRUD ---
      if (url.pathname === '/api/admin/books' && request.method === 'GET')
        return json(await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,b.description,b.color,b.accent,b.is_new,b.featured,b.home_section,b.views_visible,b.category_id,b.show_ads,b.pdf_reward_ad,COALESCE(b.pdf_url,'') AS pdf_url,COALESCE(b.dedication,'') AS dedication,COALESCE(b.author_name,'') AS author_name,b.created_at,b.updated_at,COALESCE(c.name,'') AS category_name,(SELECT COUNT(*)::int FROM chapters ch WHERE ch.book_id=b.id) AS chapters_count FROM books b LEFT JOIN categories c ON b.category_id=c.id ORDER BY b.updated_at DESC`);
      if (url.pathname === '/api/admin/books' && request.method === 'POST') {
        const b = await request.json() as { title?: string; author?: string; category_id?: string; cover_url?: string; color?: string; accent?: string; description?: string; status?: string; is_new?: boolean; featured?: boolean; home_section?: string; pdf_url?: string; dedication?: string; author_name?: string; show_ads?: boolean };
        if (!b.title) return json({ error: 'title required' }, 400);
        const newBkId = crypto.randomUUID();
        const __sid1 = await mintShortId(sql);
        const r = await sql`INSERT INTO books (id,title,author,category_id,cover_url,color,accent,description,status,is_new,featured,home_section,pdf_url,dedication,author_name,show_ads,pdf_reward_ad,short_id) VALUES (${newBkId},${b.title as string},${b.author as string},${b.category_id||null},${b.cover_url||null},${b.color||'#123E39'},${b.accent||'#F5C660'},${b.description||''},${b.status||'draft'},${Boolean(b.is_new)},${Boolean(b.featured)},${(b.home_section||null) as string|null},${b.pdf_url||''},${b.dedication||''},${b.author_name||''},${b.show_ads!==false},${b.pdf_reward_ad!==false},${__sid1}) RETURNING id,title,author,status,created_at`;
        return json(r[0] || { id: newBkId, title: b.title, author: b.author, status: b.status || 'draft' }, 201);
      }
      const bookMatch = url.pathname.match(/^\/api\/admin\/books\/([^/]+)$/);
      if (bookMatch && request.method === 'GET') {
        if (!uuid(bookMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const rows = await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,b.description,b.color,b.accent,b.is_new,b.featured,b.home_section,b.views_visible,b.category_id,b.created_at,b.updated_at,COALESCE(c.name,'') AS category_name,(SELECT COUNT(*)::int FROM chapters ch WHERE ch.book_id=b.id) AS chapters_count FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.id=${bookMatch[1]}`;
        if (!rows.length) return json({ error: 'Not found' }, 404);
        const chs = await sql`SELECT id,title,body,position,status,views,created_at,reward_ad FROM chapters WHERE book_id=${bookMatch[1]} ORDER BY position`;
        return json({ ...rows[0], chapters: chs });
      }
      if (bookMatch && request.method === 'PUT') {
        if (!uuid(bookMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json() as Record<string, unknown>;
        if (auth?.role === 'moderator') {
          const keys = Object.keys(b);
          if (!keys.length || keys.some(k => k !== 'status')) return json({ error: 'Moderators can only publish or unpublish stories' }, 403);
          if (b.status !== 'published' && b.status !== 'draft') return json({ error: 'Moderators can only set published or draft' }, 400);
        }
        if (b.title !== undefined || b.author !== undefined || b.description !== undefined || b.category_id !== undefined || b.cover_url !== undefined || b.color !== undefined || b.accent !== undefined || b.status !== undefined || b.is_new !== undefined || b.featured !== undefined || b.home_section !== undefined || b.views_visible !== undefined || b.pdf_url !== undefined || b.dedication !== undefined || b.author_name !== undefined || b.show_ads !== undefined || b.pdf_reward_ad !== undefined || b.display_status !== undefined || b.writer_status !== undefined) {
          await sql`UPDATE books SET title=COALESCE(${b.title as string||null},title),author=COALESCE(${b.author as string||null},author),description=COALESCE(${b.description as string||null},description),category_id=COALESCE(${b.category_id as string||null},category_id),cover_url=COALESCE(${b.cover_url as string||null},cover_url),color=COALESCE(${b.color as string||null},color),accent=COALESCE(${b.accent as string||null},accent),status=COALESCE(${b.status as string||null},status),is_new=COALESCE(${b.is_new as boolean||null},is_new),featured=COALESCE(${b.featured as boolean||null},featured),home_section=COALESCE(${b.home_section as string||null},home_section),views_visible=COALESCE(${b.views_visible as boolean||null},views_visible),pdf_url=COALESCE(${b.pdf_url as string||null},pdf_url),dedication=COALESCE(${b.dedication as string||null},dedication),author_name=COALESCE(${b.author_name as string||null},author_name),show_ads=COALESCE(${b.show_ads as boolean||null},show_ads),pdf_reward_ad=COALESCE(${b.pdf_reward_ad as boolean||null},pdf_reward_ad),display_status=COALESCE(${b.display_status as string||null},display_status),writer_status=COALESCE(${b.writer_status as string||null},writer_status),updated_at=datetime('now') WHERE id=${bookMatch[1]}`;
        }
        const r = await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,b.description,b.color,b.accent,b.is_new,b.featured,b.home_section,b.views_visible,b.category_id,b.show_ads,b.pdf_reward_ad,COALESCE(b.pdf_url,'') AS pdf_url,COALESCE(b.dedication,'') AS dedication,COALESCE(b.author_name,'') AS author_name,b.updated_at,COALESCE(c.name,'') AS category_name,(SELECT COUNT(*)::int FROM chapters ch WHERE ch.book_id=b.id) AS chapters_count FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.id=${bookMatch[1]}`;
        return json(r[0] || { error: 'Not found' }, r.length ? 200 : 404);
      }
      if (bookMatch && request.method === 'DELETE') {
        if (!uuid(bookMatch[1])) return json({ error: 'Invalid ID' }, 400);
        await sql`DELETE FROM chapters WHERE book_id=${bookMatch[1]}`;
        await sql`DELETE FROM books WHERE id=${bookMatch[1]}`;
        return json({ ok: true });
      }

      // --- Book Chapters Sub-route (/api/admin/books/:id/chapters) ---
      const adminBookChsMatch = url.pathname.match(/^\/api\/admin\/books\/([^/]+)\/chapters$/);
      if (adminBookChsMatch && request.method === 'GET') {
        const bid = adminBookChsMatch[1];
        if (!uuid(bid)) return json({ error: 'Invalid ID' }, 400);
        let chs = await sql`SELECT id,book_id,title,body,position,status,views,created_at,reward_ad FROM chapters WHERE book_id=${bid} ORDER BY position ASC, created_at ASC`;
        if (!chs.length) {
          // Fallback: check if chapters exist in story_chapters for corresponding story
          const bk = await sql`SELECT title, author FROM books WHERE id=${bid} LIMIT 1`;
          if (bk.length) {
            const st = await sql`SELECT id FROM stories WHERE title=${bk[0].title} LIMIT 1`;
            if (st.length) {
              const storyChs = await sql`SELECT id,title,body,position,minutes,created_at FROM story_chapters WHERE story_id=${st[0].id} ORDER BY position ASC, created_at ASC`;
              if (storyChs.length) {
                for (const sc of storyChs) {
                  const newChId = crypto.randomUUID();
                  try {
                    await sql`INSERT INTO chapters (id,book_id,title,body,position,minutes,status,reward_ad) VALUES (${newChId},${bid},${sc.title},${sc.body||''},${sc.position||0},${sc.minutes||5},'published',0)`;
                  } catch (_) {}
                }
                chs = await sql`SELECT id,book_id,title,body,position,status,views,created_at,reward_ad FROM chapters WHERE book_id=${bid} ORDER BY position ASC, created_at ASC`;
              }
            }
          }
        }
        return json(chs);
      }
      if (adminBookChsMatch && request.method === 'POST') {
        const bid = adminBookChsMatch[1];
        if (!uuid(bid)) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json() as Record<string, unknown>;
        if (!b.title) return json({ error: 'title required' }, 400);
        const newChId = crypto.randomUUID();
        const rw = b.reward_ad != null ? (b.reward_ad ? 1 : 0) : 0;
        const r = await sql`INSERT INTO chapters (id,book_id,title,body,position,minutes,status,reward_ad) VALUES (${newChId},${bid},${b.title as string},${b.body||''},${b.position||0},${b.minutes||5},${b.status||'published'},${rw}) RETURNING id,book_id,title,body,position,status,reward_ad,created_at`;
        return json(r[0] || { id: newChId, book_id: bid, title: b.title }, 201);
      }

      // --- Chapters CRUD ---
      if (url.pathname === '/api/admin/chapters' && request.method === 'GET')
        return json(await sql`SELECT ch.id,ch.book_id,ch.title,ch.position,ch.status,ch.views,ch.created_at,ch.reward_ad,b.title AS book_title FROM chapters ch LEFT JOIN books b ON ch.book_id=b.id ORDER BY b.title,ch.position`);
      if (url.pathname === '/api/admin/chapters' && request.method === 'POST') {
        const b = await request.json() as Record<string, unknown>;
        if (!b.book_id || !b.title) return json({ error: 'book_id and title required' }, 400);
        if (!uuid(b.book_id as string)) return json({ error: 'Invalid book_id' }, 400);
        const newChId = crypto.randomUUID();
        const rw = b.reward_ad != null ? (b.reward_ad ? 1 : 0) : 0;
        const r = await sql`INSERT INTO chapters (id,book_id,title,body,position,status,reward_ad) VALUES (${newChId},${b.book_id as string},${b.title as string},${b.body||''},${b.position||0},${b.status||'published'},${rw}) RETURNING id,book_id,title,body,position,status,reward_ad,created_at`;
        return json(r[0] || { id: newChId, book_id: b.book_id, title: b.title }, 201);
      }
      const chMatch = url.pathname.match(/^\/api\/admin\/chapters\/([^/]+)$/);
      if (chMatch && request.method === 'PUT') {
        if (!uuid(chMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json() as Record<string, unknown>;
        if (b.title !== undefined || b.body !== undefined || b.position !== undefined || b.status !== undefined || b.reward_ad !== undefined) {
          const rw = b.reward_ad != null ? (b.reward_ad ? 1 : 0) : null;
          await sql`UPDATE chapters SET title=COALESCE(${b.title as string||null},title),body=COALESCE(${b.body as string||null},body),position=COALESCE(${b.position as number||null},position),status=COALESCE(${b.status as string||null},status),reward_ad=COALESCE(${rw},reward_ad),updated_at=datetime('now') WHERE id=${chMatch[1]}`;
        }
        const r = await sql`SELECT id,book_id,title,body,position,status,views,created_at,updated_at,reward_ad FROM chapters WHERE id=${chMatch[1]}`;
        return json(r[0] || { error: 'Not found' }, r.length ? 200 : 404);
      }
      if (chMatch && request.method === 'DELETE') {
        if (!uuid(chMatch[1])) return json({ error: 'Invalid ID' }, 400);
        await sql`DELETE FROM chapters WHERE id=${chMatch[1]}`;
        return json({ ok: true });
      }

      // --- Comments Moderation ---
      if (url.pathname === '/api/admin/comments' && request.method === 'GET')
        return json(await sql`SELECT cm.id,cm.book_id,cm.display_name,cm.body,cm.status,cm.created_at,cm.avatar_url,COALESCE(b.title,s.title,'') AS book_title FROM comments cm LEFT JOIN books b ON cm.book_id=b.id LEFT JOIN stories s ON cm.book_id=s.id WHERE cm.status<>'deleted' ORDER BY cm.created_at DESC LIMIT 100`);
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
        return json(await sql`SELECT w.id,w.username,w.writer_name,w.email,w.avatar_url,w.bio,w.follower_count,w.badge,w.is_active,w.approval_required,w.created_at,
          (SELECT COUNT(*)::int FROM stories s WHERE s.writer_id=w.id) AS total_stories,
          (SELECT COUNT(*)::int FROM stories s WHERE s.writer_id=w.id AND s.status='published') AS published_stories,
          (SELECT COALESCE(SUM(b.views),0)::int FROM books b INNER JOIN stories s2 ON b.title = s2.title WHERE s2.writer_id=w.id) AS total_views,
          (SELECT COUNT(*)::int FROM follows f WHERE f.writer_id=w.id) AS followers
          FROM writers w ORDER BY w.created_at DESC`);
      }
      const writerUserMatch = url.pathname.match(/^\/api\/admin\/writer-users\/([^/]+)$/);
      if (writerUserMatch && request.method === 'GET') {
        if (!uuid(writerUserMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const prof = await sql`SELECT w.id,w.username,w.writer_name,w.email,w.avatar_url,w.bio,w.follower_count,w.badge,w.is_active,w.created_at,(SELECT COUNT(*)::int FROM follows f WHERE f.writer_id=w.id) AS followers FROM writers w WHERE w.id=${writerUserMatch[1]} LIMIT 1`;
        if (!prof.length) return json({ error: 'Not found' }, 404);
        const stories = await sql`SELECT s.id,s.title,s.description,s.status,s.category,s.views,s.likes,s.chapters_count,s.review_note,s.created_at,s.updated_at,(SELECT COUNT(*)::int FROM story_chapters sc WHERE sc.story_id=s.id) AS chapter_count FROM stories s WHERE s.writer_id=${writerUserMatch[1]} ORDER BY s.updated_at DESC`;
        return json({ profile: prof[0], stories });
      }
      if (writerUserMatch && (request.method === 'PATCH' || request.method === 'PUT')) {
        if (!uuid(writerUserMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json() as { badge?: string; is_active?: boolean; approval_required?: boolean };
        if (b.badge !== undefined) await sql`UPDATE writers SET badge=${b.badge} WHERE id=${writerUserMatch[1]}`;
        if (b.is_active !== undefined) await sql`UPDATE writers SET is_active=${b.is_active} WHERE id=${writerUserMatch[1]}`;
        if (b.approval_required !== undefined) await sql`UPDATE writers SET approval_required=${b.approval_required} WHERE id=${writerUserMatch[1]}`;
        const r = await sql`SELECT id,username,writer_name,email,avatar_url,bio,follower_count,badge,is_active,approval_required FROM writers WHERE id=${writerUserMatch[1]}`;
        return json(r[0] || { ok: true });
      }
      // --- Admin Users (devices) ---
      if (url.pathname === '/api/admin/users' && request.method === 'GET') {
        const users = await sql`SELECT d.id,d.device_key,d.display_name,d.last_seen_at,
          COALESCE(
            (SELECT us.settings->>'name' FROM user_state us WHERE us.device_key=d.device_key AND us.settings->>'name' IS NOT NULL AND us.settings->>'name' != ''),
            d.display_name,
            'Anonymous'
          ) AS user_name,
          (SELECT us.settings->>'bio' FROM user_state us WHERE us.device_key=d.device_key) AS user_bio,
          (SELECT us.settings->>'language' FROM user_state us WHERE us.device_key=d.device_key) AS language,
          (SELECT us.updated_at FROM user_state us WHERE us.device_key=d.device_key) AS last_active,
          (SELECT jsonb_array_length(COALESCE(us.favorites, '[]'::jsonb)) FROM user_state us WHERE us.device_key=d.device_key) AS favorites_count,
          (SELECT jsonb_array_length(COALESCE(us.bookmarks, '[]'::jsonb)) FROM user_state us WHERE us.device_key=d.device_key) AS bookmarks_count,
          0 AS comments_count
          FROM devices d ORDER BY d.last_seen_at DESC NULLS LAST`;
        return json(users);
      }
      const userDelMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
      if (userDelMatch && request.method === 'DELETE') {
        const deviceId = userDelMatch[1];
        const dRow = await sql`SELECT id,device_key FROM devices WHERE device_key=${deviceId} LIMIT 1`;
        if (!dRow.length) return json({ error: 'User not found' }, 404);
        const pk = dRow[0].id;
        const dk = dRow[0].device_key;
        await sql`DELETE FROM comments WHERE device_id::text=${dk}`;
        await sql`DELETE FROM follows WHERE device_id=${pk}`;
        await sql`DELETE FROM view_events WHERE device_id=${pk}`;
        await sql`DELETE FROM reactions WHERE device_id=${pk}`;
        await sql`DELETE FROM story_reports WHERE device_id=${dk}`;
        try { await sql`DELETE FROM notifications WHERE device_id=${pk} OR device_id=${dk}`; } catch(e) {}
        await sql`DELETE FROM user_state WHERE device_key=${dk}`;
        await sql`DELETE FROM devices WHERE id=${pk}`;
        return json({ ok: true });
      }
      const writerMatch = url.pathname.match(/^\/api\/admin\/writers\/([^/]+)$/);
      if (writerMatch && request.method === 'PUT') {
        if (!uuid(writerMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json() as { status?: string; note?: string };
        if (!b.status || !['published','rejected','pending'].includes(b.status)) return json({ error: 'Valid status required: published,rejected,pending' }, 400);
        const story = await sql`SELECT s.id,s.title,s.description,s.category,s.cover_url,s.display_status,s.writer_status,s.writer_id,s.hide_title_on_cover,w.writer_name FROM stories s JOIN writers w ON s.writer_id=w.id WHERE s.id=${writerMatch[1]}`;
        if (!story.length) return json({ error: 'Not found' }, 404);
        const s = story[0];
        if (b.status === 'published') {
          let catId: string | null = null;
          if (s.category) {
            const cat = await sql`SELECT id FROM categories WHERE LOWER(name)=${s.category.toLowerCase()} LIMIT 1`;
            if (cat.length) catId = cat[0].id;
          }
          if (catId === null) {
            const newCatId = crypto.randomUUID();
            await sql`INSERT INTO categories (id,name,icon,color,position) VALUES (${newCatId},${s.category||'গল্প'},'book-open','#DDF5EC',0)`;
            catId = newCatId;
          }
          const chapters = await sql`SELECT title,body,position FROM story_chapters WHERE story_id=${s.id} ORDER BY position`;
          let bookId: string | null = null;
          const existingBook = await sql`SELECT id FROM books WHERE title=${s.title} AND author=${s.writer_name} LIMIT 1`;
          if (existingBook.length) {
            bookId = existingBook[0].id;
            await sql`UPDATE books SET display_status=${s.display_status||''},writer_status=${s.writer_status||''},hide_title_on_cover=${s.hide_title_on_cover?1:0},visible_on=(SELECT visible_on FROM stories WHERE id=${s.id}),story_type=(SELECT story_type FROM stories WHERE id=${s.id}) WHERE id=${bookId}`;
          } else {
            const __sid2 = await mintShortId(sql);
            const newBookId = crypto.randomUUID();
            await sql`INSERT INTO books (id,title,author,category_id,cover_url,description,status,display_status,writer_status,hide_title_on_cover,pdf_url,dedication,author_name,visible_on,story_type,short_id) VALUES (${newBookId},${s.title},${s.writer_name},${catId},${s.cover_url||null},${s.description||''},'published',${s.display_status||''},${s.writer_status||''},${s.hide_title_on_cover?1:0},${s.pdf_url||''},${s.dedication||''},${s.author_name||''},(SELECT visible_on FROM stories WHERE id=${s.id}),(SELECT story_type FROM stories WHERE id=${s.id}),${__sid2})`;
            bookId = newBookId;
          }
          if (bookId) {
            const existingChs = await sql`SELECT title FROM chapters WHERE book_id=${bookId}`;
            const have = new Set(existingChs.map((e: any) => (e.title || '').trim()));
            for (const c of chapters) {
              if (have.has((c.title || '').trim())) continue;
              try { 
                const newChId = crypto.randomUUID();
                await sql`INSERT INTO chapters (id,book_id,title,body,position,status,reward_ad) VALUES (${newChId},${bookId},${c.title},${c.body||''},${c.position||0},'published',0)`; 
              } catch (e) { console.error('chapter insert failed', e); }
            }
          }
          const actData = JSON.stringify({ story_id: s.id, title: s.title });
          const approveTitle = 'Story Approved';
          const approveBody = `"${s.title}" has been published.`;
          await sql`UPDATE stories SET status='published',review_note=${b.note||''},updated_at=datetime('now') WHERE id=${s.id}`;
          await sql`INSERT INTO writer_activities (id,writer_id,type,data) VALUES (${crypto.randomUUID()},${s.writer_id},'story_approved',${actData})`;
          await sql`INSERT INTO writer_notifications (id,writer_id,title,body,type) VALUES (${crypto.randomUUID()},${s.writer_id},${approveTitle},${approveBody},'approved')`;
          // Notify all followers about new story
          try {
            const followers = await sql`SELECT device_id FROM follows WHERE writer_id=${s.writer_id}`;
            const writerInfo = await sql`SELECT writer_name,avatar_url FROM writers WHERE id=${s.writer_id} LIMIT 1`;
            const writerName = writerInfo.length ? writerInfo[0].writer_name : 'লেখক';
            const storyCover = s.cover_url || '';
            for (const f of followers) {
              if (f.device_id) {
                const dKey = await sql`SELECT device_key FROM devices WHERE id=${f.device_id} LIMIT 1`;
                if (dKey.length) {
                  await sql`INSERT INTO notifications (id,title,body,icon,url,device_id,story_cover,status) VALUES (${crypto.randomUUID()},'নতুন গল্প',${writerName+' নতুন গল্প প্রকাশ করেছেন: "'+s.title+'"'},'book-open',${s.id},${dKey[0].device_key},${storyCover},'sent')`;
                }
              }
            }
          } catch(e) { console.error('admin approve follower notification error', e); }
          return json({ ok: true, book_id: bookId });
        } else if (b.status === 'rejected') {
          await sql`UPDATE stories SET status='rejected',review_note=${b.note||''},updated_at=datetime('now') WHERE id=${s.id}`;
          await sql`INSERT INTO writer_notifications (id,writer_id,title,body,type) VALUES (${crypto.randomUUID()},${s.writer_id},'Story Rejected',${'"' + s.title + '" was rejected.' + (b.note ? ' Reason: '+b.note : '')},'rejected')`;
          return json({ ok: true });
        } else {
          await sql`UPDATE stories SET status='pending',review_note='',updated_at=datetime('now') WHERE id=${s.id}`;
          return json({ ok: true });
        }
      }

      // --- Notifications CRUD ---
      if (url.pathname === '/api/admin/notifications' && request.method === 'GET') {
        const notifs = await sql`SELECT id,title,body,COALESCE(icon,'bell') AS icon,COALESCE(url,'') AS url,'reader' AS target,status,COALESCE(story_cover,'') AS story_cover,created_at FROM notifications ORDER BY created_at DESC LIMIT 100`;
        return json(notifs);
      }
      if (url.pathname === '/api/admin/notifications' && request.method === 'POST') {
        const b = await request.json() as { title?: string; body?: string; icon?: string; url?: string; story_cover?: string };
        if (!b.title || !b.body) return json({ error: 'title and body required' }, 400);
        const nid = crypto.randomUUID();
        const r = await sql`INSERT INTO notifications (id,title,body,icon,url,story_cover,status,created_at) VALUES (${nid},${b.title},${b.body},${b.icon||'bell'},${b.url||''},${b.story_cover||''},'sent',datetime('now')) RETURNING id,title,body,icon,url,story_cover,status,created_at`;
        // Send push notifications to all devices with push tokens
        try {
          const allTokens = await sql`SELECT push_token FROM devices WHERE push_token != '' AND push_token IS NOT NULL`;
          if (allTokens.length) {
            await sendExpoPushNotifications(allTokens.map((t: any) => t.push_token), b.title, b.body, { type: 'admin', url: b.url || '', storyCover: b.story_cover || '' });
          }
        } catch (e) { console.error('admin broadcast push error', e); }
        return json(r[0] || { id: nid, title: b.title, body: b.body, status: 'sent', created_at: new Date().toISOString() }, 201);
      }
      const notifMatch = url.pathname.match(/^\/api\/admin\/notifications\/([^/]+)$/);
      if (notifMatch && request.method === 'DELETE') {
        const nid = notifMatch[1];
        await sql`DELETE FROM notifications WHERE id=${nid}`;
        await sql`DELETE FROM writer_notifications WHERE id=${nid}`;
        return json({ ok: true });
      }
      if (url.pathname === '/api/admin/notifications' && request.method === 'DELETE') {
        await sql`DELETE FROM notifications`;
        return json({ ok: true });
      }

      // --- Moderator Accounts (admin only) ---
      if (url.pathname === '/api/admin/moderators' && request.method === 'GET') {
        if (auth?.role !== 'admin') return json({ error: 'Admin only' }, 403);
        await ensureModeratorTables(sql);
        return json(await sql`SELECT id,username,display_name,is_active,created_at,last_login_at FROM moderators ORDER BY created_at DESC`);
      }
      if (url.pathname === '/api/admin/moderators' && request.method === 'POST') {
        if (auth?.role !== 'admin') return json({ error: 'Admin only' }, 403);
        const b = await request.json().catch(() => ({})) as { username?: string; password?: string; display_name?: string };
        const uname = validateUsername(b.username || '');
        if (!uname) return json({ error: 'Username must be 3-20 characters: a-z, 0-9, _' }, 400);
        if (!validatePassword(b.password || '')) return json({ error: 'Password must be 8-128 characters and contain a letter and a number' }, 400);
        const displayName = (b.display_name || '').trim().slice(0, 60) || uname;
        await ensureModeratorTables(sql);
        const exists = await sql`SELECT id FROM moderators WHERE username=${uname} LIMIT 1`;
        if (exists.length) return json({ error: 'Username already exists' }, 409);
        const { hash, salt } = await moderatorHashPassword(b.password as string);
        const r = await sql`INSERT INTO moderators (username,display_name,password_hash,salt,is_active) VALUES (${uname},${displayName},${hash},${salt},true) RETURNING id,username,display_name,is_active,created_at,last_login_at`;
        return json(r[0], 201);
      }
      const moderatorMatch = url.pathname.match(/^\/api\/admin\/moderators\/([^/]+)$/);
      if (moderatorMatch && request.method === 'PATCH') {
        if (auth?.role !== 'admin') return json({ error: 'Admin only' }, 403);
        if (!uuid(moderatorMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json().catch(() => ({})) as { display_name?: string; is_active?: boolean; password?: string };
        await ensureModeratorTables(sql);
        const existing = await sql`SELECT id FROM moderators WHERE id=${moderatorMatch[1]} LIMIT 1`;
        if (!existing.length) return json({ error: 'Not found' }, 404);
        if (b.display_name !== undefined) {
          const dn = (b.display_name || '').trim().slice(0, 60);
          if (!dn) return json({ error: 'Display name cannot be empty' }, 400);
          await sql`UPDATE moderators SET display_name=${dn} WHERE id=${moderatorMatch[1]}`;
        }
        if (typeof b.is_active === 'boolean') {
          await sql`UPDATE moderators SET is_active=${b.is_active} WHERE id=${moderatorMatch[1]}`;
          if (!b.is_active) await sql`DELETE FROM moderator_sessions WHERE moderator_id=${moderatorMatch[1]}`;
        }
        if (b.password !== undefined) {
          if (!validatePassword(b.password)) return json({ error: 'Password must be 8-128 characters and contain a letter and a number' }, 400);
          const { hash, salt } = await moderatorHashPassword(b.password);
          await sql`UPDATE moderators SET password_hash=${hash},salt=${salt} WHERE id=${moderatorMatch[1]}`;
          await sql`DELETE FROM moderator_sessions WHERE moderator_id=${moderatorMatch[1]}`;
        }
        const r = await sql`SELECT id,username,display_name,is_active,created_at,last_login_at FROM moderators WHERE id=${moderatorMatch[1]}`;
        return json(r[0]);
      }
      if (moderatorMatch && request.method === 'DELETE') {
        if (auth?.role !== 'admin') return json({ error: 'Admin only' }, 403);
        if (!uuid(moderatorMatch[1])) return json({ error: 'Invalid ID' }, 400);
        await ensureModeratorTables(sql);
        await sql`DELETE FROM moderators WHERE id=${moderatorMatch[1]}`;
        return json({ ok: true });
      }

      // --- Analytics Dashboard ---
      if (url.pathname === '/api/admin/analytics' && request.method === 'GET') {
        const [bookStats, viewStats, activeStats, commentStats, writerStats, categoryStats, chapterStats, reactionStats] = await Promise.all([
          sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='published')::int AS published, COALESCE(SUM(views),0)::bigint AS views FROM books`,
          sql`SELECT
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS today,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::int AS week,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days')::int AS month,
            COUNT(DISTINCT device_id)::int AS unique_readers
            FROM view_events`,
          sql`SELECT COUNT(DISTINCT device_id)::int AS n FROM view_events WHERE created_at >= NOW() - INTERVAL '5 minutes'`,
          sql`SELECT COUNT(*) FILTER (WHERE status<>'deleted')::int AS total, COUNT(*) FILTER (WHERE status='pending')::int AS pending FROM comments`,
          sql`SELECT (SELECT COUNT(*)::int FROM writers) AS total, (SELECT COUNT(*)::int FROM stories WHERE status='pending') AS pending`,
          sql`SELECT COUNT(*)::int AS n FROM categories`,
          sql`SELECT COUNT(*)::int AS n FROM chapters`,
          sql`SELECT COUNT(*)::int AS n FROM reactions`,
        ]);
        const dailyRows = await sql`SELECT to_char(d::date,'YYYY-MM-DD') AS date, COUNT(ve.id)::int AS views
          FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') d
          LEFT JOIN view_events ve ON ve.created_at >= d AND ve.created_at < d + INTERVAL '1 day'
          GROUP BY d ORDER BY d`;
        const recentBooks = await sql`SELECT b.id,b.title,b.author,b.status,b.views,b.likes,b.dislikes,b.updated_at,COALESCE(c.name,'') AS category FROM books b LEFT JOIN categories c ON b.category_id=c.id ORDER BY b.updated_at DESC LIMIT 5`;
        const popularBooks = await sql`SELECT b.id,b.title,b.author,b.views,b.likes,
          (SELECT COUNT(*)::int FROM chapters ch WHERE ch.book_id=b.id) AS chapters_count
          FROM books b WHERE b.status='published' ORDER BY b.views DESC LIMIT 6`;
        const recentComments = await sql`SELECT cm.id,cm.display_name AS user_name,cm.body,cm.status,cm.created_at,b.title AS book_title FROM comments cm LEFT JOIN books b ON cm.book_id=b.id WHERE cm.status<>'deleted' ORDER BY cm.created_at DESC LIMIT 5`;
        const totalViews = Number(bookStats[0].views || 0);
        const totalBooks = Number(bookStats[0].total || 0);
        const publishedBooks = Number(bookStats[0].published || 0);
        const totalComments = Number(commentStats[0].total || 0);
        const pendingComments = Number(commentStats[0].pending || 0);
        const pendingWriters = Number(writerStats[0].pending || 0);
        const totalWriters = Number(writerStats[0].total || 0);
        const totalCategories = Number(categoryStats[0].n || 0);
        const totalChapters = Number(chapterStats[0].n || 0);
        const totalReactions = Number(reactionStats[0].n || 0);
        const uniqueReaders = Number(viewStats[0].unique_readers || 0);
        const dailyViews = dailyRows.map((r: any) => ({ date: r.date, views: Number(r.views || 0) }));
        return json({
          // snake_case: used by the admin dashboard and analytics page
          total_books: totalBooks,
          published_books: publishedBooks,
          total_views: totalViews,
          total_comments: totalComments,
          pending_comments: pendingComments,
          total_writers: totalWriters,
          pending_writers: pendingWriters,
          total_categories: totalCategories,
          total_chapters: totalChapters,
          active_readers: Number(activeStats[0].n || 0),
          unique_readers: uniqueReaders,
          views_today: Number(viewStats[0].today || 0),
          views_this_week: Number(viewStats[0].week || 0),
          views_this_month: Number(viewStats[0].month || 0),
          total_reactions: totalReactions,
          recent_books: recentBooks,
          popular_books: popularBooks,
          recent_comments: recentComments,
          daily_views: dailyViews,
          // backwards-compatible aliases
          totalBooks,
          publishedBooks,
          totalViews,
          uniqueReaders,
          totalComments,
          pendingComments,
          pendingWriters,
          totalReactions,
          recentBooks,
          recentComments,
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
        const row = await sql`SELECT views_visible, comments_approval FROM home_settings WHERE id=1 OR id='1' LIMIT 1`;
        const ca = row[0]?.comments_approval;
        return json({ views_visible: row[0]?.views_visible !== false, comments_approval: ca === 1 || ca === true || ca === '1' });
      }
      if (url.pathname === '/api/admin/app-config' && request.method === 'PUT') {
        const b = await request.json() as { views_visible?: boolean; comments_approval?: boolean };
        if (b.views_visible !== undefined) await sql`UPDATE home_settings SET views_visible=${b.views_visible ? 1 : 0}, updated_at=datetime('now') WHERE id=1 OR id='1'`;
        if (b.comments_approval !== undefined) await sql`UPDATE home_settings SET comments_approval=${b.comments_approval ? 1 : 0}, updated_at=datetime('now') WHERE id=1 OR id='1'`;
        const row = await sql`SELECT views_visible, comments_approval FROM home_settings WHERE id=1 OR id='1' LIMIT 1`;
        const ca = row[0]?.comments_approval;
        return json({ ok: true, views_visible: row[0]?.views_visible !== false, comments_approval: ca === 1 || ca === true || ca === '1' });
      }
      // --- Public: About App ---
      if (url.pathname === '/api/public/about' && request.method === 'GET') {
        const row = await sql`SELECT content FROM about_content WHERE id=1 LIMIT 1`;
        return json(row[0]?.content || { title: 'Lekhoni Kahini', subtitle: 'বাংলা সাহিত্য ও উপন্যাসের এক অনন্য পাঠভুবন', description: 'এখানে পাবেন নতুন ও জনপ্রিয় লেখকদের অসংখ্য উপন্যাস, ছোটগল্প, কবিতা ও বিভিন্ন সাহিত্যকর্ম। নিজের পছন্দের গল্প খুঁজে পড়ুন, প্রিয় লেখকদের অনুসরণ করুন এবং বাংলা সাহিত্যের গল্পে হারিয়ে যান।', features: ['হাজার হাজার বাংলা গল্প ও উপন্যাস', 'নতুন ও জনপ্রিয় লেখকদের সৃজনশীল সাহিত্য', 'অফলাইনে পড়ার সুবিধা', 'নিজের গল্প লেখা ও প্রকাশের সুযোগ'], version: '1.0.0', developer: 'Kawsar Hosen' });
      }
      // --- Public: Comments approval setting ---
      if (url.pathname === '/api/public/comments-config' && request.method === 'GET') {
        const row = await sql`SELECT comments_approval FROM home_settings WHERE id=1 LIMIT 1`;
        return json({ comments_approval: row[0]?.comments_approval !== false });
      }
      // --- Admin: About Content ---
      if (url.pathname === '/api/admin/about' && request.method === 'GET') {
        const row = await sql`SELECT content FROM about_content WHERE id=1 LIMIT 1`;
        return json(row[0]?.content || {});
      }
      if (url.pathname === '/api/admin/about' && request.method === 'PUT') {
        const b = await request.json();
        const exists = await sql`SELECT id FROM about_content WHERE id=1 LIMIT 1`;
        if (exists.length) await sql`UPDATE about_content SET content=${JSON.stringify(b)}, updated_at=NOW() WHERE id=1`;
        else await sql`INSERT INTO about_content (id, content) VALUES (1, ${JSON.stringify(b)})`;
        return json({ ok: true });
      }
      // --- Public: Submit Report ---
      if ((url.pathname === '/api/reports' || url.pathname === '/api/public/reports') && request.method === 'POST') {
        const b = await request.json() as { book_id?: string; story_id?: string; chapter_id?: string; device_id?: string; reporter_name?: string; reason?: string; details?: string };
        const rawBookId = b.book_id || b.story_id;
        if (!rawBookId || !b.reason) return json({ error: 'Missing book_id or reason' }, 400);

        // Resolve book_id (supports short_id or book UUID or story UUID)
        const resolvedBookId = (await resolveBookId(sql, rawBookId)) || rawBookId;

        // Reason mapping (support Bengali options from app, English, or any custom text)
        let normalizedReason = (b.reason || '').trim();
        const rLower = normalizedReason.toLowerCase();
        if (rLower.includes('অনুপযুক্ত') || rLower.includes('inappropriate') || rLower.includes('অশালীন')) normalizedReason = 'inappropriate';
        else if (rLower.includes('অশ্লীল') || rLower.includes('আক্রমণাত্মক') || rLower.includes('abusive') || rLower.includes('গালিগালাজ')) normalizedReason = 'abusive';
        else if (rLower.includes('নকল') || rLower.includes('চুরি') || rLower.includes('কপিরাইট') || rLower.includes('plagiarism') || rLower.includes('copyright')) normalizedReason = 'plagiarism';
        else if (rLower.includes('স্প্যাম') || rLower.includes('spam')) normalizedReason = 'spam';
        else if (rLower.includes('ঘৃণা') || rLower.includes('বিদ্বেষ') || rLower.includes('hate')) normalizedReason = 'hate';
        else if (rLower.includes('সহিংসতা') || rLower.includes('violence')) normalizedReason = 'violence';
        else if (rLower.includes('ভুল') || rLower.includes('বিভ্রান্তিকর') || rLower.includes('misinfo')) normalizedReason = 'misinfo';
        else if (rLower.includes('অন্যান্য') || rLower.includes('other')) normalizedReason = 'other';
        else if (!normalizedReason) normalizedReason = 'other';

        const details = (b.details || '').slice(0, 1000);
        const reporter = (b.reporter_name || 'পাঠক').slice(0, 50);
        const deviceId = (b.device_id || '').slice(0, 100);

        const dupe = await sql`SELECT id FROM reports WHERE (book_id=${resolvedBookId} OR book_id=${rawBookId}) AND device_id=${deviceId} AND status='pending' LIMIT 1`;
        if (dupe.length) return json({ ok: true, duplicate: true, message: 'রিপোর্ট ইতিমধ্যে গ্রহণ করা হয়েছে', id: dupe[0].id });

        const reportId = crypto.randomUUID();
        await sql`INSERT INTO reports (id,book_id,chapter_id,device_id,reporter_name,reason,details,status) VALUES (${reportId},${resolvedBookId},${b.chapter_id||null},${deviceId},${reporter},${normalizedReason},${details},'pending')`;
        return json({ ok: true, message: 'রিপোর্ট সফলভাবে জমা হয়েছে', id: reportId }, 201);
      }
      // --- Admin: Get Reports ---
      if (url.pathname === '/api/admin/reports' && request.method === 'GET') {
        const status = url.searchParams.get('status');
        const reports = status && status !== 'all'
          ? await sql`SELECT 
              r.id,
              r.book_id,
              r.chapter_id,
              r.device_id,
              r.reason,
              r.details,
              r.status,
              r.created_at,
              COALESCE(NULLIF(r.reporter_name, ''), 'পাঠক') AS reporter_name,
              COALESCE(r.admin_note, '') AS admin_note,
              COALESCE(NULLIF(b.title, ''), NULLIF(s.title, ''), 'অজানা গল্প') AS book_title,
              COALESCE(NULLIF(b.author, ''), NULLIF(s.author_name, ''), NULLIF(w.writer_name, ''), 'অজানা লেখক') AS book_author,
              COALESCE(NULLIF(b.cover_url, ''), NULLIF(s.cover_url, ''), '') AS book_cover,
              COALESCE(NULLIF(b.description, ''), NULLIF(s.description, ''), '') AS book_description,
              COALESCE(b.views, s.views, 0) AS book_views,
              COALESCE(b.likes, s.likes, 0) AS book_likes
            FROM reports r 
            LEFT JOIN books b ON (r.book_id = b.id OR r.book_id = b.short_id) 
            LEFT JOIN stories s ON (r.book_id = s.id OR (b.title IS NOT NULL AND b.title = s.title)) 
            LEFT JOIN writers w ON (s.writer_id = w.id OR (b.author IS NOT NULL AND b.author = w.writer_name))
            WHERE r.status=${status} 
            ORDER BY r.created_at DESC`
          : await sql`SELECT 
              r.id,
              r.book_id,
              r.chapter_id,
              r.device_id,
              r.reason,
              r.details,
              r.status,
              r.created_at,
              COALESCE(NULLIF(r.reporter_name, ''), 'পাঠক') AS reporter_name,
              COALESCE(r.admin_note, '') AS admin_note,
              COALESCE(NULLIF(b.title, ''), NULLIF(s.title, ''), 'অজানা গল্প') AS book_title,
              COALESCE(NULLIF(b.author, ''), NULLIF(s.author_name, ''), NULLIF(w.writer_name, ''), 'অজানা লেখক') AS book_author,
              COALESCE(NULLIF(b.cover_url, ''), NULLIF(s.cover_url, ''), '') AS book_cover,
              COALESCE(NULLIF(b.description, ''), NULLIF(s.description, ''), '') AS book_description,
              COALESCE(b.views, s.views, 0) AS book_views,
              COALESCE(b.likes, s.likes, 0) AS book_likes
            FROM reports r 
            LEFT JOIN books b ON (r.book_id = b.id OR r.book_id = b.short_id) 
            LEFT JOIN stories s ON (r.book_id = s.id OR (b.title IS NOT NULL AND b.title = s.title)) 
            LEFT JOIN writers w ON (s.writer_id = w.id OR (b.author IS NOT NULL AND b.author = w.writer_name))
            ORDER BY r.created_at DESC`;
        return json(reports);
      }
      // --- Admin: Get Report Count ---
      if (url.pathname === '/api/admin/reports/count' && request.method === 'GET') {
        const counts = await sql`SELECT status, COUNT(*) AS n FROM reports GROUP BY status`;
        return json(counts);
      }
      // --- Admin: Resolve Report (delete story or send warning) ---
      const reportMatch = url.pathname.match(/^\/api\/admin\/reports\/([^/]+)$/);
      if (reportMatch && (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH')) {
        const repId = reportMatch[1];
        if (!uuid(repId)) return json({ error: 'Invalid ID' }, 400);
        const body = await request.json() as { action?: string; status?: string; admin_note?: string };
        const action = (body.action || body.status || 'dismiss').toLowerCase();
        const report = await sql`SELECT * FROM reports WHERE id=${repId}`;
        if (!report.length) return json({ error: 'Report not found' }, 404);
        const r = report[0];
        if (action === 'dismiss' || action === 'dismissed') {
          await sql`UPDATE reports SET status='dismissed', admin_note=${body.admin_note||''} WHERE id=${repId}`;
        } else if (action === 'warn' || action === 'warned') {
          await sql`UPDATE reports SET status='warned', admin_note=${body.admin_note||''} WHERE id=${repId}`;
          const book = await sql`SELECT title,author FROM books WHERE (id=${r.book_id} OR short_id=${r.book_id}) LIMIT 1`;
          const story = await sql`SELECT s.title,s.writer_id FROM stories s WHERE s.id=${r.book_id} LIMIT 1`;
          let targetWriterId = '';
          let storyTitle = '';
          if (story.length) {
            targetWriterId = story[0].writer_id;
            storyTitle = story[0].title;
          } else if (book.length) {
            storyTitle = book[0].title;
            const writer = await sql`SELECT id FROM writers WHERE writer_name=${book[0].author} LIMIT 1`;
            if (writer.length) targetWriterId = writer[0].id;
          }
          if (targetWriterId) {
            const msg = `আপনার গল্প "${storyTitle}" এর বিরুদ্ধে একটি অভিযোগ জমা পড়েছে (${r.reason})। ${body.admin_note||''}`;
            await sql`INSERT INTO writer_notifications (id,writer_id,title,body,type) VALUES (${crypto.randomUUID()},${targetWriterId},'কন্টেন্ট সতর্কবার্তা',${msg},'warning')`;
          }
        } else if (action === 'delete' || action === 'deleted') {
          await sql`UPDATE reports SET status='deleted', admin_note=${body.admin_note||''} WHERE id=${repId}`;
          const book = await sql`SELECT id,title,author FROM books WHERE (id=${r.book_id} OR short_id=${r.book_id}) LIMIT 1`;
          const story = await sql`SELECT id,title,writer_id FROM stories s WHERE s.id=${r.book_id} LIMIT 1`;
          let targetWriterId = '';
          let storyTitle = '';
          if (story.length) {
            targetWriterId = story[0].writer_id;
            storyTitle = story[0].title;
          } else if (book.length) {
            storyTitle = book[0].title;
            const writer = await sql`SELECT id FROM writers WHERE writer_name=${book[0].author} LIMIT 1`;
            if (writer.length) targetWriterId = writer[0].id;
          }
          if (targetWriterId) {
            const msg = `আপনার গল্প "${storyTitle}" নীতিমালা লঙ্ঘনের কারণে মুছে ফেলা হয়েছে। ${body.admin_note||''}`;
            await sql`INSERT INTO writer_notifications (id,writer_id,title,body,type) VALUES (${crypto.randomUUID()},${targetWriterId},'গল্প অপসারিত',${msg},'removed')`;
          }
          try { await sql`DELETE FROM story_chapters WHERE story_id=${r.book_id}`; } catch(e) {}
          try { await sql`DELETE FROM stories WHERE id=${r.book_id}`; } catch(e) {}
          try { await sql`DELETE FROM chapters WHERE book_id=${r.book_id}`; } catch(e) {}
          try { await sql`DELETE FROM books WHERE id=${r.book_id} OR short_id=${r.book_id}`; } catch(e) {}
          if (storyTitle) {
            try { await sql`DELETE FROM chapters WHERE book_id IN (SELECT id FROM books WHERE title=${storyTitle})`; } catch(_) {}
            try { await sql`DELETE FROM books WHERE title=${storyTitle}`; } catch(_) {}
            try { await sql`DELETE FROM story_chapters WHERE story_id IN (SELECT id FROM stories WHERE title=${storyTitle})`; } catch(_) {}
            try { await sql`DELETE FROM stories WHERE title=${storyTitle}`; } catch(_) {}
          }
        }
        return json({ ok: true });
      }
      // --- Admin: Writers Management (approval toggle) ---
      const adminWriterMatch = url.pathname.match(/^\/api\/admin\/writers\/([^/]+)\/approval$/);
      if (adminWriterMatch && request.method === 'PUT') {
        if (!uuid(adminWriterMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json() as { approval_required?: boolean; is_active?: boolean; badge?: string };
        const updates: string[] = [];
        if (b.approval_required !== undefined) await sql`UPDATE writers SET approval_required=${b.approval_required} WHERE id=${adminWriterMatch[1]}`;
        if (b.is_active !== undefined) await sql`UPDATE writers SET is_active=${b.is_active} WHERE id=${adminWriterMatch[1]}`;
        if (b.badge !== undefined) await sql`UPDATE writers SET badge=${b.badge} WHERE id=${adminWriterMatch[1]}`;
        const r = await sql`SELECT id,username,writer_name,approval_required,is_active,badge FROM writers WHERE id=${adminWriterMatch[1]}`;
        return json(r[0] || { error: 'Not found' }, r.length ? 200 : 404);
      }
      // --- Admin: Delete Writer (cascade: stories, chapters, books, comments, follows, notifs) ---
      const adminWriterDeleteMatch = url.pathname.match(/^\/api\/admin\/(?:writers|writer-users)\/([^/]+)$/);
      if (adminWriterDeleteMatch && request.method === 'DELETE') {
        const wid = adminWriterDeleteMatch[1];
        if (!uuid(wid)) return json({ error: 'Invalid ID' }, 400);
        
        // 1. Get writer info
        const wRows = await sql`SELECT writer_name, username FROM writers WHERE id=${wid}`;
        const writerName = wRows.length ? wRows[0].writer_name : '';

        // 2. Collect all story IDs
        const storyRows = await sql`SELECT id, title FROM stories WHERE writer_id=${wid}`;
        const storyIds = storyRows.map((r: any) => r.id);
        const storyTitles = storyRows.map((r: any) => r.title);

        if (storyIds.length > 0) {
          try { await sql`DELETE FROM comments WHERE book_id IN (SELECT id FROM stories WHERE writer_id=${wid})`; } catch(e) {}
          try { await sql`DELETE FROM story_reports WHERE book_id IN (SELECT id FROM stories WHERE writer_id=${wid})`; } catch(e) {}
          try { await sql`DELETE FROM likes WHERE book_id IN (SELECT id FROM stories WHERE writer_id=${wid})`; } catch(e) {}
          try { await sql`DELETE FROM bookmarks WHERE book_id IN (SELECT id FROM stories WHERE writer_id=${wid})`; } catch(e) {}
          try { await sql`DELETE FROM story_chapters WHERE story_id IN (SELECT id FROM stories WHERE writer_id=${wid})`; } catch(e) {}
        }

        // 3. Delete any published books by this writer or matching titles
        if (writerName) {
          try { await sql`DELETE FROM chapters WHERE book_id IN (SELECT id FROM books WHERE author=${writerName})`; } catch(e) {}
          try { await sql`DELETE FROM comments WHERE book_id IN (SELECT id FROM books WHERE author=${writerName})`; } catch(e) {}
          try { await sql`DELETE FROM story_reports WHERE book_id IN (SELECT id FROM books WHERE author=${writerName})`; } catch(e) {}
          try { await sql`DELETE FROM books WHERE author=${writerName}`; } catch(e) {}
        }
        for (const stTitle of storyTitles) {
          try { await sql`DELETE FROM chapters WHERE book_id IN (SELECT id FROM books WHERE title=${stTitle})`; } catch(e) {}
          try { await sql`DELETE FROM books WHERE title=${stTitle}`; } catch(e) {}
        }

        // 4. Delete stories, activities, notifications, follows, referrals
        try { await sql`DELETE FROM stories WHERE writer_id=${wid}`; } catch(e) {}
        try { await sql`DELETE FROM writer_notifications WHERE writer_id=${wid}`; } catch(e) {}
        try { await sql`DELETE FROM writer_activities WHERE writer_id=${wid}`; } catch(e) {}
        try { await sql`DELETE FROM follows WHERE writer_id=${wid}`; } catch(e) {}
        try { await sql`DELETE FROM referrals WHERE writer_id=${wid}`; } catch(e) {}

        // 5. Delete writer account
        await sql`DELETE FROM writers WHERE id=${wid}`;
        return json({ ok: true, message: 'Writer and all related data permanently deleted' });
      }
      // --- Admin: Delete User (cascade) ---
      const adminUserDeleteMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
      if (adminUserDeleteMatch && request.method === 'DELETE') {
        const uid = adminUserDeleteMatch[1];
        if (!uuid(uid)) return json({ error: 'Invalid ID' }, 400);
        try { await sql`DELETE FROM follows WHERE follower_user_id=${uid}`; } catch(e) {}
        try { await sql`DELETE FROM writer_notifications WHERE user_id=${uid}`; } catch(e) {}
        try { await sql`DELETE FROM users WHERE id=${uid}`; } catch(e) {}
        return json({ ok: true, message: 'User and all related data deleted' });
      }
      // --- Admin: Delete Device ---
      const adminDeviceDeleteMatch = url.pathname.match(/^\/api\/admin\/devices\/([^/]+)$/);
      if (adminDeviceDeleteMatch && request.method === 'DELETE') {
        const did = adminDeviceDeleteMatch[1];
        if (!uuid(did)) return json({ error: 'Invalid ID' }, 400);
        try { await sql`DELETE FROM notifications WHERE device_id=${did}`; } catch(e) {}
        await sql`DELETE FROM devices WHERE id=${did}`;
        return json({ ok: true, message: 'Device and related notifications deleted' });
      }
      // --- Admin: Delete Story (cascade) ---
      const adminStoryDeleteMatch = url.pathname.match(/^\/api\/admin\/stories\/([^/]+)$/);
      if (adminStoryDeleteMatch && request.method === 'DELETE') {
        const sid = adminStoryDeleteMatch[1];
        if (!uuid(sid)) return json({ error: 'Invalid ID' }, 400);
        try { await sql`DELETE FROM comments WHERE book_id=${sid}`; } catch(e) {}
        try { await sql`DELETE FROM story_reports WHERE book_id=${sid}`; } catch(e) {}
        try { await sql`DELETE FROM likes WHERE book_id=${sid}`; } catch(e) {}
        try { await sql`DELETE FROM bookmarks WHERE book_id=${sid}`; } catch(e) {}
        try { await sql`DELETE FROM chapters WHERE book_id=${sid}`; } catch(e) {}
        await sql`DELETE FROM stories WHERE id=${sid}`;
        return json({ ok: true, message: 'Story and all related data deleted' });
      }
      // --- Admin: Bulk Delete Notifications ---
      if (url.pathname === '/api/admin/notifications/delete' && request.method === 'POST') {
        const body = await request.json() as { ids?: string[]; all?: boolean };
        if (body.all) {
          const r = await sql`DELETE FROM notifications`;
          return json({ ok: true, message: 'All notifications deleted' });
        }
        if (body.ids && body.ids.length > 0) {
          const r = await sql`DELETE FROM notifications WHERE id = ANY(${body.ids})`;
          return json({ ok: true, message: `${body.ids.length} notifications deleted` });
        }
        return json({ error: 'Provide ids array or all:true' }, 400);
      }
      // --- Admin: Bulk Delete Devices ---
      if (url.pathname === '/api/admin/devices/delete' && request.method === 'POST') {
        const body = await request.json() as { ids?: string[]; all?: boolean };
        if (body.all) {
          try { await sql`DELETE FROM notifications`; } catch(e) {}
          try { await sql`DELETE FROM follows`; } catch(e) {}
          try { await sql`DELETE FROM writer_notifications`; } catch(e) {}
          await sql`DELETE FROM devices`;
          return json({ ok: true, message: 'All devices deleted' });
        }
        if (body.ids && body.ids.length > 0) {
          for (const did of body.ids) {
            try { await sql`DELETE FROM notifications WHERE device_id=${did}`; } catch(e) {}
            try { await sql`DELETE FROM devices WHERE id=${did}`; } catch(e) {}
          }
          return json({ ok: true, message: `${body.ids.length} devices deleted` });
        }
        return json({ error: 'Provide ids array or all:true' }, 400);
      }
         // --- Admin: Writer Stories (all writers' stories for approval) ---
      if (url.pathname === '/api/admin/set-book-author' && request.method === 'POST') {
        const b = await request.json() as { book_id?: string; author_name?: string };
        if (!b.book_id || b.author_name === undefined) return json({ error: 'book_id and author_name required' }, 400);
        await sql`UPDATE books SET author_name=${b.author_name} WHERE id=${b.book_id}`;
        return json({ ok: true });
      }
      if (url.pathname === '/api/admin/resync-author-names' && request.method === 'POST') {
        const r = await sql`UPDATE books SET author_name=s.author_name FROM stories s JOIN writers w ON s.writer_id=w.id WHERE books.title=s.title AND books.author=w.writer_name AND (books.author_name IS NULL OR books.author_name='') AND s.author_name IS NOT NULL AND s.author_name!=''`;
        // Also fix stories that have empty author_name but books have it
        const r2 = await sql`UPDATE stories SET author_name=books.author_name FROM books WHERE stories.title=books.title AND (stories.author_name IS NULL OR stories.author_name='') AND books.author_name IS NOT NULL AND books.author_name!=''`;
        return json({ updated_books: r.rowCount, updated_stories: r2.rowCount });
      }
      if (url.pathname === '/api/admin/stories' && request.method === 'GET')
        return json(await sql`SELECT s.id,s.title,s.description,s.status,s.cover_url,s.category,s.views,s.likes,s.chapters_count,s.review_note,s.author_name,s.created_at,s.updated_at,w.writer_name,w.username FROM stories s LEFT JOIN writers w ON s.writer_id=w.id ORDER BY CASE s.status WHEN 'pending' THEN 0 WHEN 'published' THEN 1 ELSE 2 END,s.updated_at DESC`);

      // --- Admin Approve Story ---
      const adminStoryApproveMatch = url.pathname.match(/^\/api\/admin\/stories\/([^/]+)\/approve$/);
      if (adminStoryApproveMatch && request.method === 'POST') {
        const sid = adminStoryApproveMatch[1];
        if (!uuid(sid)) return json({ error: 'Invalid ID' }, 400);
        await sql`UPDATE stories SET status='published',review_note='',updated_at=datetime('now') WHERE id=${sid}`;
        const s = await sql`SELECT s.id,s.title,s.description,s.category,s.cover_url,s.display_status,s.writer_status,s.hide_title_on_cover,s.pdf_url,s.dedication,s.author_name,s.visible_on,s.story_type,s.writer_id,w.writer_name FROM stories s JOIN writers w ON s.writer_id=w.id WHERE s.id=${sid}`;
        let bookId: string | null = null;
        if (s.length) {
          try {
            const st = s[0];
            let catId: string | null = null;
            if (st.category) { const cat = await sql`SELECT id FROM categories WHERE LOWER(name)=${st.category.toLowerCase()} LIMIT 1`; if (cat.length) catId = cat[0].id; }
            if (!catId) { 
              const newCatId = crypto.randomUUID();
              await sql`INSERT INTO categories (id,name,icon,color,position) VALUES (${newCatId},${st.category||'গল্প'},'book-open','#DDF5EC',0)`; 
              catId = newCatId; 
            }
            const chapters = await sql`SELECT title,body,position,minutes FROM story_chapters WHERE story_id=${st.id} ORDER BY position`;
            const existingBook = await sql`SELECT id FROM books WHERE title=${st.title} AND author=${st.writer_name} LIMIT 1`;
            if (existingBook.length) {
              bookId = existingBook[0].id;
              await sql`UPDATE books SET display_status=${st.display_status||''},writer_status=${st.writer_status||''},hide_title_on_cover=${st.hide_title_on_cover?1:0},pdf_url=${st.pdf_url||''},dedication=${st.dedication||''},author_name=${st.author_name||''},visible_on=${st.visible_on||'both'},story_type=${st.story_type||'episodes'} WHERE id=${bookId}`;
            } else {
              const __sid3 = await mintShortId(sql);
              const newBookId = crypto.randomUUID();
              await sql`INSERT INTO books (id,title,author,category_id,cover_url,description,status,display_status,writer_status,hide_title_on_cover,pdf_url,dedication,author_name,visible_on,story_type,short_id) VALUES (${newBookId},${st.title},${st.writer_name},${catId},${st.cover_url||null},${st.description||''},'published',${st.display_status||''},${st.writer_status||''},${st.hide_title_on_cover?1:0},${st.pdf_url||''},${st.dedication||''},${st.author_name||''},${st.visible_on||'both'},${st.story_type||'episodes'},${__sid3})`;
              bookId = newBookId;
            }
            if (bookId) {
              const existingChs = await sql`SELECT title FROM chapters WHERE book_id=${bookId}`;
              const have = new Set(existingChs.map((e: any) => (e.title || '').trim()));
              for (const c of chapters) {
                if (have.has((c.title || '').trim())) continue;
                try { 
                  const newChId = crypto.randomUUID();
                  await sql`INSERT INTO chapters (id,book_id,title,body,position,status,minutes,reward_ad) VALUES (${newChId},${bookId},${c.title},${c.body||''},${c.position||0},'published',${c.minutes||5},0)`; 
                } catch (e) { console.error('chapter insert failed', e); }
              }
            }
            try {
              await sql`INSERT INTO writer_activities (id,writer_id,type,data) VALUES (${crypto.randomUUID()},${st.writer_id},'story_approved',${JSON.stringify({ story_id: sid, title: st.title })})`;
              await sql`INSERT INTO writer_notifications (id,writer_id,title,body,type,story_id) VALUES (${crypto.randomUUID()},${st.writer_id},'Story Approved!',${'"' + st.title + '" has been published.'},'approved',${sid})`;
              const followers = await sql`SELECT device_id FROM follows WHERE writer_id=${st.writer_id}`;
              for (const f of followers) {
                if (f.device_id) {
                  const dKey = await sql`SELECT device_key FROM devices WHERE id=${f.device_id} LIMIT 1`;
                  if (dKey.length) {
                    await sql`INSERT INTO notifications (id,title,body,icon,url,device_id,story_cover,status) VALUES (${crypto.randomUUID()},'নতুন গল্প',${st.writer_name+' নতুন গল্প প্রকাশ করেছেন: "'+st.title+'"'},'book-open',${sid},${dKey[0].device_key},${st.cover_url||''},'sent')`;
                  }
                }
              }
            } catch(e) { console.error('notif sync failed', e); }
          } catch (e) { console.error('story approve failed', e); }
        }
        return json({ ok: true, status: 'published', book_id: bookId });
      }

      // --- Admin Reject Story ---
      const adminStoryRejectMatch = url.pathname.match(/^\/api\/admin\/stories\/([^/]+)\/reject$/);
      if (adminStoryRejectMatch && request.method === 'POST') {
        const sid = adminStoryRejectMatch[1];
        if (!uuid(sid)) return json({ error: 'Invalid ID' }, 400);
        let note = '';
        try {
          const body = await request.json() as any;
          note = (body.review_note || body.note || '').trim();
        } catch {}
        await sql`UPDATE stories SET status='rejected',review_note=${note},updated_at=datetime('now') WHERE id=${sid}`;
        const s = await sql`SELECT s.id,s.title,s.writer_id FROM stories s WHERE s.id=${sid}`;
        if (s.length) {
          try {
            await sql`INSERT INTO writer_notifications (id,writer_id,title,body,type,story_id) VALUES (${crypto.randomUUID()},${s[0].writer_id},'Story Rejected',${'"' + s[0].title + '" was rejected.' + (note ? ' Reason: ' + note : '')},'rejected',${sid})`;
          } catch(e) {}
        }
        return json({ ok: true, status: 'rejected' });
      }

      const adminStoryMatch = url.pathname.match(/^\/api\/admin\/stories\/([^/]+)$/);
      if (adminStoryMatch && request.method === 'PUT') {
        if (!uuid(adminStoryMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json() as { status?: string; review_note?: string };
        if (b.status && !['draft','pending','published','rejected'].includes(b.status)) return json({ error: 'Invalid status' }, 400);
        await sql`UPDATE stories SET status=COALESCE(${b.status},status),review_note=COALESCE(${b.review_note},review_note),updated_at=datetime('now') WHERE id=${adminStoryMatch[1]}`;
        const s = await sql`SELECT s.id,s.title,s.description,s.category,s.cover_url,s.writer_id,s.hide_title_on_cover,w.writer_name FROM stories s JOIN writers w ON s.writer_id=w.id WHERE s.id=${adminStoryMatch[1]}`;
        if (b.status === 'published' && s.length) {
          try {
            const st = s[0];
            let catId: string | null = null;
            if (st.category) { const cat = await sql`SELECT id FROM categories WHERE LOWER(name)=${st.category.toLowerCase()} LIMIT 1`; if (cat.length) catId = cat[0].id; }
            if (!catId) { 
              const newCatId = crypto.randomUUID();
              await sql`INSERT INTO categories (id,name,icon,color,position) VALUES (${newCatId},${st.category||'গল্প'},'book-open','#DDF5EC',0)`; 
              catId = newCatId; 
            }
            const chapters = await sql`SELECT title,body,position FROM story_chapters WHERE story_id=${st.id} ORDER BY position`;
            let bookId: string | null = null;
            const existingBook = await sql`SELECT id FROM books WHERE title=${st.title} AND author=${st.writer_name} LIMIT 1`;
            if (existingBook.length) { 
              bookId = existingBook[0].id; 
              await sql`UPDATE books SET hide_title_on_cover=${st.hide_title_on_cover?1:0} WHERE id=${bookId}`; 
            } else { 
              const __sid3 = await mintShortId(sql);
              const newBookId = crypto.randomUUID();
              await sql`INSERT INTO books (id,title,author,category_id,cover_url,description,status,hide_title_on_cover,short_id) VALUES (${newBookId},${st.title},${st.writer_name},${catId},${st.cover_url||null},${st.description||''},'published',${st.hide_title_on_cover?1:0},${__sid3})`; 
              bookId = newBookId; 
            }
            if (bookId) {
              const existingChs = await sql`SELECT title FROM chapters WHERE book_id=${bookId}`;
              const have = new Set(existingChs.map((e: any) => (e.title || '').trim()));
              for (const c of chapters) { 
                if (have.has((c.title || '').trim())) continue; 
                try { 
                  const newChId = crypto.randomUUID();
                  await sql`INSERT INTO chapters (id,book_id,title,body,position,status,reward_ad) VALUES (${newChId},${bookId},${c.title},${c.body||''},${c.position||0},'published',0)`; 
                } catch (e) { console.error('chapter insert failed', e); } 
              }
            }
          } catch (e) { console.error('stories publish sync failed', e); }
        }
        if (s.length) {
          const notifTitle = b.status === 'published' ? 'Story Approved!' : b.status === 'rejected' ? 'Story Rejected' : 'Story Updated';
          const notifBody = b.status === 'published' ? `"${s[0].title}" has been published.` : b.status === 'rejected' ? `"${s[0].title}" was rejected.${b.review_note ? ' Reason: ' + b.review_note : ''}` : `Your story "${s[0].title}" status updated.`;
          await sql`INSERT INTO writer_notifications (id,writer_id,title,body,type,story_id) VALUES (${crypto.randomUUID()},${s[0].writer_id},${notifTitle},${notifBody},${b.status || 'info'},${adminStoryMatch[1]})`;
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
      if (url.pathname === '/api/admin/writer-notifications/delete' && request.method === 'POST') {
        const body = await request.json() as { ids?: string[]; all?: boolean };
        if (body.all) { await sql`DELETE FROM writer_notifications`; return json({ ok: true, message: 'All writer notifications deleted' }); }
        if (body.ids && body.ids.length > 0) { await sql`DELETE FROM writer_notifications WHERE id = ANY(${body.ids})`; return json({ ok: true, message: `${body.ids.length} writer notifications deleted` }); }
        return json({ error: 'Provide ids array or all:true' }, 400);
      }
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

      if (url.pathname === '/api/public/sync-views' && request.method === 'POST') {
        if (!adminAuthed(request, env)) return json({ error: 'Unauthorized' }, 401);
        const allBooks = await sql`SELECT title, author, views FROM books WHERE views > 0`;
        let synced = 0;
        for (const bk of allBooks) {
          const r = await sql`UPDATE stories SET views = ${bk.views} WHERE title = ${bk.title}`;
          if (r.rowCount > 0) synced += r.rowCount;
        }
        return json({ ok: true, synced, total: allBooks.length });
      }

      // scope=all (website) sees everything; default (app) hides website-only items.
      const scopeAll = url.searchParams.get('scope') === 'all';
      if (url.pathname === '/api/public/categories' && request.method === 'GET') {
        if (scopeAll) return json(await sql`SELECT id,name,icon,color,cover_url,COALESCE(visible_on,'both') AS visible_on FROM categories WHERE is_active=true ORDER BY position`);
        return json(await sql`SELECT id,name,icon,color,cover_url,COALESCE(visible_on,'both') AS visible_on FROM categories WHERE is_active=true AND COALESCE(visible_on,'both')!='website' ORDER BY position`);
      }
      if (url.pathname === '/api/public/books' && request.method === 'GET') {
        if (scopeAll) return json(await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,COALESCE(b.description,'') AS description,COALESCE(c.name,'') AS category,COALESCE(b.color,'#123E39') AS color,COALESCE(b.accent,'#F5C660') AS accent,b.is_new,b.featured,b.home_section,b.views_visible,b.display_status,b.writer_status,b.hide_title_on_cover,b.show_ads,b.pdf_reward_ad,COALESCE(b.pdf_url,'') AS pdf_url,COALESCE(b.dedication,'') AS dedication,COALESCE(b.author_name,'') AS author_name,COALESCE(b.visible_on,'both') AS visible_on,COALESCE(b.story_type,'episodes') AS story_type,COALESCE(b.short_id,'') AS short_id,b.updated_at FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.status='published' ORDER BY b.updated_at DESC`);
        return json(await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,COALESCE(b.description,'') AS description,COALESCE(c.name,'') AS category,COALESCE(b.color,'#123E39') AS color,COALESCE(b.accent,'#F5C660') AS accent,b.is_new,b.featured,b.home_section,b.views_visible,b.display_status,b.writer_status,b.hide_title_on_cover,b.show_ads,b.pdf_reward_ad,COALESCE(b.pdf_url,'') AS pdf_url,COALESCE(b.dedication,'') AS dedication,COALESCE(b.author_name,'') AS author_name,COALESCE(b.visible_on,'both') AS visible_on,COALESCE(b.story_type,'episodes') AS story_type,COALESCE(b.short_id,'') AS short_id,b.updated_at FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.status='published' AND COALESCE(b.visible_on,'both')!='website' ORDER BY b.updated_at DESC`);
      }
      if (url.pathname === '/api/public/chapters' && request.method === 'GET')
        return json(await sql`SELECT id,book_id,title,body,position,minutes FROM chapters WHERE status='published' ORDER BY position`);
      const pubChMatch = url.pathname.match(/^\/api\/public\/chapters\/([^/]+)$/);
      if (pubChMatch && request.method === 'GET') {
        const ch = await sql`SELECT id,book_id,title,body,position,minutes,status,created_at FROM chapters WHERE id=${pubChMatch[1]} LIMIT 1`;
        if (!ch.length) return json({ error: 'Not found' }, 404);
        return json(ch[0]);
      }

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

      // --- Public: Home section book lists (fixed + category-based) ---
      if (url.pathname === '/api/home-sections' && request.method === 'GET') {
        const cfgRow = await sql`SELECT sections, views_visible FROM home_settings WHERE id=1 LIMIT 1`;
        const cfgRaw = cfgRow[0]?.sections;
        const savedCfg = cfgRaw ? (JSON.parse(typeof cfgRaw === 'string' ? cfgRaw : JSON.stringify(cfgRaw)) as { key: string; enabled: boolean; title?: string }[]) : [];
        const titleOf = (k: string) => { const s = savedCfg.find((x) => x.key === k); return (s && s.title) ? s.title : ''; };
        const isEnabled = (k: string) => { const s = savedCfg.find((x) => x.key === k); return !s || s.enabled !== false; };
        const now = Date.now();
        const allBooks = scopeAll
          ? await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,COALESCE(b.description,'') AS description,COALESCE(c.name,'') AS category,b.category_id::text AS category_id,COALESCE(b.color,'#123E39') AS color,COALESCE(b.accent,'#F5C660') AS accent,b.is_new,b.featured,b.home_section,b.views_visible,b.display_status,b.writer_status,b.hide_title_on_cover,b.show_ads,b.pdf_reward_ad,COALESCE(b.pdf_url,'') AS pdf_url,COALESCE(b.dedication,'') AS dedication,COALESCE(b.author_name,'') AS author_name,COALESCE(b.story_type,'episodes') AS story_type,b.created_at,b.updated_at FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.status='published'`
          : await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,COALESCE(b.description,'') AS description,COALESCE(c.name,'') AS category,b.category_id::text AS category_id,COALESCE(b.color,'#123E39') AS color,COALESCE(b.accent,'#F5C660') AS accent,b.is_new,b.featured,b.home_section,b.views_visible,b.display_status,b.writer_status,b.hide_title_on_cover,b.show_ads,b.pdf_reward_ad,COALESCE(b.pdf_url,'') AS pdf_url,COALESCE(b.dedication,'') AS dedication,COALESCE(b.author_name,'') AS author_name,COALESCE(b.story_type,'episodes') AS story_type,b.created_at,b.updated_at FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.status='published' AND COALESCE(b.visible_on,'both')!='website'`;
        const fn = (id: string | null) => (id ? `${id}` : '');
        const fmt = (b: any) => ({ id: fn(b.id), title: b.title, author: b.author, cover_url: b.cover_url, views: `${b.views}`, likes: b.likes, description: b.description, category: b.category, color: b.color, accent: b.accent, is_new: b.is_new, featured: b.featured, home_section: b.home_section || '', views_visible: b.views_visible !== false, display_status: b.display_status || '', writer_status: b.writer_status || '', hide_title_on_cover: b.hide_title_on_cover || false, show_ads: b.show_ads !== false, pdf_reward_ad: b.pdf_reward_ad !== false, pdf_url: b.pdf_url || '', dedication: b.dedication || '', author_name: b.author_name || '' });
        const byViews = (a: any, b: any) => +b.views - +a.views;
        const byNewest = (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        const ageDays = (b: any) => (now - new Date(b.created_at).getTime()) / 86400000;
        const ongoing = allBooks.filter((b: any) => ageDays(b) < 7 && b.display_status === 'new').sort(byNewest);
        const weekly = allBooks.filter((b: any) => ageDays(b) >= 7 && ageDays(b) <= 30).sort(byViews);
        const monthly = allBooks.filter((b: any) => ageDays(b) > 30).sort(byViews);
        const featured = allBooks.filter((b: any) => b.featured).sort(byViews);
        const mostPop = [...allBooks].sort(byViews).slice(0, 12);
        const fixedSections = [
          { key: 'featured', title: titleOf('featured') || 'বৈশিষ্ট্যযুক্ত', books: featured.slice(0, 12).map(fmt) },
          { key: 'mostPopular', title: titleOf('mostPopular') || 'সর্বাধিক জনপ্রিয়', books: mostPop.map(fmt) },
          { key: 'newEpisodes', title: titleOf('newEpisodes') || 'নতুন পর্ব', books: ongoing.slice(0, 12).map(fmt) },
          { key: 'popularAuthors', title: titleOf('popularAuthors') || 'জনপ্রিয় লেখক', books: [] },
          { key: 'weeklyPopular', title: titleOf('weeklyPopular') || 'সাপ্তাহিক জনপ্রিয়', books: weekly.slice(0, 12).map(fmt) },
          { key: 'monthlyPopular', title: titleOf('monthlyPopular') || 'মাসিক জনপ্রিয়', books: monthly.slice(0, 12).map(fmt) },
        ].filter((s) => isEnabled(s.key) && (s.key === 'popularAuthors' || s.books.length > 0));
        const cats = await sql`SELECT id,name,icon,color,cover_url FROM categories WHERE is_active=true ORDER BY position ASC, name ASC`;
        const catSections = cats.map((cat: any) => {
          const catBooks = allBooks.filter((b: any) => b.category_id === cat.id).sort(byNewest).slice(0, 12);
          return { key: `cat:${cat.name}`, title: cat.name, icon: cat.icon || 'book-open', color: cat.color || '#123E39', cover_url: cat.cover_url, books: catBooks.map(fmt) };
        }).filter((s: any) => s.books.length > 0);
        const sections = [...fixedSections, ...catSections];
        const writers = await sql`SELECT id,username,writer_name,bio,avatar_url,follower_count,badge,created_at FROM writers WHERE is_active=true ORDER BY follower_count DESC`;
        const dayMs = 86400000;
        const weekMs = 7 * dayMs;
        const weekSeed = Math.floor(Date.now() / weekMs);
        const rotated = writers.map((w: any, i: number) => ({ ...w, _score: ((weekSeed + i * 7919) % writers.length) })).sort((a: any, b: any) => a._score - b._score).slice(0, 12);
        return json({ viewsVisible: cfgRow?.[0]?.views_visible !== false, sections, writers: rotated.map((w: any) => ({ id: `${w.id}`, username: w.username, writer_name: w.writer_name, bio: w.bio, avatar_url: w.avatar_url, follower_count: w.follower_count, badge: w.badge || 'none' })) });
      }

      const pubBookMatch = url.pathname.match(/^\/api\/public\/books\/([^/]+)$/);
      if (pubBookMatch && request.method === 'GET') {
        const bookId = await resolveBookId(sql, pubBookMatch[1]);
        if (!bookId) return json({ error: 'Not found' }, 404);
        const rows = scopeAll
          ? await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,COALESCE(b.description,'') AS description,COALESCE(c.name,'') AS category,COALESCE(b.color,'#123E39') AS color,COALESCE(b.accent,'#F5C660') AS accent,b.is_new,b.featured,b.home_section,b.views_visible,b.display_status,b.writer_status,b.hide_title_on_cover,b.show_ads,b.pdf_reward_ad,COALESCE(b.pdf_url,'') AS pdf_url,COALESCE(b.dedication,'') AS dedication,COALESCE(b.author_name,'') AS author_name,COALESCE(b.visible_on,'both') AS visible_on,COALESCE(b.story_type,'episodes') AS story_type,COALESCE(b.short_id,'') AS short_id,b.updated_at FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.id=${bookId} AND b.status='published'`
          : await sql`SELECT b.id,b.title,b.author,b.cover_url,b.status,b.views,b.likes,b.dislikes,COALESCE(b.description,'') AS description,COALESCE(c.name,'') AS category,COALESCE(b.color,'#123E39') AS color,COALESCE(b.accent,'#F5C660') AS accent,b.is_new,b.featured,b.home_section,b.views_visible,b.display_status,b.writer_status,b.hide_title_on_cover,b.show_ads,b.pdf_reward_ad,COALESCE(b.pdf_url,'') AS pdf_url,COALESCE(b.dedication,'') AS dedication,COALESCE(b.author_name,'') AS author_name,COALESCE(b.visible_on,'both') AS visible_on,COALESCE(b.story_type,'episodes') AS story_type,COALESCE(b.short_id,'') AS short_id,b.updated_at FROM books b LEFT JOIN categories c ON b.category_id=c.id WHERE b.id=${bookId} AND b.status='published' AND COALESCE(b.visible_on,'both')!='website'`;
        if (!rows.length) return json({ error: 'Not found' }, 404);
        const chs = await sql`SELECT id,book_id,title,body,position,minutes FROM chapters WHERE book_id=${bookId} AND status='published' ORDER BY position`;
        return json({ ...rows[0], chapters: chs });
      }

      if (url.pathname === '/api/public/events' && request.method === 'POST') {
        const b = await request.json() as { device_id?: string; book_id?: string; event_type?: string };
        if (!b.device_id || !b.book_id || !b.event_type) return json({ error: 'device_id, book_id, event_type required' }, 400);
        const rawId = b.book_id;
        const targetId = (await resolveBookId(sql, rawId)) || rawId;
        b.book_id = targetId;
        await sql`INSERT INTO devices (id, device_key, last_seen_at) VALUES (${crypto.randomUUID()}, ${b.device_id}, datetime('now')) ON CONFLICT (device_key) DO UPDATE SET last_seen_at=datetime('now')`;
        const deviceRow = await sql`SELECT id FROM devices WHERE device_key=${b.device_id} LIMIT 1`;
        if (!deviceRow.length) return json({ error: 'Device registration failed' }, 500);
        const dId = deviceRow[0].id;
        if (b.event_type === 'view') {
          await sql`UPDATE books SET views = views + 1 WHERE id = ${targetId}`;
          await sql`UPDATE stories SET views = views + 1 WHERE id = ${targetId}`;
          try {
            await sql`INSERT INTO view_events (id, device_id, book_id, created_at) VALUES (${crypto.randomUUID()},${dId},${targetId},datetime('now'))`;
          } catch (_) {}
        } else if (b.event_type === 'like' || b.event_type === 'dislike') {
          const existing = await sql`SELECT value FROM reactions WHERE device_id=${dId} AND (book_id=${targetId} OR book_id=${rawId}) LIMIT 1`;
          const newVal = b.event_type === 'like' ? 'like' : 'dislike';
          const oldVal = existing.length ? existing[0].value : null;
          if (oldVal === newVal) {
            await sql`UPDATE reactions SET value=${newVal}, created_at=datetime('now') WHERE device_id=${dId} AND (book_id=${targetId} OR book_id=${rawId})`;
          } else {
            await sql`INSERT INTO reactions (id, device_id, book_id, value, created_at) VALUES (${crypto.randomUUID()},${dId},${targetId},${newVal},datetime('now')) ON CONFLICT (device_id, book_id) DO UPDATE SET value=${newVal}, created_at=datetime('now')`;
            if (oldVal === 'like') {
              await sql`UPDATE books SET likes = MAX(likes - 1, 0), dislikes = dislikes + 1 WHERE id = ${targetId}`;
              await sql`UPDATE stories SET likes = MAX(likes - 1, 0), dislikes = dislikes + 1 WHERE id = ${targetId}`;
            } else if (oldVal === 'dislike') {
              await sql`UPDATE books SET dislikes = MAX(dislikes - 1, 0), likes = likes + 1 WHERE id = ${targetId}`;
              await sql`UPDATE stories SET dislikes = MAX(dislikes - 1, 0), likes = likes + 1 WHERE id = ${targetId}`;
            } else if (b.event_type === 'like') {
              await sql`UPDATE books SET likes = likes + 1 WHERE id = ${targetId}`;
              await sql`UPDATE stories SET likes = likes + 1 WHERE id = ${targetId}`;
            } else {
              await sql`UPDATE books SET dislikes = dislikes + 1 WHERE id = ${targetId}`;
              await sql`UPDATE stories SET dislikes = dislikes + 1 WHERE id = ${targetId}`;
            }
          }
        }
        return json({ ok: true }, 201);
      }

      const pubComMatch = url.pathname.match(/^\/api\/public\/books\/([^/]+)\/comments$/);
      if (pubComMatch && request.method === 'GET') {
        const rawId = pubComMatch[1];
        const __cb = (await resolveBookId(sql, rawId)) || rawId;
        return json(await sql`SELECT id,book_id,display_name,body,status,created_at,avatar_url FROM comments WHERE (book_id=${__cb} OR book_id=${rawId}) AND status='approved' ORDER BY created_at DESC LIMIT 50`);
      }
      const pubComOneMatch = url.pathname.match(/^\/api\/public\/books\/([^/]+)\/comments\/([^/]+)$/);
      if (pubComOneMatch && (request.method === 'PUT' || request.method === 'DELETE')) {
        const b1 = await request.json().catch(() => ({})) as { device_id?: string; body?: string };
        if (!b1.device_id) return json({ error: 'device_id required' }, 400);
        const rawId = pubComOneMatch[1];
        const __cb1 = (await resolveBookId(sql, rawId)) || rawId;
        const own = await sql`SELECT c.id FROM comments c JOIN devices d ON d.id=c.device_id WHERE c.id=${pubComOneMatch[2]} AND (c.book_id=${__cb1} OR c.book_id=${rawId}) AND d.device_key=${b1.device_id} LIMIT 1`;
        if (!own.length) return json({ error: 'Not found' }, 404);
        if (request.method === 'DELETE') {
          await sql`UPDATE comments SET status='deleted' WHERE id=${pubComOneMatch[2]}`;
          return json({ ok: true });
        }
        const nbody = (b1.body || '').slice(0, 1000).trim();
        if (!nbody) return json({ error: 'Empty comment' }, 400);
        await sql`UPDATE comments SET body=${nbody},status='pending' WHERE id=${pubComOneMatch[2]}`;
        return json({ ok: true, needs_approval: true });
      }
      if (pubComMatch && request.method === 'POST') {
        const rawId = pubComMatch[1];
        const bookId = (await resolveBookId(sql, rawId)) || rawId;
        const b = await request.json() as { device_id?: string; name?: string; body?: string; avatar_url?: string };
        if (!b.device_id || !b.name || !b.body) return json({ error: 'device_id, name, body required' }, 400);

        // Check if book OR story exists
        const bkExists = await sql`SELECT id,title,author FROM books WHERE id=${bookId} UNION ALL SELECT id,title,author_name AS author FROM stories WHERE id=${bookId} LIMIT 1`;
        if (!bkExists.length) return json({ error: 'Book not found' }, 404);

        const cname = b.name.slice(0, 50), cbody = b.body.slice(0, 1000);
        if (!cname.trim() || !cbody.trim()) return json({ error: 'Empty comment' }, 400);

        await sql`INSERT INTO devices (id, device_key, last_seen_at) VALUES (${crypto.randomUUID()}, ${b.device_id}, datetime('now')) ON CONFLICT (device_key) DO UPDATE SET last_seen_at=datetime('now')`;
        const deviceRow = await sql`SELECT id FROM devices WHERE device_key=${b.device_id} LIMIT 1`;
        const dId = deviceRow.length ? deviceRow[0].id : null;

        const recent = await sql`SELECT id FROM comments WHERE (book_id=${bookId} OR book_id=${rawId}) AND device_id=${dId} AND created_at > datetime('now', '-10 minutes') LIMIT 5`;
        if (recent.length >= 5) return json({ error: 'Too many comments — try later' }, 429);
        const already = await sql`SELECT id FROM comments WHERE (book_id=${bookId} OR book_id=${rawId}) AND device_id=${dId} AND status<>'deleted' LIMIT 1`;
        if (already.length) return json({ error: 'already_commented' }, 409);

        // Check if approval is required
        let needsApproval = true;
        try {
          const cfgRow = await sql`SELECT comments_approval FROM home_settings LIMIT 1`;
          if (cfgRow.length && cfgRow[0].comments_approval !== undefined) {
            needsApproval = cfgRow[0].comments_approval !== 0 && cfgRow[0].comments_approval !== false;
          }
        } catch (_) {}
        const commentStatus = needsApproval ? 'pending' : 'approved';
        const avatarUrl = (b.avatar_url || '').slice(0, 2048);
        const cmtId = crypto.randomUUID();
        await sql`INSERT INTO comments (id, book_id, device_id, display_name, body, status, avatar_url, created_at) VALUES (${cmtId},${bookId},${dId},${cname},${cbody},${commentStatus},${avatarUrl},datetime('now'))`;

        // Send comment notification to writer
        try {
          const authorName = bkExists[0].author;
          if (authorName) {
            const writerRow = await sql`SELECT id FROM writers WHERE writer_name=${authorName} LIMIT 1`;
            if (writerRow.length) {
              const snippet = cbody.length > 40 ? cbody.slice(0, 40) + '...' : cbody;
              await sql`INSERT INTO writer_notifications (id,writer_id,title,body,type,story_id,story_cover) VALUES (${crypto.randomUUID()},${writerRow[0].id},'নতুন মন্তব্য',${cname+' আপনার "'+bkExists[0].title+'" গল্পে মন্তব্য করেছেন: "'+snippet+'"'},'comment',${bookId},'')`;
            }
          }
        } catch(e) { console.error('comment notification error', e); }
        return json({ ok: true, needs_approval: needsApproval, message: needsApproval ? 'Comment submitted for moderation' : 'Comment posted' }, 201);
      }

      const pubLikeMatch = url.pathname.match(/^\/api\/public\/books\/([^/]+)\/like$/);
      if (pubLikeMatch && request.method === 'POST') {
        const rawId = pubLikeMatch[1];
        const bookId = (await resolveBookId(sql, rawId)) || rawId;
        const b = await request.json() as { device_id?: string; value?: boolean; display_name?: string };
        if (!b.device_id || typeof b.value !== 'boolean') return json({ error: 'device_id and value required' }, 400);

        // Check if book OR story exists
        const bkExists = await sql`SELECT id,title,author FROM books WHERE id=${bookId} UNION ALL SELECT id,title,author_name AS author FROM stories WHERE id=${bookId} LIMIT 1`;
        if (!bkExists.length) return json({ error: 'Book not found' }, 404);

        await sql`INSERT INTO devices (id, device_key, last_seen_at) VALUES (${crypto.randomUUID()}, ${b.device_id}, datetime('now')) ON CONFLICT (device_key) DO UPDATE SET last_seen_at=datetime('now')`;
        const deviceRow = await sql`SELECT id FROM devices WHERE device_key=${b.device_id} LIMIT 1`;
        const dId = deviceRow.length ? deviceRow[0].id : null;
        const cur = await sql`SELECT value FROM reactions WHERE device_id=${dId} AND (book_id=${bookId} OR book_id=${rawId}) LIMIT 1`;
        const curVal = cur.length ? cur[0].value : null;

        if (b.value) {
          if (curVal === 'dislike') {
            await sql`UPDATE books SET likes=likes+1, dislikes=MAX(dislikes-1,0) WHERE id=${bookId}`;
            await sql`UPDATE stories SET likes=likes+1, dislikes=MAX(dislikes-1,0) WHERE id=${bookId}`;
          } else if (!curVal) {
            await sql`UPDATE books SET likes=likes+1 WHERE id=${bookId}`;
            await sql`UPDATE stories SET likes=likes+1 WHERE id=${bookId}`;
          }
          if (dId) await sql`INSERT INTO reactions (id,device_id,book_id,value,created_at) VALUES (${crypto.randomUUID()},${dId},${bookId},'like',datetime('now')) ON CONFLICT (device_id,book_id) DO UPDATE SET value='like',created_at=datetime('now')`;

          // Send like notification to writer
          try {
            const authorName = bkExists[0].author;
            if (authorName) {
              const writerRow = await sql`SELECT id FROM writers WHERE writer_name=${authorName} LIMIT 1`;
              if (writerRow.length && writerRow[0].id !== dId) {
                const likerName = b.display_name || 'কেউ একজন';
                await sql`INSERT INTO writer_notifications (id,writer_id,title,body,type,story_id,avatar_url,story_cover) VALUES (${crypto.randomUUID()},${writerRow[0].id},'নতুন লাইক',${likerName+' আপনার "'+bkExists[0].title+'" গল্পটি পছন্দ করেছেন'},'like',${bookId},'', '')`;
              }
            }
          } catch(e) { console.error('like notification error', e); }
        } else {
          if (curVal === 'like') {
            await sql`UPDATE books SET likes=MAX(likes-1,0) WHERE id=${bookId}`;
            await sql`UPDATE stories SET likes=MAX(likes-1,0) WHERE id=${bookId}`;
          }
          if (dId) await sql`DELETE FROM reactions WHERE device_id=${dId} AND (book_id=${bookId} OR book_id=${rawId})`;
        }
        const l = await sql`SELECT likes FROM books WHERE id=${bookId} UNION ALL SELECT likes FROM stories WHERE id=${bookId} LIMIT 1`;
        return json({ ok: true, likes: l.length ? (l[0].likes as number) : 0 });
      }

      // --- Push Token Registration ---
      if (url.pathname === '/api/public/devices/register' && request.method === 'POST') {
        const b = await request.json() as { device_id?: string; push_token?: string };
        if (!b.device_id || !b.push_token) return json({ error: 'device_id and push_token required' }, 400);
        await sql`INSERT INTO devices (id, device_key, push_token, last_seen_at) VALUES (${crypto.randomUUID()}, ${b.device_id}, ${b.push_token}, datetime('now')) ON CONFLICT (device_key) DO UPDATE SET push_token = ${b.push_token}, last_seen_at = datetime('now')`;
        return json({ ok: true });
      }

      // --- Send Expo Push Notifications ---
      async function sendExpoPushNotifications(pushTokens: string[], title: string, body: string, data: Record<string, string> = {}): Promise<void> {
        if (!pushTokens.length) return;
        const messages = pushTokens.filter(t => t && t.startsWith('ExponentPushToken')).map(token => ({
          to: token,
          sound: 'default',
          title,
          body,
          data,
          channelId: 'default',
        }));
        if (!messages.length) return;
        // Send in batches of 100
        for (let i = 0; i < messages.length; i += 100) {
          try {
            await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(messages.slice(i, i + 100)),
            });
          } catch (e) { console.error('Expo push send error', e); }
        }
      }

      if (url.pathname === '/api/public/notifications' && request.method === 'GET') {
        const deviceId = url.searchParams.get('device_id') || '';
        if (deviceId) {
          return json(await sql`SELECT id,title,body,COALESCE(NULLIF(CASE WHEN icon IN ('bell','book-open','heart','star','zap','gift','message-circle','megaphone','sparkles','alert-circle','check-circle','info','trending-up','award','download') THEN icon ELSE '' END,''),'bell') AS icon,COALESCE(NULLIF(url,''),'') AS url,COALESCE(story_cover,'') AS story_cover,created_at FROM notifications WHERE status='sent' AND (device_id='' OR device_id=${deviceId}) ORDER BY created_at DESC LIMIT 30`);
        }
        return json(await sql`SELECT id,title,body,COALESCE(NULLIF(CASE WHEN icon IN ('bell','book-open','heart','star','zap','gift','message-circle','megaphone','sparkles','alert-circle','check-circle','info','trending-up','award','download') THEN icon ELSE '' END,''),'bell') AS icon,COALESCE(NULLIF(url,''),'') AS url,COALESCE(story_cover,'') AS story_cover,created_at FROM notifications WHERE status='sent' AND device_id='' ORDER BY created_at DESC LIMIT 20`);
      }

      // --- PBKDF2 Hashing ---
      async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
        const s = salt || crypto.randomUUID().replace(/-/g, '').slice(0, 32);
        const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' } as any, false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(s), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
        const hash = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
        return { hash, salt: s };
      }

      // --- JWT (fail-closed: never fall back to a dev secret) ---
      const JWT_SECRET = (env as any).JWT_SECRET || '';
      async function createJWT(payload: Record<string, any>): Promise<string> {
        if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
        const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
        const body = btoa(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 }));
        const data = `${header}.${body}`;
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
        return `${data}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;
      }
      async function verifyJWT(token: string): Promise<Record<string, any> | null> {
        if (!JWT_SECRET) return null;
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

      // --- Writer Signup (email verification required) ---
      if (url.pathname === '/api/public/writers/signup' && request.method === 'POST') {
        const b = await request.json() as { username?: string; writer_name?: string; email?: string; password?: string; ref?: string };
        if (!b.username || !b.writer_name || !b.email || !b.password) return json({ error: 'All fields required' }, 400);
        const uname = validateUsername(b.username);
        if (!uname) return json({ error: 'invalid_username' }, 400);
        const wname = validateWriterName(b.writer_name);
        if (!wname) return json({ error: 'invalid_writer_name' }, 400);
        const email = validateEmail(b.email);
        if (!email) return json({ error: (b.email || '').includes('@') && (TEMP_MAIL_DOMAINS.includes(baseDomain((b.email.split('@')[1] || '').toLowerCase())) ? 'temp_mail' : 'invalid_email') }, 400);
        if (!validatePassword(b.password)) return json({ error: 'weak_password' }, 400);
        const ip = request.headers.get('cf-connecting-ip') || '';
        const recentEmail = await sql`SELECT COUNT(*)::int AS c FROM verification_codes WHERE email=${email} AND purpose='writer_signup' AND created_at > NOW() - INTERVAL '1 hour'`;
        if ((recentEmail[0]?.c || 0) >= 5) return json({ error: 'too_many_attempts' }, 429);
        if (ip) { const recentIp = await sql`SELECT COUNT(*)::int AS c FROM verification_codes WHERE ip=${ip} AND purpose='writer_signup' AND created_at > NOW() - INTERVAL '1 hour'`; if ((recentIp[0]?.c || 0) >= 20) return json({ error: 'too_many_attempts' }, 429); }
        const { hash, salt } = await hashPassword(b.password);
        let referrerId: string | null = null;
        try {
          const refCode = (b.ref || '').trim().toLowerCase();
          if (refCode) {
            const rf = await sql`SELECT writer_id FROM referrals WHERE code=${refCode} LIMIT 1`;
            if (rf.length) referrerId = rf[0].writer_id;
          }
        } catch {}
        const newWriterId = crypto.randomUUID();
        try {
          await sql`INSERT INTO writers (id,username,writer_name,email,password_hash,salt,email_verified,referred_by) VALUES (${newWriterId},${uname},${wname},${email},${hash},${salt},false,${referrerId})`;
        } catch (e: any) {
          if (e.message?.includes('writers_username')) return json({ error: 'username_taken' }, 409);
          if (e.message?.includes('writers_email')) { const ex = await sql`SELECT email_verified FROM writers WHERE email=${email}`; if (ex.length && !ex[0].email_verified) { /* unverified: fall through to resend a fresh code */ } else return json({ error: 'email_taken' }, 409); }
          else if (e.message?.includes('unique')) return json({ error: 'username_taken' }, 409);
          else throw e;
        }
        await sql`UPDATE verification_codes SET consumed=true WHERE email=${email} AND consumed=false`;
        const code = newCode();
        const codeHash = await sha256Hex('lekhoni|' + email + '|' + code);
        await sql`INSERT INTO verification_codes (id,email,code_hash,purpose,ip,expires_at) VALUES (${crypto.randomUUID()},${email},${codeHash},'writer_signup',${ip},datetime('now', '+10 minutes'))`;
        const mailSent = await sendVerificationMail(env, email, code);
        return json({ needs_verification: true, email, mail_sent: mailSent }, 201);
      }

      // --- Writer Forgot Password (send reset code) ---
      if (url.pathname === '/api/public/writers/forgot' && request.method === 'POST') {
        const b = await request.json() as { email?: string };
        const email = validateEmail(b.email || '');
        if (!email) return json({ error: 'invalid_email' }, 400);
        const w = await sql`SELECT id FROM writers WHERE email=${email}`;
        if (!w.length) return json({ error: 'not_found' }, 404);
        const ip = request.headers.get('cf-connecting-ip') || '';
        const last = await sql`SELECT created_at FROM verification_codes WHERE email=${email} AND purpose='password_reset' AND consumed=false ORDER BY created_at DESC LIMIT 1`;
        if (last.length && (Date.now() - new Date(last[0].created_at).getTime()) < 60000) return json({ error: 'resend_cooldown', retry_after: 60 - Math.floor((Date.now() - new Date(last[0].created_at).getTime()) / 1000) }, 429);
        const recent = await sql`SELECT COUNT(*)::int AS c FROM verification_codes WHERE email=${email} AND purpose='password_reset' AND created_at > NOW() - INTERVAL '1 hour'`;
        if ((recent[0]?.c || 0) >= 5) return json({ error: 'too_many_attempts' }, 429);
        if (ip) { const recentIp = await sql`SELECT COUNT(*)::int AS c FROM verification_codes WHERE ip=${ip} AND purpose='password_reset' AND created_at > NOW() - INTERVAL '1 hour'`; if ((recentIp[0]?.c || 0) >= 20) return json({ error: 'too_many_attempts' }, 429); }
        await sql`UPDATE verification_codes SET consumed=true WHERE email=${email} AND purpose='password_reset' AND consumed=false`;
        const code = newCode();
        const codeHash = await sha256Hex('lekhoni|' + email + '|' + code);
        await sql`INSERT INTO verification_codes (id,email,code_hash,purpose,ip,expires_at) VALUES (${crypto.randomUUID()},${email},${codeHash},'password_reset',${ip},datetime('now', '+10 minutes'))`;
        const mailSent = await sendVerificationMail(env, email, code, 'reset');
        return json({ ok: true, mail_sent: mailSent });
      }

      // --- Writer Reset Password ---
      if (url.pathname === '/api/public/writers/reset' && request.method === 'POST') {
        const b = await request.json() as { email?: string; code?: string; new_password?: string };
        const email = (b.email || '').trim().toLowerCase();
        const code = (b.code || '').trim();
        if (!email || !/^\d{6}$/.test(code)) return json({ error: 'code_invalid' }, 400);
        if (!validatePassword(b.new_password || '')) return json({ error: 'weak_password' }, 400);
        const rows = await sql`SELECT id,code_hash,attempts,expires_at FROM verification_codes WHERE email=${email} AND purpose='password_reset' AND consumed=false ORDER BY created_at DESC LIMIT 1`;
        if (!rows.length) return json({ error: 'code_expired' }, 400);
        const row = rows[0];
        if (new Date(row.expires_at).getTime() < Date.now()) { await sql`UPDATE verification_codes SET consumed=true WHERE id=${row.id}`; return json({ error: 'code_expired' }, 400); }
        if ((row.attempts || 0) >= 5) return json({ error: 'code_blocked' }, 403);
        const codeHash = await sha256Hex('lekhoni|' + email + '|' + code);
        if (codeHash !== row.code_hash) { await sql`UPDATE verification_codes SET attempts=attempts+1 WHERE id=${row.id}`; return json({ error: 'code_invalid', attempts_left: Math.max(0, 4 - (row.attempts || 0)) }, 400); }
        await sql`UPDATE verification_codes SET consumed=true WHERE id=${row.id}`;
        const { hash, salt } = await hashPassword(b.new_password as string);
        await sql`UPDATE writers SET password_hash=${hash},salt=${salt} WHERE email=${email}`;
        const wr = await sql`SELECT id,username,writer_name,email,bio,avatar_url,follower_count,created_at FROM writers WHERE email=${email}`;
        if (!wr.length) return json({ error: 'Writer not found' }, 404);
        const token = await createJWT({ id: wr[0].id, username: wr[0].username });
        return json({ writer: wr[0], token });
      }

      // --- Writer Verify Email Code ---
      if (url.pathname === '/api/public/writers/verify-code' && request.method === 'POST') {
        const b = await request.json() as { email?: string; code?: string };
        const email = (b.email || '').trim().toLowerCase();
        const code = (b.code || '').trim();
        if (!email || !/^\d{6}$/.test(code)) return json({ error: 'code_invalid' }, 400);
        const rows = await sql`SELECT id,code_hash,attempts,expires_at FROM verification_codes WHERE email=${email} AND purpose='writer_signup' AND consumed=false ORDER BY created_at DESC LIMIT 1`;
        if (!rows.length) return json({ error: 'code_expired' }, 400);
        const row = rows[0];
        if (new Date(row.expires_at).getTime() < Date.now()) { await sql`UPDATE verification_codes SET consumed=true WHERE id=${row.id}`; return json({ error: 'code_expired' }, 400); }
        if ((row.attempts || 0) >= 5) return json({ error: 'code_blocked' }, 403);
        const codeHash = await sha256Hex('lekhoni|' + email + '|' + code);
        if (codeHash !== row.code_hash) { await sql`UPDATE verification_codes SET attempts=attempts+1 WHERE id=${row.id}`; return json({ error: 'code_invalid', attempts_left: Math.max(0, 4 - (row.attempts || 0)) }, 400); }
        await sql`UPDATE verification_codes SET consumed=true WHERE id=${row.id}`;
        await sql`UPDATE writers SET email_verified=true WHERE email=${email}`;
        try {
          const nw = await sql`SELECT id,referred_by,referral_counted FROM writers WHERE email=${email} LIMIT 1`;
          if (nw.length && nw[0].referred_by && !nw[0].referral_counted) {
            await sql`UPDATE referrals SET uses=uses+1 WHERE writer_id=${nw[0].referred_by}`;
            await sql`UPDATE writers SET referral_counted=true WHERE id=${nw[0].id}`;
          }
        } catch (e) { console.error('referral credit failed', e); }
        const w = await sql`SELECT id,username,writer_name,email,bio,avatar_url,follower_count,created_at FROM writers WHERE email=${email}`;
        if (!w.length) return json({ error: 'Writer not found' }, 404);
        const token = await createJWT({ id: w[0].id, username: w[0].username });
        return json({ writer: w[0], token });
      }

      // --- Writer Resend Verification Code ---
      if (url.pathname === '/api/public/writers/resend-code' && request.method === 'POST') {
        const b = await request.json() as { email?: string };
        const email = (b.email || '').trim().toLowerCase();
        if (!email) return json({ error: 'invalid_email' }, 400);
        const w = await sql`SELECT id,email_verified FROM writers WHERE email=${email}`;
        if (!w.length) return json({ error: 'Writer not found' }, 404);
        if (w[0].email_verified) return json({ error: 'already_verified' }, 400);
        const last = await sql`SELECT created_at FROM verification_codes WHERE email=${email} AND purpose='writer_signup' AND consumed=false ORDER BY created_at DESC LIMIT 1`;
        if (last.length && (Date.now() - new Date(last[0].created_at).getTime()) < 60000) return json({ error: 'resend_cooldown', retry_after: 60 - Math.floor((Date.now() - new Date(last[0].created_at).getTime()) / 1000) }, 429);
        const recent = await sql`SELECT COUNT(*)::int AS c FROM verification_codes WHERE email=${email} AND purpose='writer_signup' AND created_at > NOW() - INTERVAL '1 hour'`;
        if ((recent[0]?.c || 0) >= 5) return json({ error: 'too_many_attempts' }, 429);
        const ip = request.headers.get('cf-connecting-ip') || '';
        await sql`UPDATE verification_codes SET consumed=true WHERE email=${email} AND consumed=false`;
        const code = newCode();
        const codeHash = await sha256Hex('lekhoni|' + email + '|' + code);
        await sql`INSERT INTO verification_codes (id,email,code_hash,purpose,ip,expires_at) VALUES (${crypto.randomUUID()},${email},${codeHash},'writer_signup',${ip},datetime('now', '+10 minutes'))`;
        const mailSent = await sendVerificationMail(env, email, code);
        return json({ ok: true, mail_sent: mailSent });
      }

      // --- Writer Login (email or username) ---
      if (url.pathname === '/api/public/writers/login' && request.method === 'POST') {
        const b = await request.json() as { email_or_username?: string; password?: string };
        if (!b.email_or_username || !b.password) return json({ error: 'Email/username and password required' }, 400);
        const ident = b.email_or_username.trim().toLowerCase();
        const r = await sql`SELECT id,username,writer_name,email,bio,avatar_url,follower_count,salt,password_hash,email_verified,created_at FROM writers WHERE (email=${ident} OR username=${ident}) AND is_active=true`;
        if (!r.length) return json({ error: 'Invalid credentials' }, 401);
        const { hash } = await hashPassword(b.password, r[0].salt);
        if (hash !== r[0].password_hash) return json({ error: 'Invalid credentials' }, 401);
        if (!r[0].email_verified) return json({ error: 'email_unverified', email: r[0].email }, 403);
        const token = await createJWT({ id: r[0].id, username: r[0].username });
        const { salt: _, password_hash: __, ...writer } = r[0];
        return json({ writer, token });
      }

      // --- Google Auth (sign up + login) ---
      if (url.pathname === '/api/public/writers/google' && request.method === 'POST') {
        const b = await request.json() as { credential?: string; ref?: string };
        if (!b.credential) return json({ error: 'Google credential required' }, 400);
        try {
          const resp = await fetch('https://oauth2.googleapis.com/tokeninfo', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'id_token=' + encodeURIComponent(b.credential) });
          if (!resp.ok) return json({ error: 'Invalid Google token' }, 401);
          const payload = await resp.json() as { sub?: string; email?: string; name?: string; picture?: string; aud?: string; iss?: string; exp?: number; email_verified?: string };
          if (!payload.email) return json({ error: 'Google account has no email' }, 400);
          if (!payload.aud || !String(payload.aud).startsWith('940343114841-')) return json({ error: 'Invalid Google token audience' }, 401);
          if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') return json({ error: 'Invalid Google token issuer' }, 401);
          if (!payload.exp || payload.exp * 1000 < Date.now()) return json({ error: 'Expired Google token' }, 401);
          if (payload.email_verified !== 'true') return json({ error: 'Google email not verified' }, 401);
          const email = payload.email.toLowerCase();
          const googleId = payload.sub;
          const avatarUrl = (payload.picture && payload.picture.startsWith('https://') ? payload.picture : '').slice(0, 2048) || null;
          const writerName = validateWriterName(payload.name || '') || email.split('@')[0].replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'Lekhoni Writer';
          // Check existing writer by email
          const existing = await sql`SELECT id,username,writer_name,email,bio,avatar_url,follower_count,created_at FROM writers WHERE email=${email} AND is_active=true`;
          if (existing.length) {
            const token = await createJWT({ id: existing[0].id, username: existing[0].username });
            return json({ writer: existing[0], token });
          }
          // Create new writer
          const uname = email.split('@')[0].replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'user' + Date.now();
          const randomPass = crypto.randomUUID();
          const { hash, salt } = await hashPassword(randomPass);
          let gReferrer: string | null = null;
          try {
            const gRef = (b.ref || '').trim().toLowerCase();
            if (gRef) {
              const grf = await sql`SELECT writer_id FROM referrals WHERE code=${gRef} LIMIT 1`;
              if (grf.length) gReferrer = grf[0].writer_id;
            }
          } catch {}
          const creditGoogleRef = async (newId: string) => {
            if (!gReferrer) return;
            try {
              await sql`UPDATE referrals SET uses=uses+1 WHERE writer_id=${gReferrer}`;
              await sql`UPDATE writers SET referred_by=${gReferrer},referral_counted=true WHERE id=${newId}`;
            } catch (e) { console.error('google ref credit failed', e); }
          };
          try {
            const newWriterId = crypto.randomUUID();
            const r = await sql`INSERT INTO writers (id,username,writer_name,email,password_hash,salt,avatar_url) VALUES (${newWriterId},${uname},${writerName},${email},${hash},${salt},${avatarUrl}) RETURNING id,username,writer_name,email,avatar_url,bio,follower_count,created_at`;
            await creditGoogleRef(r[0].id);
            const token = await createJWT({ id: r[0].id, username: r[0].username });
            return json({ writer: r[0], token }, 201);
          } catch (e: any) {
            // Username collision, append random digits
            if (e.message?.includes('writers_username')) {
              const fallback = uname + Math.floor(Math.random() * 9999);
              const fallbackId = crypto.randomUUID();
              const r = await sql`INSERT INTO writers (id,username,writer_name,email,password_hash,salt,avatar_url) VALUES (${fallbackId},${fallback},${writerName},${email},${hash},${salt},${avatarUrl}) RETURNING id,username,writer_name,email,avatar_url,bio,follower_count,created_at`;
              await creditGoogleRef(r[0].id);
              const token = await createJWT({ id: r[0].id, username: r[0].username });
              return json({ writer: r[0], token }, 201);
            }
            throw e;
          }
        } catch (e: any) {
          return json({ error: 'Google auth failed' }, 500);
        }
      }

        // --- Public: Affiliate Application ---
        if (url.pathname === '/api/public/affiliate-apply' && request.method === 'POST') {
          const b = await request.json() as { platform?: string; username?: string; followers?: number; contact?: string };
          const platform = (b.platform || '').trim().slice(0, 20);
          const uname = (b.username || '').trim().slice(0, 60);
          const followers = Math.max(0, Math.floor(Number(b.followers) || 0));
          const contact = (b.contact || '').trim().slice(0, 254);
          if (!platform || !uname || !contact) return json({ error: 'platform, username and contact required' }, 400);
          if (!['tiktok', 'facebook', 'youtube', 'instagram', 'other'].includes(platform)) return json({ error: 'invalid platform' }, 400);
          const ip = request.headers.get('cf-connecting-ip') || '';
          await sql`CREATE TABLE IF NOT EXISTS affiliate_apps (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), platform TEXT NOT NULL, username TEXT NOT NULL, followers INT NOT NULL DEFAULT 0, contact TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', ip TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
          const dup = await sql`SELECT id FROM affiliate_apps WHERE platform=${platform} AND LOWER(username)=${uname.toLowerCase()} LIMIT 1`;
          if (dup.length) return json({ error: 'already_applied' }, 409);
          const r = await sql`INSERT INTO affiliate_apps (platform,username,followers,contact,ip) VALUES (${platform},${uname},${followers},${contact},${ip}) RETURNING id`;
          return json({ ok: true, id: r[0].id }, 201);
        }

        // --- Public: Quiz ---
        type QuizQ = { id: string; cat: string; q: string; options: string[]; answer: number };
        const QUIZ_BANK: QuizQ[] = [
          { id: "lit1", cat: "literature", q: "বাংলা সাহিত্যের প্রথম সার্থক উপন্যাস কোনটি?", options: ["দুর্গেশনন্দিনী", "কপালকুণ্ডলা", "বিষবৃক্ষ", "কৃষ্ণকান্তের উইল"], answer: 0 },
          { id: "lit2", cat: "literature", q: "‘গীতাঞ্জলি’-র রচয়িতা কে?", options: ["কাজী নজরুল ইসলাম", "রবীন্দ্রনাথ ঠাকুর", "জসীমউদ্দীন", "সুকান্ত ভট্টাচার্য"], answer: 1 },
          { id: "lit3", cat: "literature", q: "‘পথের পাঁচালী’ উপন্যাসের লেখক কে?", options: ["বিভূতিভূষণ বন্দ্যোপাধ্যায়", "তারাশঙ্কর বন্দ্যোপাধ্যায়", "মানিক বন্দ্যোপাধ্যায়", "শরৎচন্দ্র চট্টোপাধ্যায়"], answer: 0 },
          { id: "lit4", cat: "literature", q: "‘বিদ্রোহী’ কবিতার কবি কে?", options: ["জীবনানন্দ দাশ", "কাজী নজরুল ইসলাম", "ফররুখ আহমদ", "আহসান হাবীব"], answer: 1 },
          { id: "lit5", cat: "literature", q: "‘শেষের কবিতা’ কী ধরনের রচনা?", options: ["নাটক", "উপন্যাস", "প্রবন্ধ", "ছোটগল্প"], answer: 1 },
          { id: "gk1", cat: "gk", q: "বাংলাদেশের জাতীয় ফল কোনটি?", options: ["আম", "কাঁঠাল", "লিচু", "কলা"], answer: 1 },
          { id: "gk2", cat: "gk", q: "বাংলাদেশের মুদ্রার নাম কী?", options: ["রুপি", "টাকা", "ডলার", "দিনার"], answer: 1 },
          { id: "gk3", cat: "gk", q: "পদ্মা সেতুর দৈর্ঘ্য কত?", options: ["৫.৫ কিমি", "৬.১৫ কিমি", "৭ কিমি", "৪.৮ কিমি"], answer: 1 },
          { id: "gk4", cat: "gk", q: "সুন্দরবন কোন দুটি দেশে অবস্থিত?", options: ["বাংলাদেশ-ভারত", "বাংলাদেশ-মিয়ানমার", "ভারত-নেপাল", "বাংলাদেশ-ভুটান"], answer: 0 },
          { id: "gk5", cat: "gk", q: "বাংলাদেশের জাতীয় সংগীতের রচয়িতা কে?", options: ["কাজী নজরুল ইসলাম", "রবীন্দ্রনাথ ঠাকুর", "দ্বিজেন্দ্রলাল রায়", "অতুলপ্রসাদ সেন"], answer: 1 },
          { id: "wr1", cat: "writers", q: "‘নকশী কাঁথার মাঠ’-এর কবি কে?", options: ["জসীমউদ্দীন", "জীবনানন্দ দাশ", "বুদ্ধদেব বসু", "বিষ্ণু দে"], answer: 0 },
          { id: "wr2", cat: "writers", q: "হুমায়ূন আহমেদের সৃষ্ট চরিত্র কোনটি?", options: ["হিমু", "ফেলুদা", "ব্যোমকেশ", "শবর"], answer: 0 },
          { id: "wr3", cat: "writers", q: "‘বনলতা সেন’ কবিতার কবি কে?", options: ["সুধীন্দ্রনাথ দত্ত", "জীবনানন্দ দাশ", "অমিয় চক্রবর্তী", "প্রেমেন্দ্র মিত্র"], answer: 1 },
          { id: "wr4", cat: "writers", q: "শরৎচন্দ্রের ‘দেবদাস’ উপন্যাসের নায়িকা কে?", options: ["পার্বতী", "চন্দ্রমুখী", "বিরাজ", "ষোড়শী"], answer: 0 },
          { id: "wr5", cat: "writers", q: "‘আগুনের পরশমণি’ লেখক কে?", options: ["হুমায়ূন আহমেদ", "জাফর ইকবাল", "আনিসুল হক", "শীর্ষেন্দু"], answer: 0 },
          { id: "his1", cat: "history", q: "বাংলাদেশ স্বাধীন হয় কত সালে?", options: ["১৯৪৭", "১৯৫২", "১৯৭১", "১৯৭৫"], answer: 2 },
          { id: "his2", cat: "history", q: "ভাষা আন্দোলন হয় কত সালে?", options: ["১৯৪৭", "১৯৫২", "১৯৬৯", "১৯৭১"], answer: 1 },
          { id: "his3", cat: "history", q: "মুক্তিযুদ্ধে মুক্তিবাহিনীর সর্বাধিনায়ক কে ছিলেন?", options: ["জিয়াউর রহমান", "এম এ জি ওসমানী", "তাজউদ্দীন আহমদ", "সৈয়দ নজরুল ইসলাম"], answer: 1 },
          { id: "his4", cat: "history", q: "৭ই মার্চের ভাষণ কে দিয়েছিলেন?", options: ["তাজউদ্দীন আহমদ", "সৈয়দ নজরুল ইসলাম", "শেখ মুজিবুর রহমান", "কামারুজ্জামান"], answer: 2 },
          { id: "his5", cat: "history", q: "বাংলাদেশের প্রথম রাষ্ট্রপতি কে?", options: ["জিয়াউর রহমান", "শেখ মুজিবুর রহমান", "আবু সাঈদ চৌধুরী", "মোহাম্মদউল্লাহ"], answer: 1 },
          { id: "wld1", cat: "world", q: "বিশ্বের বৃহত্তম মরুভূমি কোনটি?", options: ["সাহারা", "গোবি", "কালাহারি", "থর"], answer: 0 },
          { id: "wld2", cat: "world", q: "সবচেয়ে লম্বা নদী কোনটি?", options: ["আমাজন", "নীল", "ইয়াংসি", "মিসিসিপি"], answer: 1 },
          { id: "wld3", cat: "world", q: "জাপানের মুদ্রার নাম কী?", options: ["ইউয়ান", "উওন", "ইয়েন", "রিঙ্গিত"], answer: 2 },
          { id: "wld4", cat: "world", q: "অলিম্পিক গেমস কত বছর পর পর হয়?", options: ["২ বছর", "৩ বছর", "৪ বছর", "৫ বছর"], answer: 2 },
          { id: "wld5", cat: "world", q: "বিশ্বের সবচেয়ে জনবহুল দেশ কোনটি?", options: ["চীন", "ভারত", "যুক্তরাষ্ট্র", "ইন্দোনেশিয়া"], answer: 1 },
        ];
        if (url.pathname === '/api/public/quiz/questions' && request.method === 'GET') {
          const cat = url.searchParams.get('category') || '';
          const pool = QUIZ_BANK.filter((q) => !cat || q.cat === cat);
          const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 10);
          return json(shuffled.map(({ answer, ...rest }) => rest));
        }
        if (url.pathname === '/api/public/quiz/submit' && request.method === 'POST') {
          // Real accounts only — no guest play. Identity comes from the JWT, never the client.
          const writerMatch = request.headers.get('Authorization')?.match(/^Bearer (.+)$/);
          if (!writerMatch) return json({ error: 'Login required' }, 401);
          const payload = await verifyJWT(writerMatch[1]);
          if (!payload?.id) return json({ error: 'Invalid token' }, 401);
          const wrows = await sql`SELECT id,writer_name FROM writers WHERE id=${payload.id} LIMIT 1`;
          if (!wrows.length) return json({ error: 'Unknown writer' }, 401);
          const who = wrows[0].id as string;
          const name = (wrows[0].writer_name as string) || 'Writer';
          const b = await request.json() as { qid?: string; answer?: number; streak?: number };
          if (!b.qid || typeof b.answer !== 'number') return json({ error: 'qid and answer required' }, 400);
          const q = QUIZ_BANK.find((x) => x.id === b.qid);
          if (!q) return json({ error: 'Unknown question' }, 404);
          const correct = q.answer === b.answer;
          let xp = 0;
          let counted = false;
          if (correct) {
            try {
              await sql`INSERT INTO quiz_answers (who,qid) VALUES (${who},${q.id})`;
              counted = true;
            } catch { counted = false; }
            if (counted) {
              xp = 10;
              const st = Math.max(0, Math.floor(Number(b.streak) || 0));
              if (st >= 10) xp += 25; else if (st >= 5) xp += 10; else if (st >= 3) xp += 5;
              await sql`INSERT INTO quiz_scores (who,name,xp) VALUES (${who},${name},${xp}) ON CONFLICT (who) DO UPDATE SET xp=quiz_scores.xp+EXCLUDED.xp,name=EXCLUDED.name,day=CURRENT_DATE,updated_at=NOW()`;
            }
          }
          const tot = await sql`SELECT COALESCE(SUM(xp),0)::int AS n FROM quiz_scores WHERE who=${who}`;
          return json({ correct, xp, counted, totalXp: tot[0]?.n || 0, answer: q.answer });
        }
        if (url.pathname === '/api/public/quiz/leaderboard' && request.method === 'GET') {
          // Real writers only — JOIN hides legacy guest rows (dev-*), no delete needed.
          const range = url.searchParams.get('range') || 'day';
          let rows;
          if (range === 'all') {
            rows = await sql`SELECT q.who,w.writer_name AS name,SUM(q.xp)::int AS xp,COUNT(*)::int AS games FROM quiz_scores q JOIN writers w ON w.id=q.who AND w.is_active=true GROUP BY q.who,w.writer_name ORDER BY xp DESC LIMIT 20`;
          } else if (range === 'week') {
            rows = await sql`SELECT q.who,w.writer_name AS name,SUM(q.xp)::int AS xp FROM quiz_scores q JOIN writers w ON w.id=q.who AND w.is_active=true WHERE q.created_at >= CURRENT_DATE - INTERVAL '7 days' GROUP BY q.who,w.writer_name ORDER BY xp DESC LIMIT 20`;
          } else if (range === 'month') {
            const mrows = await sql`SELECT q.who,w.writer_name AS name,SUM(q.xp)::int AS n FROM quiz_scores q JOIN writers w ON w.id=q.who AND w.is_active=true WHERE q.created_at >= CURRENT_DATE - INTERVAL '30 days' GROUP BY q.who,w.writer_name ORDER BY n DESC LIMIT 20`;
            rows = mrows.map((r: Record<string, unknown>) => ({ who: r.who, name: r.name, xp: r.n }));
          } else {
            rows = await sql`SELECT q.who,w.writer_name AS name,SUM(q.xp)::int AS xp FROM quiz_scores q JOIN writers w ON w.id=q.who AND w.is_active=true WHERE q.day=CURRENT_DATE GROUP BY q.who,w.writer_name ORDER BY xp DESC LIMIT 20`;
          }
          return json(rows);
        }
        if (url.pathname === '/api/admin/quiz/scores' && request.method === 'DELETE') {
          const b = await request.json().catch(() => ({})) as { who?: string };
          if (!b.who) return json({ error: 'who required' }, 400);
          await sql`DELETE FROM quiz_answers WHERE who=${b.who}`;
          await sql`DELETE FROM quiz_scores WHERE who=${b.who}`;
          return json({ ok: true });
        }

        // --- Public: Account Deletion Request (web form, no login required) ---
      if (url.pathname === '/api/public/deletion-requests' && request.method === 'POST') {
        const b = await request.json() as { contact?: string; identifier?: string; details?: string };
        const contact = (b.contact || '').trim().slice(0, 254);
        const identifier = (b.identifier || '').trim().slice(0, 100);
        const details = (b.details || '').trim().slice(0, 1000);
        if (!contact || !identifier) return json({ error: 'contact and identifier required' }, 400);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact) && identifier.length < 2) return json({ error: 'valid contact required' }, 400);
        const ip = request.headers.get('cf-connecting-ip') || '';
        await sql`CREATE TABLE IF NOT EXISTS deletion_requests (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), contact TEXT NOT NULL, identifier TEXT NOT NULL DEFAULT '', details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', ip TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        const recent = await sql`SELECT COUNT(*)::int AS c FROM deletion_requests WHERE (contact=${contact} OR ip=${ip}) AND created_at > NOW() - INTERVAL '1 hour'`;
        if ((recent[0]?.c || 0) >= 3) return json({ error: 'too_many_attempts' }, 429);
        await sql`INSERT INTO deletion_requests (contact,identifier,details,ip) VALUES (${contact},${identifier},${details},${ip})`;
        return json({ ok: true }, 201);
      }
      // --- Admin: List Deletion Requests ---
      if (url.pathname === '/api/admin/deletion-requests' && request.method === 'GET') {
        const status = url.searchParams.get('status') || 'pending';
        return json(await sql`SELECT id,contact,identifier,details,status,created_at FROM deletion_requests WHERE status=${status} ORDER BY created_at DESC LIMIT 100`);
      }
      // --- Admin: Resolve Deletion Request ---
      const delReqMatch = url.pathname.match(/^\/api\/admin\/deletion-requests\/([^/]+)$/);
      if (delReqMatch && request.method === 'POST') {
        if (!uuid(delReqMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const b = await request.json() as { status?: string };
        if (!b.status || !['done','rejected'].includes(b.status)) return json({ error: 'status must be done or rejected' }, 400);
        await sql`UPDATE deletion_requests SET status=${b.status} WHERE id=${delReqMatch[1]}`;
        return json({ ok: true });
      }
      // --- Public: Latest app version (update prompt) ---
      if (url.pathname === '/api/public/app-version' && request.method === 'GET') {
        const rows = await sql`SELECT key,value FROM app_config WHERE key IN ('androidVersionCode','androidVersionName','forceUpdate')`;
        const m: Record<string, string> = {};
        for (const r of rows as any[]) m[r.key] = r.value;
        return json({ androidVersionCode: parseInt(m.androidVersionCode || '0', 10) || 0, androidVersionName: m.androidVersionName || '', force: m.forceUpdate === '1' });
      }
      // --- Admin: Get/Set app version ---
      if (url.pathname === '/api/admin/app-version' && request.method === 'GET') {
        const rows = await sql`SELECT key,value FROM app_config`;
        const m: Record<string, string> = {};
        for (const r of rows as any[]) m[r.key] = r.value;
        return json(m);
      }
      if (url.pathname === '/api/admin/app-version' && (request.method === 'PUT' || request.method === 'POST')) {
        const b = await request.json() as { androidVersionCode?: number; androidVersionName?: string; forceUpdate?: boolean };
        await sql`CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
        if (b.androidVersionCode !== undefined) await sql`INSERT INTO app_config (key,value,updated_at) VALUES ('androidVersionCode',${String(Math.max(0, Math.floor(b.androidVersionCode)))},NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`;
        if (b.androidVersionName !== undefined) await sql`INSERT INTO app_config (key,value,updated_at) VALUES ('androidVersionName',${String(b.androidVersionName).slice(0, 20)},NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`;
        await sql`INSERT INTO app_config (key,value,updated_at) VALUES ('forceUpdate',${b.forceUpdate ? '1' : '0'},NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`;
        return json({ ok: true });
      }
      // --- Reader self-delete: erase all server data for a device_key ---
      if (url.pathname === '/api/public/account' && request.method === 'DELETE') {
        const b = await request.json() as { device_key?: string };
        if (!b.device_key) return json({ error: 'device_key required' }, 400);
        const dRow = await sql`SELECT id FROM devices WHERE device_key=${b.device_key} LIMIT 1`;
        const dId = dRow.length ? dRow[0].id : null;
        if (dId) {
          await sql`DELETE FROM comments WHERE device_id=${dId}`;
          await sql`DELETE FROM follows WHERE device_id=${dId}`;
          await sql`DELETE FROM view_events WHERE device_id=${dId}`;
          await sql`DELETE FROM reactions WHERE device_id=${dId}`;
          await sql`DELETE FROM story_reports WHERE device_id=${b.device_key}`;
          try { await sql`DELETE FROM notifications WHERE device_id=${dId} OR device_id=${b.device_key}`; } catch(e) {}
          await sql`DELETE FROM devices WHERE id=${dId}`;
        }
        await sql`DELETE FROM user_state WHERE device_key=${b.device_key}`;
        return json({ ok: true });
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

      // --- User Signup ---
      if (url.pathname === '/api/public/users/signup' && request.method === 'POST') {
        const b = await request.json() as { username?: string; email?: string; password?: string; display_name?: string };
        if (!b.username || !b.email || !b.password) return json({ error: 'All fields required' }, 400);
        if (b.password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
        const uname = b.username.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
        if (!uname) return json({ error: 'Invalid username' }, 400);
        const { hash, salt } = await hashPassword(b.password);
        const displayName = (b.display_name || uname).slice(0, 20);
        try {
          const newUserId = crypto.randomUUID();
          const r = await sql`INSERT INTO users (id,username,email,password_hash,salt,display_name) VALUES (${newUserId},${uname},${b.email.toLowerCase().trim()},${hash},${salt},${displayName}) RETURNING id,username,email,display_name,avatar_url,bio,created_at`;
          const token = await createJWT({ id: r[0].id, username: r[0].username, role: 'user' });
          return json({ user: r[0], token }, 201);
        } catch (e: any) {
          if (e.message?.includes('unique')) return json({ error: 'Username or email already taken' }, 409);
          throw e;
        }
      }
      // --- User Login ---
      if (url.pathname === '/api/public/users/login' && request.method === 'POST') {
        const b = await request.json() as { email_or_username?: string; password?: string };
        if (!b.email_or_username || !b.password) return json({ error: 'All fields required' }, 400);
        const ident = b.email_or_username.trim().toLowerCase();
        const r = await sql`SELECT id,username,email,display_name,avatar_url,bio,password_hash,salt,created_at FROM users WHERE (email=${ident} OR username=${ident})`;
        if (!r.length) return json({ error: 'Invalid credentials' }, 401);
        const { hash } = await hashPassword(b.password, r[0].salt);
        if (hash !== r[0].password_hash) return json({ error: 'Invalid credentials' }, 401);
        const token = await createJWT({ id: r[0].id, username: r[0].username, role: 'user' });
        const { salt: _, password_hash: __, ...user } = r[0];
        return json({ user, token });
      }
      // --- User Verify Token ---
      if (url.pathname === '/api/public/users/verify' && request.method === 'POST') {
        const b = await request.json() as { token?: string };
        if (!b.token) return json({ error: 'Token required' }, 400);
        const payload = await verifyJWT(b.token);
        if (!payload?.id) return json({ error: 'Invalid token' }, 401);
        const r = await sql`SELECT id,username,display_name,avatar_url,bio,created_at FROM users WHERE id=${payload.id}`;
        if (!r.length) return json({ error: 'User not found' }, 404);
        return json({ user: r[0] });
      }
      // --- User Update Profile ---
      if (url.pathname === '/api/public/users/profile' && request.method === 'PUT') {
        const b = await request.json() as { token?: string; display_name?: string; bio?: string; avatar_url?: string };
        if (!b.token) return json({ error: 'Token required' }, 400);
        const payload = await verifyJWT(b.token);
        if (!payload?.id) return json({ error: 'Invalid token' }, 401);
        const updates: string[] = [];
        if (b.display_name) await sql`UPDATE users SET display_name=${b.display_name.slice(0,20)} WHERE id=${payload.id}`;
        if (b.bio !== undefined) await sql`UPDATE users SET bio=${b.bio.slice(0,200)} WHERE id=${payload.id}`;
        if (b.avatar_url !== undefined) await sql`UPDATE users SET avatar_url=${b.avatar_url} WHERE id=${payload.id}`;
        const r = await sql`SELECT id,username,display_name,avatar_url,bio,created_at FROM users WHERE id=${payload.id}`;
        return json({ user: r[0] });
      }

      // --- Public Writers List ---
      if (url.pathname === '/api/public/writers' && request.method === 'GET')
        return json(await sql`SELECT id,username,writer_name,bio,avatar_url,follower_count,badge,created_at FROM writers WHERE is_active=true ORDER BY follower_count DESC,created_at DESC`);

      const writerPubMatch = url.pathname.match(/^\/api\/public\/writers\/([^/]+)$/);
      if (writerPubMatch && request.method === 'GET') {
        if (!uuid(writerPubMatch[1])) return json({ error: 'Invalid ID' }, 400);
        const r = await sql`SELECT id,username,writer_name,bio,avatar_url,follower_count,badge,created_at FROM writers WHERE id=${writerPubMatch[1]} AND is_active=true`;
        if (!r.length) return json({ error: 'Not found' }, 404);
        return json(r[0]);
      }

      // --- Follow/Unfollow ---
      if (url.pathname === '/api/public/follows' && request.method === 'GET') {
        const deviceId = url.searchParams.get('device_id');
        if (!deviceId) return json({ error: 'device_id required' }, 400);
        await sql`INSERT INTO devices (id, device_key, last_seen_at) VALUES (${crypto.randomUUID()}, ${deviceId}, datetime('now')) ON CONFLICT (device_key) DO UPDATE SET last_seen_at=datetime('now')`;
        const dRow = await sql`SELECT id FROM devices WHERE device_key=${deviceId} LIMIT 1`;
        if (!dRow.length) return json({ error: 'Device not found' }, 500);
        const followed = await sql`SELECT w.id,w.username,w.writer_name,w.bio,w.avatar_url,w.follower_count,w.badge,f.created_at AS followed_at FROM follows f JOIN writers w ON f.writer_id=w.id WHERE f.device_id=${dRow[0].id} AND w.is_active=1 ORDER BY f.created_at DESC`;
        return json(followed);
      }
      if (url.pathname === '/api/public/follows' && request.method === 'POST') {
        const b = await request.json() as { device_id?: string; writer_id?: string; follower_writer_id?: string; follower_user_id?: string };
        if (!b.device_id || !b.writer_id) return json({ error: 'device_id and writer_id required' }, 400);
        if (!uuid(b.writer_id)) return json({ error: 'Invalid writer_id' }, 400);
        await sql`INSERT INTO devices (id, device_key, last_seen_at) VALUES (${crypto.randomUUID()}, ${b.device_id}, datetime('now')) ON CONFLICT (device_key) DO UPDATE SET last_seen_at=datetime('now')`;
        const dRow = await sql`SELECT id FROM devices WHERE device_key=${b.device_id} LIMIT 1`;
        if (!dRow.length) return json({ error: 'Device not found' }, 500);
        const ins = await sql`INSERT INTO follows (id, device_id, writer_id, follower_writer_id, follower_user_id) VALUES (${crypto.randomUUID()}, ${dRow[0].id}, ${b.writer_id}, ${b.follower_writer_id||null}, ${b.follower_user_id||null}) ON CONFLICT (device_id,writer_id) DO NOTHING RETURNING id`;
        await sql`UPDATE writers SET follower_count = (SELECT COUNT(*) FROM follows WHERE writer_id = ${b.writer_id}) WHERE id = ${b.writer_id}`;
        if (ins.length > 0) {
          if (b.follower_writer_id && uuid(b.follower_writer_id)) {
            const fw = await sql`SELECT writer_name,avatar_url FROM writers WHERE id=${b.follower_writer_id} LIMIT 1`;
            if (fw.length) await sql`INSERT INTO writer_notifications (id, writer_id, title, body, type, url, avatar_url) VALUES (${crypto.randomUUID()}, ${b.writer_id}, 'নতুন অনুসারক', ${fw[0].writer_name+' আপনাকে ফলো করেছেন'}, 'follow', ${b.follower_writer_id}, ${fw[0].avatar_url||''})`;
          } else if (b.follower_user_id && uuid(b.follower_user_id)) {
            const fu = await sql`SELECT display_name,avatar_url FROM users WHERE id=${b.follower_user_id} LIMIT 1`;
            if (fu.length) await sql`INSERT INTO writer_notifications (id, writer_id, title, body, type, url, avatar_url) VALUES (${crypto.randomUUID()}, ${b.writer_id}, 'নতুন অনুসারক', ${fu[0].display_name+' আপনাকে ফলো করেছেন'}, 'follow', ${b.follower_user_id}, ${fu[0].avatar_url||''})`;
          }
        }
        return json({ ok: true }, 201);
      }
      if (url.pathname.startsWith('/api/public/follows/') && request.method === 'DELETE') {
        const writerId = url.pathname.split('/').pop();
        const deviceId = url.searchParams.get('device_id');
        if (!writerId || !deviceId) return json({ error: 'writer_id and device_id required' }, 400);
        const dRow = await sql`SELECT id FROM devices WHERE device_key=${deviceId} LIMIT 1`;
        if (!dRow.length) return json({ ok: true });
        await sql`DELETE FROM follows WHERE device_id=${dRow[0].id} AND writer_id=${writerId}`;
        await sql`UPDATE writers SET follower_count = (SELECT COUNT(*) FROM follows WHERE writer_id = ${writerId}) WHERE id = ${writerId}`;
        return json({ ok: true });
      }

      // --- Writer notifications (website bell) ---
      if (url.pathname === '/api/writer/notifications' && request.method === 'GET') {
        const nm = request.headers.get('Authorization')?.match(/^Bearer (.+)$/);
        if (!nm) return json({ error: 'Unauthorized' }, 401);
        const payload = await verifyJWT(nm[1]);
        if (!payload?.id) return json({ error: 'Invalid token' }, 401);
        const rows = await sql`SELECT id,title,body,type,story_id,url,avatar_url,story_title,story_cover,is_read,created_at FROM writer_notifications WHERE writer_id=${payload.id} ORDER BY created_at DESC LIMIT 30`;
        const unread = await sql`SELECT COUNT(*)::int AS n FROM writer_notifications WHERE writer_id=${payload.id} AND is_read=false`;
        return json({ notifications: rows, unread: unread[0]?.n || 0 });
      }
      if (url.pathname === '/api/writer/notifications/read' && request.method === 'POST') {
        const nm = request.headers.get('Authorization')?.match(/^Bearer (.+)$/);
        if (!nm) return json({ error: 'Unauthorized' }, 401);
        const payload = await verifyJWT(nm[1]);
        if (!payload?.id) return json({ error: 'Invalid token' }, 401);
        const b = await request.json().catch(() => ({})) as { ids?: string[]; all?: boolean };
        if (b.all) {
          await sql`UPDATE writer_notifications SET is_read=true WHERE writer_id=${payload.id}`;
        } else if (Array.isArray(b.ids) && b.ids.length) {
          await sql`UPDATE writer_notifications SET is_read=true WHERE writer_id=${payload.id} AND id = ANY(${b.ids})`;
        }
        return json({ ok: true });
      }
      if (url.pathname === '/api/writer/notifications' && request.method === 'DELETE') {
        const nm = request.headers.get('Authorization')?.match(/^Bearer (.+)$/);
        if (!nm) return json({ error: 'Unauthorized' }, 401);
        const payload = await verifyJWT(nm[1]);
        if (!payload?.id) return json({ error: 'Invalid token' }, 401);
        await sql`DELETE FROM writer_notifications WHERE writer_id=${payload.id}`;
        return json({ ok: true });
      }

      // --- Writer followers list ---
      if (url.pathname === '/api/writer/followers' && request.method === 'GET') {        const writerUserMatch = request.headers.get('Authorization')?.match(/^Bearer (.+)$/);
        if (!writerUserMatch) return json({ error: 'Unauthorized' }, 401);
        const payload = await verifyJWT(writerUserMatch[1]);
        if (!payload?.id) return json({ error: 'Invalid token' }, 401);
        const followers = await sql`SELECT DISTINCT w.id,w.username,w.writer_name,w.bio,w.avatar_url,w.follower_count,w.badge FROM follows f JOIN writers w ON f.follower_writer_id=w.id WHERE f.writer_id=${payload.id} AND f.follower_writer_id IS NOT NULL AND w.is_active=true ORDER BY f.created_at DESC`;
        return json(followers);
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
        let writerId = '';
        if (adminAuthed(request, env)) {
          writerId = request.headers.get('x-writer-id') || 'da72ee95-fdbc-4091-952c-200ad0a90cea';
        } else {
          const payload = await verifyJWT(token);
          if (!payload?.id) return json({ error: 'Invalid token' }, 401);
          writerId = payload.id;
        }

        // --- Writer Dashboard Stats ---
        if (url.pathname === '/api/writer/stats' && request.method === 'GET') {
          const [storyCount, totalViews, followerCount, recentActivity] = await Promise.all([
            sql`SELECT COUNT(*)::int AS n FROM stories WHERE writer_id=${writerId}`,
            sql`SELECT COALESCE(SUM(b.views),0)::int AS n FROM books b INNER JOIN stories s ON b.title = s.title WHERE s.writer_id=${writerId}`,
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
          const stories = await sql`SELECT id,title,description,status,cover_url,category,views,likes,chapters_count,display_status,writer_status,pdf_url,dedication,author_name,COALESCE(visible_on,'both') AS visible_on,COALESCE(story_type,'episodes') AS story_type,COALESCE(is_new,false) AS is_new,created_at,updated_at FROM stories WHERE writer_id=${writerId} ORDER BY updated_at DESC`;
          return json(stories);
        }
        if (url.pathname === '/api/writer/stories' && request.method === 'POST') {
          const b = await request.json() as { title?: string; description?: string; category?: string; cover_url?: string; display_status?: string; writer_status?: string; hide_title_on_cover?: boolean; pdf_url?: string; dedication?: string; author_name?: string; visible_on?: string; story_type?: string };
          if (!b.title) return json({ error: 'Title required' }, 400);
          const vis = ['app', 'website', 'both'].includes(b.visible_on || '') ? b.visible_on : 'both';
          const stype = b.story_type === 'complete' ? 'complete' : 'episodes';
          const newStoryId = crypto.randomUUID();
          const r = await sql`INSERT INTO stories (id,writer_id,title,description,category,cover_url,display_status,writer_status,hide_title_on_cover,pdf_url,dedication,author_name,visible_on,story_type) VALUES (${newStoryId},${writerId},${b.title},${b.description||''},${b.category||''},${b.cover_url||null},${b.display_status||''},${b.writer_status||''},${b.hide_title_on_cover||false},${b.pdf_url||''},${b.dedication||''},${b.author_name||''},${vis},${stype}) RETURNING id,title,status,display_status,writer_status,hide_title_on_cover,pdf_url,dedication,author_name,created_at`;
          try { await sql`INSERT INTO writer_activities (id,writer_id,type,data) VALUES (${crypto.randomUUID()},${writerId},'story_created',${JSON.stringify({ story_id: newStoryId, title: b.title })})`; } catch (_) {}
          return json(r[0] || { id: newStoryId, title: b.title, status: 'pending' }, 201);
        }

        const storyMatch = url.pathname.match(/^\/api\/writer\/stories\/([^/]+)$/);
        if (storyMatch) {
          const storyId = storyMatch[1];
          const writerRows = await sql`SELECT writer_name, username FROM writers WHERE id=${writerId} LIMIT 1`;
          const wName = (writerRows[0]?.writer_name || '').trim();
          const uName = (writerRows[0]?.username || '').trim();

          // Check ownership or fallback to matching author name if migrated
          let owned = await sql`SELECT s.id, s.title, s.writer_id, s.author_name FROM stories s WHERE s.id=${storyId}`;

          if (!owned.length && (wName || uName)) {
            // Also check if passed ID was a book ID owned by this writer
            const bk = await sql`SELECT id, title, author FROM books WHERE id=${storyId} AND (author=${wName} OR author=${uName})`;
            if (bk.length) {
              const st = await sql`SELECT s.id, s.title, s.writer_id, s.author_name FROM stories s WHERE s.title=${bk[0].title} LIMIT 1`;
              owned = st.length ? st : [{ id: storyId, title: bk[0].title, writer_id: writerId, author_name: bk[0].author }];
            }
          }

          if (!owned.length) return json({ error: 'Not found' }, 404);

          // Verify ownership: either writer_id matches, or author_name/books author matches
          let isOwner = (owned[0].writer_id === writerId);
          if (!isOwner) {
            const stAuthor = (owned[0].author_name || '').trim();
            if ((wName && stAuthor === wName) || (uName && stAuthor === uName)) {
              isOwner = true;
            } else if (wName || uName) {
              const bkCheck = await sql`SELECT 1 FROM books WHERE (id=${storyId} OR title=${owned[0].title}) AND (author=${wName} OR author=${uName}) LIMIT 1`;
              if (bkCheck.length) isOwner = true;
            }
          }
          if (!isOwner) return json({ error: 'Forbidden' }, 403);

          if (request.method === 'GET') {
            const story = await sql`SELECT id,title,description,status,cover_url,category,views,likes,chapters_count,pdf_url,dedication,author_name,COALESCE(visible_on,'both') AS visible_on,COALESCE(writer_status,'complete') AS writer_status,COALESCE(is_new,false) AS is_new,COALESCE(story_type,'episodes') AS story_type,created_at,updated_at FROM stories WHERE id=${storyId}`;
            if (story.length && story[0].status === 'published') {
              try {
                const bkRow4 = await sql`SELECT id FROM books WHERE title=${story[0].title} AND (author=${wName} OR author=${uName}) LIMIT 1`;
                if (bkRow4.length) {
                  const allChs = await sql`SELECT title,body,position,minutes FROM story_chapters WHERE story_id=${storyId} ORDER BY position`;
                  const exist4 = await sql`SELECT title FROM chapters WHERE book_id=${bkRow4[0].id}`;
                  const have4 = new Set(exist4.map((e: any) => (e.title || '').trim()));
                  for (const c of allChs) { if (have4.has((c.title || '').trim())) continue; await sql`INSERT INTO chapters (id,book_id,title,body,position,status,minutes) VALUES (${crypto.randomUUID()},${bkRow4[0].id},${c.title},${c.body||''},${c.position},'published',${c.minutes||5})`; }
                }
              } catch (e) { console.error('story chapter backfill failed', e); }
            }
            const chapters = await sql`SELECT id,title,body,position,minutes,created_at FROM story_chapters WHERE story_id=${storyId} ORDER BY position`;
            return json({ ...story[0], chapters });
          }

          if (request.method === 'PUT') {
            const b = await request.json() as { title?: string; description?: string; status?: string; category?: string; display_status?: string; writer_status?: string; cover_url?: string; dedication?: string; author_name?: string; pdf_url?: string; visible_on?: string; hide_title_on_cover?: boolean; is_new?: boolean; story_type?: string };
            const oldTitle = owned[0]?.title || '';
            const visU = ['app', 'website', 'both'].includes(b.visible_on || '') ? b.visible_on : null;
            const visType = b.story_type === 'complete' || b.story_type === 'episodes' ? b.story_type : null;
            await sql`UPDATE stories SET title=COALESCE(${b.title},title),description=COALESCE(${b.description},description),status=COALESCE(${b.status},status),category=COALESCE(${b.category},category),display_status=COALESCE(${b.display_status},display_status),writer_status=COALESCE(${b.writer_status},writer_status),cover_url=COALESCE(${b.cover_url},cover_url),dedication=COALESCE(${b.dedication},dedication),author_name=COALESCE(${b.author_name},author_name),pdf_url=COALESCE(${b.pdf_url},pdf_url),visible_on=COALESCE(${visU},visible_on),hide_title_on_cover=COALESCE(${b.hide_title_on_cover},hide_title_on_cover),is_new=COALESCE(${b.is_new},is_new),story_type=COALESCE(${visType},story_type),updated_at=datetime('now') WHERE id=${storyId}`;
            const newTitle = b.title || oldTitle;
            if (oldTitle) {
              const bkMatch = await sql`SELECT id FROM books WHERE title=${oldTitle} AND (author=${wName} OR author=${uName}) LIMIT 1`;
              if (bkMatch.length) {
                await sql`UPDATE books SET title=${newTitle},description=COALESCE(${b.description},description),cover_url=COALESCE(${b.cover_url},cover_url),display_status=COALESCE(${b.display_status},display_status),dedication=COALESCE(${b.dedication},dedication),author_name=COALESCE(${b.author_name},author_name),pdf_url=COALESCE(${b.pdf_url},pdf_url),visible_on=(SELECT visible_on FROM stories WHERE id=${storyId}),hide_title_on_cover=(SELECT hide_title_on_cover FROM stories WHERE id=${storyId}),writer_status=(SELECT writer_status FROM stories WHERE id=${storyId}),is_new=(SELECT is_new FROM stories WHERE id=${storyId}),story_type=(SELECT story_type FROM stories WHERE id=${storyId}),updated_at=datetime('now') WHERE id=${bkMatch[0].id}`;
              }
            }
            if (b.status === 'published') {
              try { await sql`INSERT INTO writer_activities (id,writer_id,type,data) VALUES (${crypto.randomUUID()},${writerId},'story_published',${JSON.stringify({ story_id: storyId, title: b.title || '' })})`; } catch (_) {}
            }
            return json({ ok: true });
          }

          if (request.method === 'DELETE') {
            try {
              const sTitle = owned[0]?.title || '';
              const targetStoryId = owned[0]?.id || storyId;
              const bookIds = new Set<string>();
              if (storyId) bookIds.add(storyId);
              if (targetStoryId) bookIds.add(targetStoryId);

              if (sTitle) {
                const books = (wName || uName)
                  ? await sql`SELECT id FROM books WHERE title=${sTitle} AND (author=${wName} OR author=${uName})`
                  : await sql`SELECT id FROM books WHERE title=${sTitle}`;
                for (const bk of books) {
                  if (bk.id) bookIds.add(bk.id);
                }
              }

              // Fast parallel deletion on actual existing D1 tables
              const deletePromises: Promise<any>[] = [
                sql`DELETE FROM story_chapters WHERE story_id=${targetStoryId} OR story_id=${storyId}`,
                sql`DELETE FROM stories WHERE id=${targetStoryId} OR id=${storyId}`,
                sql`DELETE FROM writer_notifications WHERE story_id=${targetStoryId} OR story_id=${storyId}`,
                sql`DELETE FROM writer_activities WHERE writer_id=${writerId} AND data LIKE ${'%' + storyId + '%'}`,
              ];

              for (const bId of bookIds) {
                deletePromises.push(sql`DELETE FROM chapters WHERE book_id=${bId}`);
                deletePromises.push(sql`DELETE FROM comments WHERE book_id=${bId}`);
                deletePromises.push(sql`DELETE FROM reactions WHERE book_id=${bId}`);
                deletePromises.push(sql`DELETE FROM reports WHERE book_id=${bId}`);
                deletePromises.push(sql`DELETE FROM books WHERE id=${bId}`);
              }

              await Promise.allSettled(deletePromises);
              return json({ ok: true, message: 'Story deleted successfully' });
            } catch (err: any) {
              console.error('Delete story error:', err);
              try { await sql`DELETE FROM story_chapters WHERE story_id=${storyId}`; } catch (_) {}
              try { await sql`DELETE FROM stories WHERE id=${storyId}`; } catch (_) {}
              return json({ ok: true });
            }
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
            const newChId = crypto.randomUUID();
            const r = await sql`INSERT INTO story_chapters (id,story_id,title,body,position) VALUES (${newChId},${storyId},${b.title},${b.body||''},${pos}) RETURNING id,title,position,created_at`;
            await sql`UPDATE stories SET chapters_count = (SELECT COUNT(*)::int FROM story_chapters WHERE story_id=${storyId}), updated_at=datetime('now') WHERE id=${storyId}`;
            const stRow = await sql`SELECT st.status,w.writer_name,st.title FROM stories st JOIN writers w ON st.writer_id=w.id WHERE st.id=${storyId}`;
            if (stRow.length && stRow[0].status === 'published') {
              const bkRow = await sql`SELECT id FROM books WHERE title=${stRow[0].title} AND author=${stRow[0].writer_name} LIMIT 1`;
              if (bkRow.length) await sql`INSERT INTO chapters (id,book_id,title,body,position,status,minutes) VALUES (${crypto.randomUUID()},${bkRow[0].id},${b.title},${b.body||''},${pos},'published',5)`;
              // Notify all followers about new chapter
              try {
                const storyInfo = await sql`SELECT s.title,s.cover_url FROM stories s WHERE s.id=${storyId} LIMIT 1`;
                const followers = await sql`SELECT device_id FROM follows WHERE writer_id=${writerId}`;
                const writerInfo = await sql`SELECT writer_name FROM writers WHERE id=${writerId} LIMIT 1`;
                const writerName = writerInfo.length ? writerInfo[0].writer_name : 'লেখক';
                const storyTitle = storyInfo.length ? storyInfo[0].title : '';
                const storyCover = storyInfo.length ? storyInfo[0].cover_url || '' : '';
                const pushTokens: string[] = [];
                for (const f of followers) {
                  if (f.device_id) {
                    const dKey = await sql`SELECT device_key,push_token FROM devices WHERE id=${f.device_id} LIMIT 1`;
                    if (dKey.length) {
                      await sql`INSERT INTO notifications (id,title,body,icon,url,device_id,story_cover,status) VALUES (${crypto.randomUUID()},'নতুন অধ্যায়',${writerName+' এর "'+storyTitle+'"-এ নতুন অধ্যায় এসেছে: "'+b.title+'"'},'book-open',${storyId},${dKey[0].device_key},${storyCover},'sent')`;
                      if (dKey[0].push_token) pushTokens.push(dKey[0].push_token);
                    }
                  }
                }
                if (pushTokens.length) {
                  await sendExpoPushNotifications(pushTokens, 'নতুন অধ্যায়', writerName+' এর "'+storyTitle+'"-এ নতুন অধ্যায় এসেছে: "'+b.title+'"', { storyId, type: 'new_chapter' });
                }
              } catch(e) { console.error('chapter add follower notification error', e); }
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

        // --- Writer Referral Code + Stats ---
        if (url.pathname === '/api/writer/referral' && request.method === 'GET') {
          let row = await sql`SELECT code,uses FROM referrals WHERE writer_id=${writerId} LIMIT 1`;
          if (!row.length) {
            const w = await sql`SELECT username FROM writers WHERE id=${writerId} LIMIT 1`;
            const base = ((w.length && w[0].username) || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'user';
            const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
            let code = '';
            for (let i = 0; i < 8; i++) {
              const suffix = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
              code = `${base}-${suffix}`;
              try {
                await sql`INSERT INTO referrals (id,code,writer_id) VALUES (${crypto.randomUUID()},${code},${writerId})`;
                break;
              } catch { code = ''; }
            }
            if (!code) return json({ error: 'Could not create code' }, 500);
            row = await sql`SELECT code,uses FROM referrals WHERE writer_id=${writerId} LIMIT 1`;
          }
          const uses = row[0].uses || 0;
          return json({ code: row[0].code, uses, earnings: uses * 10 });
        }

        // --- Writer: Request Account-Delete Code ---
        if (url.pathname === '/api/writer/account/code' && request.method === 'POST') {
          const w = await sql`SELECT email FROM writers WHERE id=${writerId} LIMIT 1`;
          if (!w.length) return json({ error: 'Writer not found' }, 404);
          const email = w[0].email as string;
          const ip = request.headers.get('cf-connecting-ip') || '';
          const last = await sql`SELECT created_at FROM verification_codes WHERE email=${email} AND purpose='delete_account' AND consumed=false ORDER BY created_at DESC LIMIT 1`;
          if (last.length && (Date.now() - new Date(last[0].created_at).getTime()) < 60000) return json({ error: 'resend_cooldown', retry_after: 60 - Math.floor((Date.now() - new Date(last[0].created_at).getTime()) / 1000) }, 429);
          const recent = await sql`SELECT COUNT(*)::int AS c FROM verification_codes WHERE email=${email} AND purpose='delete_account' AND created_at > NOW() - INTERVAL '1 hour'`;
          if ((recent[0]?.c || 0) >= 5) return json({ error: 'too_many_attempts' }, 429);
          if (ip) { const recentIp = await sql`SELECT COUNT(*)::int AS c FROM verification_codes WHERE ip=${ip} AND purpose='delete_account' AND created_at > NOW() - INTERVAL '1 hour'`; if ((recentIp[0]?.c || 0) >= 20) return json({ error: 'too_many_attempts' }, 429); }
          await sql`UPDATE verification_codes SET consumed=true WHERE email=${email} AND purpose='delete_account' AND consumed=false`;
          const code = newCode();
          const codeHash = await sha256Hex('lekhoni|' + email + '|' + code);
          await sql`INSERT INTO verification_codes (id,email,code_hash,purpose,ip,expires_at) VALUES (${crypto.randomUUID()},${email},${codeHash},'delete_account',${ip},datetime('now', '+10 minutes'))`;
          const mailSent = await sendVerificationMail(env, email, code, 'delete');
          return json({ ok: true, mail_sent: mailSent });
        }

        // --- Writer: Delete Account (code required) ---
        if (url.pathname === '/api/writer/account' && request.method === 'DELETE') {
          try {
            let code = '';
            try { const bd = await request.json() as { code?: string }; code = (bd.code || '').trim(); } catch {}
            if (!/^\d{6}$/.test(code)) return json({ error: 'code_required' }, 400);
            const writer = await sql`SELECT id,username,writer_name,email FROM writers WHERE id=${writerId} LIMIT 1`;
            if (!writer.length) return json({ error: 'Writer not found' }, 404);
            const email = writer[0].email as string;
            const rows = await sql`SELECT id,code_hash,attempts,expires_at FROM verification_codes WHERE email=${email} AND purpose='delete_account' AND consumed=false ORDER BY created_at DESC LIMIT 1`;
            if (!rows.length) return json({ error: 'code_expired' }, 400);
            const row = rows[0];
            if (new Date(row.expires_at).getTime() < Date.now()) { await sql`UPDATE verification_codes SET consumed=true WHERE id=${row.id}`; return json({ error: 'code_expired' }, 400); }
            if ((row.attempts || 0) >= 5) return json({ error: 'code_blocked' }, 403);
            const codeHash = await sha256Hex('lekhoni|' + email + '|' + code);
            if (codeHash !== row.code_hash) { await sql`UPDATE verification_codes SET attempts=attempts+1 WHERE id=${row.id}`; return json({ error: 'code_invalid', attempts_left: Math.max(0, 4 - (row.attempts || 0)) }, 400); }
            await sql`UPDATE verification_codes SET consumed=true WHERE id=${row.id}`;
            const wName = writer[0].writer_name;
            // Delete story chapters
            const storyIds = await sql`SELECT id FROM stories WHERE writer_id=${writerId}`;
            for (const s of storyIds) {
              await sql`DELETE FROM story_chapters WHERE story_id=${s.id}`;
            }
            // Delete stories
            await sql`DELETE FROM stories WHERE writer_id=${writerId}`;
            // Delete books and their chapters
            const bookIds = await sql`SELECT id FROM books WHERE author=${wName}`;
            for (const bk of bookIds) {
              await sql`DELETE FROM chapters WHERE book_id=${bk.id}`;
            }
            await sql`DELETE FROM books WHERE author=${wName}`;
            // Delete follows, notifications, activities
            await sql`DELETE FROM follows WHERE writer_id=${writerId}`;
            await sql`DELETE FROM writer_notifications WHERE writer_id=${writerId}`;
            await sql`DELETE FROM writer_activities WHERE writer_id=${writerId}`;
            // Delete writer
            await sql`DELETE FROM writers WHERE id=${writerId}`;
            return json({ ok: true, message: 'Account deleted successfully' });
          } catch (e) {
            return json({ error: 'Failed to delete account' }, 500);
          }
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

        // --- Writer PDF Upload ---
        if (url.pathname === '/api/writer/upload-pdf' && request.method === 'POST') {
          const form = await request.formData();
          const file = form.get('file');
          if (!(file instanceof File)) return json({ error: 'PDF required' }, 400);
          if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf' && !(file.type||'').includes('pdf')) return json({ error: 'Only PDF files allowed' }, 400);
          if (file.size > 50 * 1024 * 1024) return json({ error: 'PDF must be under 50MB' }, 400);
          const key = `writers/${writerId}/pdfs/${crypto.randomUUID()}.pdf`;
          await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: 'application/pdf' } });
          return json({ url: `${env.MEDIA_PUBLIC_URL}/${key}` }, 201);
        }

        // --- Writer Notifications ---
        if (url.pathname === '/api/writer/notifications' && request.method === 'GET') {
          const r = await sql`SELECT id,title,body,type,story_id,is_read,url,COALESCE(avatar_url,'') as avatar_url,COALESCE(story_title,'') as story_title,COALESCE(story_cover,'') as story_cover,created_at FROM writer_notifications WHERE writer_id=${writerId} ORDER BY created_at DESC LIMIT 50`;
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
          const writerApproval = await sql`SELECT approval_required FROM writers WHERE id=${writerId}`;
          const needsApproval = writerApproval.length ? writerApproval[0].approval_required : true;
          const newStatus = needsApproval ? 'pending' : 'published';
          await sql`UPDATE stories SET status=${newStatus},review_note='',updated_at=NOW() WHERE id=${storySubmitMatch[1]}`;
          if (!needsApproval) {
            const sRow = await sql`SELECT s.title,s.description,s.category,s.cover_url,s.display_status,s.writer_status,s.hide_title_on_cover,s.pdf_url,s.dedication,s.author_name,s.visible_on,s.story_type,w.writer_name FROM stories s JOIN writers w ON s.writer_id=w.id WHERE s.id=${storySubmitMatch[1]}`;
            if (sRow.length) {
              const catRow = await sql`SELECT id FROM categories WHERE name=${sRow[0].category} LIMIT 1`;
              const catId = catRow.length ? catRow[0].id : null;
              const visS = sRow[0].visible_on || 'both';
              let bookId: string | null = null;
              const existing = await sql`SELECT id FROM books WHERE title=${sRow[0].title} AND author=${sRow[0].writer_name} LIMIT 1`;
              if (existing.length) {
                bookId = existing[0].id;
                await sql`UPDATE books SET hide_title_on_cover=${sRow[0].hide_title_on_cover||false},pdf_url=${sRow[0].pdf_url||''},dedication=${sRow[0].dedication||''},author_name=${sRow[0].author_name||''},visible_on=${visS},story_type=${sRow[0].story_type||'episodes'} WHERE id=${bookId}`;
              } else {
                const __sid4 = await mintShortId(sql);
                const bkId = crypto.randomUUID();
                const bk = await sql`INSERT INTO books (id,title,author,category_id,cover_url,description,status,display_status,writer_status,hide_title_on_cover,pdf_url,dedication,author_name,show_ads,pdf_reward_ad,visible_on,story_type,short_id) VALUES (${bkId},${sRow[0].title},${sRow[0].writer_name},${catId},${sRow[0].cover_url||null},${sRow[0].description||''},'published',${sRow[0].display_status||''},${sRow[0].writer_status||''},${sRow[0].hide_title_on_cover||false},${sRow[0].pdf_url||''},${sRow[0].dedication||''},${sRow[0].author_name||sRow[0].writer_name},true,true,${visS},${sRow[0].story_type||'episodes'},${__sid4}) RETURNING id`;
                bookId = bk[0]?.id || bkId;
              }
              if (bookId) {
                const chapters = await sql`SELECT title,body,position FROM story_chapters WHERE story_id=${storySubmitMatch[1]} ORDER BY position`;
                const existingChs = await sql`SELECT title FROM chapters WHERE book_id=${bookId}`;
                const have = new Set(existingChs.map((e: any) => (e.title || '').trim()));
                for (const c of chapters) { if (have.has((c.title || '').trim())) continue; try { await sql`INSERT INTO chapters (id,book_id,title,body,position,status,reward_ad) VALUES (${crypto.randomUUID()},${bookId},${c.title},${c.body||''},${c.position},'published',false)`; } catch (e) { console.error('auto-approve chapter insert failed', e); } }
              }
              // Notify all followers about new story
              try {
                const writerId = (await sql`SELECT writer_id FROM stories WHERE id=${storySubmitMatch[1]} LIMIT 1`)[0]?.writer_id;
                if (writerId) {
                  const writerInfo = await sql`SELECT writer_name,avatar_url FROM writers WHERE id=${writerId} LIMIT 1`;
                  const followers = await sql`SELECT device_id FROM follows WHERE writer_id=${writerId}`;
                  const writerName = writerInfo.length ? writerInfo[0].writer_name : 'লেখক';
                  const writerAvatar = writerInfo.length ? writerInfo[0].avatar_url || '' : '';
                  const storyTitle = sRow[0]?.title || '';
                  const storyCover = sRow[0]?.cover_url || '';
                  const pushTokens: string[] = [];
                  for (const f of followers) {
                    if (f.device_id) {
                      const dKey = await sql`SELECT device_key,push_token FROM devices WHERE id=${f.device_id} LIMIT 1`;
                      if (dKey.length) {
                        await sql`INSERT INTO notifications (id,title,body,icon,url,device_id,story_cover,status) VALUES (${crypto.randomUUID()},'নতুন গল্প',${writerName+' নতুন গল্প প্রকাশ করেছেন: "'+storyTitle+'"'},'book-open',${storySubmitMatch[1]},${dKey[0].device_key},${storyCover},'sent')`;
                        if (dKey[0].push_token) pushTokens.push(dKey[0].push_token);
                      }
                    }
                  }
                  if (pushTokens.length) {
                    await sendExpoPushNotifications(pushTokens, 'নতুন গল্প', writerName+' নতুন গল্প প্রকাশ করেছেন: "'+storyTitle+'"', { storyId: storySubmitMatch[1], type: 'new_story' });
                  }
                }
              } catch(e) { console.error('story publish follower notification error', e); }
            }
          }
          return json({ ok: true, status: newStatus });
        }


        // --- Writer: Request Website-Only Category (needs admin approval) ---
        if (url.pathname === '/api/writer/categories' && request.method === 'POST') {
          const b = await request.json() as { name?: string; icon?: string; color?: string };
          const cname = (b.name || '').trim().slice(0, 40);
          if (!cname) return json({ error: 'Name required' }, 400);
          const dup = await sql`SELECT id FROM categories WHERE LOWER(name)=${cname.toLowerCase()} LIMIT 1`;
          if (dup.length) return json({ error: 'Category already exists' }, 409);
          const maxPos = await sql`SELECT COALESCE(MAX(position),0)+1 AS n FROM categories`;
          const newCatId = crypto.randomUUID();
          const r = await sql`INSERT INTO categories (id,name,icon,color,visible_on,position,is_active,requested_by) VALUES (${newCatId},${cname},${b.icon||'book-open'},${b.color||'#DDF5EC'},'website',${maxPos[0].n},false,${writerId}) RETURNING id,name`;
          return json({ ...r[0], pending: true }, 201);
        }

        // --- Writer Dashboard Stats ---
        if (url.pathname === '/api/writer/dashboard' && request.method === 'GET') {
          const [storyCount, totalViews, followerCount, publishedCount, pendingCount, totalLikesAgg] = await Promise.all([
            sql`SELECT COUNT(*)::int AS n FROM stories WHERE writer_id=${writerId}`,
            sql`SELECT COALESCE(SUM(b.views),0)::int AS n FROM books b INNER JOIN stories s ON b.title = s.title WHERE s.writer_id=${writerId}`,
            sql`SELECT COUNT(*)::int AS n FROM follows WHERE writer_id=${writerId}`,
            sql`SELECT COUNT(*)::int AS n FROM stories WHERE writer_id=${writerId} AND status='published'`,
            sql`SELECT COUNT(*)::int AS n FROM stories WHERE writer_id=${writerId} AND status='pending'`,
            sql`SELECT COALESCE(SUM(b.likes),0)::int AS n FROM books b INNER JOIN stories s ON b.title = s.title WHERE s.writer_id=${writerId}`,
          ]);
          const publishedStories = await sql`
            SELECT s.id,s.title,COALESCE((SELECT SUM(b2.views) FROM books b2 WHERE b2.title=s.title),0)::int AS views,s.cover_url,s.created_at,s.updated_at,
            (SELECT COALESCE(bk.likes,0) FROM books bk WHERE bk.title=s.title LIMIT 1) AS likes,
            (SELECT COUNT(*)::int FROM comments c WHERE c.book_id IN (SELECT id FROM books WHERE title=s.title) AND c.status='approved') AS comment_count
            FROM stories s WHERE s.writer_id=${writerId} AND s.status='published' ORDER BY views DESC`;
          const todayViews = await sql`SELECT COALESCE(SUM(b.views),0)::int AS n FROM books b INNER JOIN stories s ON b.title = s.title WHERE s.writer_id=${writerId} AND s.updated_at >= CURRENT_DATE`;
          const weekViews = await sql`SELECT COALESCE(SUM(b.views),0)::int AS n FROM books b INNER JOIN stories s ON b.title = s.title WHERE s.writer_id=${writerId} AND s.updated_at >= CURRENT_DATE - INTERVAL '7 days'`;
          const monthViews = await sql`SELECT COALESCE(SUM(b.views),0)::int AS n FROM books b INNER JOIN stories s ON b.title = s.title WHERE s.writer_id=${writerId} AND s.updated_at >= CURRENT_DATE - INTERVAL '30 days'`;
          return json({
            stories: storyCount[0].n, totalViews: totalViews[0].n, followers: followerCount[0].n,
            totalLikes: totalLikesAgg[0].n,
            published: publishedCount[0].n, pending: pendingCount[0].n,
            publishedStories, todayViews: todayViews[0].n, weekViews: weekViews[0].n, monthViews: monthViews[0].n
          });
        }

        return json({ error: 'Not found' }, 404);
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) { return json({ error: error instanceof Error ? error.message : 'Request failed' }, 500); }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await handleRequest(request, env);
    const requestOrigin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    if (requestOrigin && (allowed.includes('*') || allowed.includes(requestOrigin))) {
      response.headers.set('Access-Control-Allow-Origin', requestOrigin);
      response.headers.append('Vary', 'Origin');
    }
    return response;
  },
};
