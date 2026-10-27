CREATE TABLE IF NOT EXISTS view_events (
  id TEXT PRIMARY KEY,
  device_id TEXT,
  book_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_view_events_book ON view_events(book_id);
CREATE INDEX IF NOT EXISTS idx_view_events_device ON view_events(device_id);

UPDATE devices 
SET id = (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-a' || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))) 
WHERE id IS NULL;
