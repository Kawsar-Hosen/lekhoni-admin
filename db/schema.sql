CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'book-open', color TEXT NOT NULL DEFAULT '#DDF5EC', position INT NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, author TEXT NOT NULL, category_id UUID REFERENCES categories(id), cover_url TEXT, color TEXT NOT NULL DEFAULT '#123E39', accent TEXT NOT NULL DEFAULT '#F5C660', description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')), featured BOOLEAN NOT NULL DEFAULT FALSE, is_new BOOLEAN NOT NULL DEFAULT FALSE, views BIGINT NOT NULL DEFAULT 0, likes BIGINT NOT NULL DEFAULT 0, dislikes BIGINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', position INT NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')), views BIGINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), device_key TEXT UNIQUE NOT NULL, display_name TEXT, last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE, book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE, value TEXT NOT NULL CHECK (value IN ('like','dislike')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(device_id, book_id)
);
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), device_id UUID REFERENCES devices(id), book_id UUID REFERENCES books(id) ON DELETE CASCADE, chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE, display_name TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','hidden','deleted')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS view_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), device_id UUID REFERENCES devices(id), book_id UUID REFERENCES books(id) ON DELETE CASCADE, chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, body TEXT NOT NULL, icon TEXT DEFAULT 'bell', status TEXT NOT NULL DEFAULT 'sent', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS writer_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), device_id UUID REFERENCES devices(id), author_name TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')), note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS admin_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), action TEXT NOT NULL, target_type TEXT, target_id UUID, metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS moderators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, salt TEXT NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_login_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS moderator_sessions (
  token_hash TEXT PRIMARY KEY, moderator_id UUID NOT NULL REFERENCES moderators(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_moderator_sessions_moderator ON moderator_sessions(moderator_id);
