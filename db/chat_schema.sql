-- ============================================================================
-- Lekhoni Kahini Writer Messaging System Schema
-- Cloudflare D1 (SQLite) Migration
-- ============================================================================

-- 1. Conversations (1-to-1 direct chats between writers)
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  direct_key TEXT UNIQUE, -- e.g. min(w1, w2) || '_' || max(w1, w2)
  last_message_id TEXT,
  last_message_text TEXT DEFAULT '',
  last_message_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 2. Conversation Members
CREATE TABLE IF NOT EXISTS conversation_members (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  writer_id TEXT NOT NULL REFERENCES writers(id) ON DELETE CASCADE,
  last_read_message_id TEXT,
  last_read_at TEXT,
  unread_count INTEGER DEFAULT 0,
  is_muted INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(conversation_id, writer_id)
);

-- 3. Messages (Text, Images, Replies, Soft-Delete)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES writers(id) ON DELETE CASCADE,
  reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'image'
  content TEXT NOT NULL DEFAULT '',
  media_url TEXT DEFAULT '',
  media_meta TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'delivered', 'read'
  is_deleted INTEGER DEFAULT 0,
  deleted_for TEXT DEFAULT '[]', -- JSON array of writer_ids who deleted for themselves
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 4. Message Receipts (Delivered, Read timestamps)
CREATE TABLE IF NOT EXISTS message_receipts (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  writer_id TEXT NOT NULL REFERENCES writers(id) ON DELETE CASCADE,
  status TEXT NOT NULL, -- 'delivered', 'read'
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, writer_id)
);

-- 5. User Presence (Online / Offline status and last seen)
CREATE TABLE IF NOT EXISTS user_presence (
  writer_id TEXT PRIMARY KEY REFERENCES writers(id) ON DELETE CASCADE,
  is_online INTEGER DEFAULT 0,
  last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 6. User Blocks (Safety and privacy control)
CREATE TABLE IF NOT EXISTS user_blocks (
  id TEXT PRIMARY KEY,
  blocker_id TEXT NOT NULL REFERENCES writers(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES writers(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(blocker_id, blocked_id)
);

-- 7. Writer Devices (FCM tokens for offline push notifications)
CREATE TABLE IF NOT EXISTS writer_devices (
  id TEXT PRIMARY KEY,
  writer_id TEXT NOT NULL REFERENCES writers(id) ON DELETE CASCADE,
  device_key TEXT NOT NULL,
  push_token TEXT NOT NULL,
  platform TEXT DEFAULT 'android',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(writer_id, device_key)
);

-- Indexes for optimal querying and pagination
CREATE INDEX IF NOT EXISTS idx_conv_members_writer ON conversation_members(writer_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_pair ON user_blocks(blocker_id, blocked_id);
CREATE INDEX IF NOT EXISTS idx_writer_devices_writer ON writer_devices(writer_id);
