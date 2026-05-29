-- Migration: Create missing tables (safe - only creates what doesn't exist)
-- Tables bans, pinned_messages, message_reads already exist

-- ── BAN APPEALS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ban_appeals (
  id TEXT PRIMARY KEY,
  ban_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  statement TEXT NOT NULL,
  additional_info TEXT,
  evidence_urls TEXT DEFAULT '[]',
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  admin_response TEXT,
  internal_notes TEXT,
  reviewed_by TEXT,
  reviewed_at DATETIME,
  assigned_to TEXT,
  is_public_appeal INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ban_appeals_user_id ON ban_appeals(user_id);
CREATE INDEX IF NOT EXISTS idx_ban_appeals_ban_id ON ban_appeals(ban_id);
CREATE INDEX IF NOT EXISTS idx_ban_appeals_status ON ban_appeals(status);

-- ── APPEAL MESSAGES ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appeal_messages (
  id TEXT PRIMARY KEY,
  appeal_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  message TEXT NOT NULL,
  is_admin_message INTEGER DEFAULT 0,
  attachment_urls TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_appeal_messages_appeal_id ON appeal_messages(appeal_id);

-- ── ADMIN AUDIT LOG ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_admin_id ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON admin_audit_log(created_at);

-- ── VOICE MESSAGES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT,
  sender_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  file_url TEXT,
  duration_seconds INTEGER NOT NULL,
  file_size INTEGER,
  mime_type TEXT DEFAULT 'audio/ogg',
  waveform_data TEXT,
  transcript TEXT,
  transcript_generated_at DATETIME,
  transcript_language TEXT,
  play_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_voice_messages_chat_id ON voice_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_voice_messages_sender ON voice_messages(sender_id);

-- ── BOOKMARKS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  chat_id TEXT,
  folder TEXT DEFAULT 'default',
  tags TEXT DEFAULT '[]',
  note TEXT,
  message_preview TEXT,
  message_type TEXT,
  sender_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_folder ON bookmarks(user_id, folder);

-- ── MESSAGE TRANSLATIONS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_translations (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  source_language TEXT,
  target_language TEXT NOT NULL,
  original_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  confidence REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, target_language)
);

CREATE INDEX IF NOT EXISTS idx_translations_message_id ON message_translations(message_id);

-- ── INVITE LINKS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invite_links (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  chat_id TEXT NOT NULL,
  chat_type TEXT NOT NULL DEFAULT 'group',
  created_by TEXT NOT NULL,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  expires_at DATETIME,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invite_links_code ON invite_links(code);
CREATE INDEX IF NOT EXISTS idx_invite_links_chat_id ON invite_links(chat_id);

-- ── INVITE JOINS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invite_joins (
  id TEXT PRIMARY KEY,
  invite_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invite_joins_invite_id ON invite_joins(invite_id);
CREATE INDEX IF NOT EXISTS idx_invite_joins_user_id ON invite_joins(user_id);

-- ── STORIES ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  media_type TEXT,
  background_color TEXT DEFAULT '#5865F2',
  font_style TEXT DEFAULT 'normal',
  duration INTEGER DEFAULT 5,
  view_count INTEGER DEFAULT 0,
  reaction_count INTEGER DEFAULT 0,
  privacy TEXT DEFAULT 'friends',
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_stories_user_id ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON stories(expires_at);

-- ── STORY VIEWS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS story_views (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  viewer_id TEXT NOT NULL,
  viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(story_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_story_views_story_id ON story_views(story_id);

-- ── STORY REACTIONS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS story_reactions (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(story_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_story_reactions_story_id ON story_reactions(story_id);

-- ── AI CONVERSATIONS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  messages TEXT NOT NULL DEFAULT '[]',
  model TEXT DEFAULT '@cf/meta/llama-3.1-8b-instruct',
  total_tokens INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  last_message_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations(user_id);

-- ── ADD ban_count to users ───────────────────────────────────────────────────
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we use a safe workaround
CREATE TABLE IF NOT EXISTS _migration_flags (key TEXT PRIMARY KEY, done INTEGER DEFAULT 0);
INSERT OR IGNORE INTO _migration_flags (key, done) VALUES ('ban_count_added', 0);
