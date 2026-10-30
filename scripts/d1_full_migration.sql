CREATE TABLE IF NOT EXISTS comment_reports (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL,
  reporter_device_id TEXT DEFAULT '',
  reporter_writer_id TEXT DEFAULT NULL,
  reason TEXT NOT NULL,
  details TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS story_reports (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  device_id TEXT DEFAULT '',
  reporter_name TEXT DEFAULT 'Anonymous',
  reason TEXT NOT NULL,
  details TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE devices ADD COLUMN writer_id TEXT;
ALTER TABLE user_state ADD COLUMN downloads TEXT;
ALTER TABLE user_state ADD COLUMN positions TEXT;
ALTER TABLE app_config ADD COLUMN updated_at TEXT;
ALTER TABLE about_content ADD COLUMN content TEXT;
