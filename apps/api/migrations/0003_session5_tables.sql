-- ============================================================
-- DL Chat Session 5 Migration
-- New tables: bans, appeals, voice, pinned, bookmarks,
-- translations, invites, stories, ai_conversations, reads
-- ============================================================

-- ── BANS ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banned_by TEXT NOT NULL REFERENCES users(id),
  ban_type TEXT NOT NULL DEFAULT 'full', -- warning, mute, partial, full, ip
  reason TEXT NOT NULL,
  internal_notes TEXT,
  context_type TEXT DEFAULT 'global',   -- global, server, channel
  context_id TEXT,                       -- server/channel ID for partial bans
  ip_address TEXT,                       -- for IP bans
  expires_at DATETIME,                   -- NULL = permanent
  allow_appeal INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  evidence_urls TEXT DEFAULT '[]',
  unbanned_by TEXT REFERENCES users(id),
  unban_reason TEXT,
  unbanned_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bans_user_id ON bans(user_id);
CREATE INDEX IF NOT EXISTS idx_bans_is_active ON bans(is_active);
CREATE INDEX IF NOT EXISTS idx_bans_ban_type ON bans(ban_type);
CREATE INDEX IF NOT EXISTS idx_bans_context ON bans(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_bans_expires_at ON bans(expires_at);

-- Add ban_count column to users if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned INTEGER DEFAULT 0;

-- ── BAN APPEALS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ban_appeals (
  id TEXT PRIMARY KEY,
  ban_id TEXT NOT NULL REFERENCES bans(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  statement TEXT NOT NULL,
  additional_info TEXT,
  evidence_urls TEXT DEFAULT '[]',
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'submitted', -- submitted, under_review, needs_more_info, approved, rejected, withdrawn
  admin_response TEXT,
  internal_notes TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at DATETIME,
  assigned_to TEXT REFERENCES users(id),
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
  appeal_id TEXT NOT NULL REFERENCES ban_appeals(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  is_admin_message INTEGER DEFAULT 0,
  attachment_urls TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_appeal_messages_appeal_id ON appeal_messages(appeal_id);

-- ── ADMIN AUDIT LOG ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES users(id),
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
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  file_url TEXT,
  duration_seconds INTEGER NOT NULL,
  file_size INTEGER,
  mime_type TEXT DEFAULT 'audio/ogg',
  waveform_data TEXT, -- JSON array of amplitude values
  transcript TEXT,
  transcript_generated_at DATETIME,
  transcript_language TEXT,
  play_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_voice_messages_chat_id ON voice_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_voice_messages_sender ON voice_messages(sender_id);

-- ── PINNED MESSAGES ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pinned_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  pinned_by TEXT NOT NULL REFERENCES users(id),
  pin_note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chat_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_pinned_chat_id ON pinned_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_pinned_created_at ON pinned_messages(created_at);

-- ── BOOKMARKS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  expires_at DATETIME,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invite_links_code ON invite_links(code);
CREATE INDEX IF NOT EXISTS idx_invite_links_chat_id ON invite_links(chat_id);
CREATE INDEX IF NOT EXISTS idx_invite_links_created_by ON invite_links(created_by);

-- ── INVITE JOINS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invite_joins (
  id TEXT PRIMARY KEY,
  invite_id TEXT NOT NULL REFERENCES invite_links(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invite_joins_invite_id ON invite_joins(invite_id);
CREATE INDEX IF NOT EXISTS idx_invite_joins_user_id ON invite_joins(user_id);

-- ── STORIES ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'text', -- text, image, video
  content TEXT,
  media_url TEXT,
  media_type TEXT,
  background_color TEXT DEFAULT '#5865F2',
  font_style TEXT DEFAULT 'normal',
  duration INTEGER DEFAULT 5,
  view_count INTEGER DEFAULT 0,
  reaction_count INTEGER DEFAULT 0,
  privacy TEXT DEFAULT 'friends', -- public, friends, close_friends, only_me
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_stories_user_id ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON stories(expires_at);
CREATE INDEX IF NOT EXISTS idx_stories_created_at ON stories(created_at);

-- ── STORY VIEWS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS story_views (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(story_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_story_views_story_id ON story_views(story_id);
CREATE INDEX IF NOT EXISTS idx_story_views_viewer_id ON story_views(viewer_id);

-- ── STORY REACTIONS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS story_reactions (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(story_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_story_reactions_story_id ON story_reactions(story_id);

-- ── AI CONVERSATIONS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  messages TEXT NOT NULL DEFAULT '[]', -- JSON array
  model TEXT DEFAULT '@cf/meta/llama-3.1-8b-instruct',
  total_tokens INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  last_message_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated_at ON ai_conversations(updated_at);

-- ── MESSAGE READS (Read Receipts) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_reads (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reads_message_id ON message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_user_chat ON message_reads(user_id, chat_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_chat_id ON message_reads(chat_id);

-- ── SYSTEM SETTINGS (if not exists) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO system_settings (key, value, description) VALUES
  ('maintenance_mode', 'false', 'Enable/disable maintenance mode'),
  ('registration_enabled', 'true', 'Allow new user registrations'),
  ('max_message_length', '4000', 'Maximum message character length'),
  ('max_file_size_mb', '100', 'Maximum file upload size in MB'),
  ('ban_appeal_enabled', 'true', 'Allow banned users to appeal'),
  ('ai_moderation_enabled', 'true', 'Use AI for content moderation'),
  ('stories_enabled', 'true', 'Enable stories feature'),
  ('voice_messages_enabled', 'true', 'Enable voice messages'),
  ('translations_enabled', 'true', 'Enable message translation');
