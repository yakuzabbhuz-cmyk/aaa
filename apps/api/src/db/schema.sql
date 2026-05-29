-- ============================================
-- DL Chat - Full D1/SQLite Database Schema
-- DEATH LEGION Team
-- Version: 1.0.0
-- ============================================

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ==============================
-- USERS & AUTH
-- ==============================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT DEFAULT '',
  avatar_url TEXT,
  status TEXT DEFAULT 'Hey there! I am using DL Chat',
  is_verified INTEGER DEFAULT 0,
  is_premium INTEGER DEFAULT 0,
  is_bot INTEGER DEFAULT 0,
  bot_owner_id TEXT,
  bot_token TEXT UNIQUE,
  bot_description TEXT,
  bot_commands TEXT DEFAULT '[]',
  is_banned INTEGER DEFAULT 0,
  ban_reason TEXT,
  ban_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_seen INTEGER,
  privacy_last_seen TEXT DEFAULT 'everyone',
  privacy_profile_photo TEXT DEFAULT 'everyone',
  privacy_about TEXT DEFAULT 'everyone',
  privacy_status TEXT DEFAULT 'everyone',
  privacy_read_receipts INTEGER DEFAULT 1,
  privacy_groups TEXT DEFAULT 'everyone',
  custom_theme TEXT,
  language TEXT DEFAULT 'en',
  notification_sound TEXT DEFAULT 'default',
  two_factor_enabled INTEGER DEFAULT 0,
  two_factor_secret TEXT,
  public_key TEXT,
  passkey_credential TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  refresh_token TEXT UNIQUE,
  device_info TEXT,
  ip_address TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  refresh_expires_at INTEGER,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY,
  target TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT,
  is_blocked INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, contact_id)
);

-- ==============================
-- SERVERS (Discord-like)
-- ==============================

CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  banner_url TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  is_public INTEGER DEFAULT 0,
  invite_link TEXT UNIQUE,
  invite_link_expires_at INTEGER,
  max_members INTEGER DEFAULT 500000,
  verification_level INTEGER DEFAULT 0,
  boost_level INTEGER DEFAULT 0,
  total_boosts INTEGER DEFAULT 0,
  rules_channel_id TEXT,
  system_channel_id TEXT,
  afk_channel_id TEXT,
  afk_timeout INTEGER DEFAULT 300,
  features TEXT DEFAULT '[]',
  custom_emojis_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS server_categories (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS server_members (
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT,
  joined_at INTEGER NOT NULL,
  is_banned INTEGER DEFAULT 0,
  ban_reason TEXT,
  timeout_until INTEGER,
  PRIMARY KEY (server_id, user_id)
);

CREATE TABLE IF NOT EXISTS server_roles (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#99AAB5',
  icon_url TEXT,
  position INTEGER DEFAULT 0,
  is_hoist INTEGER DEFAULT 0,
  is_mentionable INTEGER DEFAULT 0,
  permissions TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS server_member_roles (
  server_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES server_roles(id) ON DELETE CASCADE,
  PRIMARY KEY (server_id, user_id, role_id)
);

CREATE TABLE IF NOT EXISTS server_invites (
  code TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  channel_id TEXT,
  creator_id TEXT REFERENCES users(id),
  max_uses INTEGER DEFAULT 0,
  uses INTEGER DEFAULT 0,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS server_events (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  channel_id TEXT,
  creator_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  status TEXT DEFAULT 'scheduled',
  interested_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_emojis (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  is_animated INTEGER DEFAULT 0,
  creator_id TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  server_id TEXT REFERENCES servers(id),
  creator_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  avatar_url TEXT,
  token TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  server_id TEXT REFERENCES servers(id),
  actor_id TEXT REFERENCES users(id),
  target_id TEXT,
  action TEXT NOT NULL,
  changes TEXT,
  reason TEXT,
  created_at INTEGER NOT NULL
);

-- ==============================
-- CHATS, GROUPS, CHANNELS
-- ==============================

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT,
  description TEXT,
  avatar_url TEXT,
  owner_id TEXT REFERENCES users(id),
  server_id TEXT REFERENCES servers(id),
  category_id TEXT,
  is_public INTEGER DEFAULT 0,
  invite_link TEXT UNIQUE,
  invite_link_expires_at INTEGER,
  max_members INTEGER DEFAULT 200000,
  slow_mode_seconds INTEGER DEFAULT 0,
  is_announcement_only INTEGER DEFAULT 0,
  pinned_message_id TEXT,
  topic TEXT,
  linked_chat_id TEXT,
  disappearing_messages_timer INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_message_at INTEGER,
  total_messages INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  custom_title TEXT,
  member_tag TEXT,
  can_send_messages INTEGER DEFAULT 1,
  can_send_media INTEGER DEFAULT 1,
  can_send_polls INTEGER DEFAULT 1,
  can_add_members INTEGER DEFAULT 0,
  can_pin_messages INTEGER DEFAULT 0,
  can_change_info INTEGER DEFAULT 0,
  can_manage_bots INTEGER DEFAULT 0,
  is_anonymous INTEGER DEFAULT 0,
  is_muted INTEGER DEFAULT 0,
  mute_until INTEGER,
  notifications_enabled INTEGER DEFAULT 1,
  joined_at INTEGER NOT NULL,
  invite_by TEXT,
  PRIMARY KEY (chat_id, user_id)
);

-- ==============================
-- MESSAGES
-- ==============================

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  reply_to_id TEXT REFERENCES messages(id),
  thread_id TEXT REFERENCES messages(id),
  forwarded_from_id TEXT,
  forwarded_from_chat_id TEXT,
  type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  media_thumbnail TEXT,
  media_mime_type TEXT,
  media_size INTEGER,
  media_duration INTEGER,
  media_width INTEGER,
  media_height INTEGER,
  is_encrypted INTEGER DEFAULT 1,
  encryption_key TEXT,
  is_edited INTEGER DEFAULT 0,
  edited_at INTEGER,
  edit_history TEXT DEFAULT '[]',
  is_deleted INTEGER DEFAULT 0,
  deleted_for_everyone INTEGER DEFAULT 0,
  deleted_at INTEGER,
  is_pinned INTEGER DEFAULT 0,
  is_starred INTEGER DEFAULT 0,
  is_view_once INTEGER DEFAULT 0,
  view_once_viewed INTEGER DEFAULT 0,
  disappears_at INTEGER,
  is_silent INTEGER DEFAULT 0,
  is_scheduled INTEGER DEFAULT 0,
  scheduled_at INTEGER,
  reactions TEXT DEFAULT '{}',
  mention_ids TEXT DEFAULT '[]',
  bot_webhook_id TEXT,
  inline_keyboard TEXT,
  created_at INTEGER NOT NULL,
  server_id TEXT REFERENCES servers(id)
);

CREATE TABLE IF NOT EXISTS message_reads (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS starred_messages (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  starred_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, message_id)
);

CREATE TABLE IF NOT EXISTS pinned_messages (
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  pinned_by TEXT REFERENCES users(id),
  pinned_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, message_id)
);

-- ==============================
-- POLLS
-- ==============================

CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  is_anonymous INTEGER DEFAULT 1,
  is_quiz INTEGER DEFAULT 0,
  correct_option_index INTEGER,
  explanation TEXT,
  multiple_answers INTEGER DEFAULT 0,
  disable_revote INTEGER DEFAULT 0,
  shuffle_options INTEGER DEFAULT 0,
  time_limit_seconds INTEGER,
  members_only INTEGER DEFAULT 0,
  expires_at INTEGER,
  is_closed INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_options (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  vote_count INTEGER DEFAULT 0,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  voted_at INTEGER NOT NULL,
  PRIMARY KEY (poll_id, user_id, option_id)
);

-- ==============================
-- STATUS / STORIES
-- ==============================

CREATE TABLE IF NOT EXISTS status_updates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'image',
  content TEXT,
  media_url TEXT,
  background_color TEXT,
  font_style TEXT,
  caption TEXT,
  privacy TEXT DEFAULT 'contacts',
  allowed_user_ids TEXT DEFAULT '[]',
  excluded_user_ids TEXT DEFAULT '[]',
  viewers TEXT DEFAULT '[]',
  reactions TEXT DEFAULT '{}',
  reply_count INTEGER DEFAULT 0,
  is_reshare_disabled INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- ==============================
-- CALLS
-- ==============================

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  chat_id TEXT REFERENCES chats(id),
  initiator_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  status TEXT DEFAULT 'ringing',
  started_at INTEGER,
  ended_at INTEGER,
  duration_seconds INTEGER,
  encryption_key TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS call_participants (
  call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER,
  left_at INTEGER,
  is_muted INTEGER DEFAULT 0,
  is_video_on INTEGER DEFAULT 0,
  is_screen_sharing INTEGER DEFAULT 0,
  PRIMARY KEY (call_id, user_id)
);

-- ==============================
-- STICKERS
-- ==============================

CREATE TABLE IF NOT EXISTS sticker_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  creator_id TEXT REFERENCES users(id),
  thumbnail_url TEXT,
  is_official INTEGER DEFAULT 0,
  is_animated INTEGER DEFAULT 0,
  is_public INTEGER DEFAULT 1,
  install_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stickers (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL REFERENCES sticker_packs(id) ON DELETE CASCADE,
  emoji TEXT,
  image_url TEXT NOT NULL,
  is_animated INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_sticker_packs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL REFERENCES sticker_packs(id) ON DELETE CASCADE,
  installed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, pack_id)
);

-- ==============================
-- BOTS & DEVELOPER SYSTEM
-- ==============================

CREATE TABLE IF NOT EXISTS bot_apps (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT UNIQUE NOT NULL,
  client_secret TEXT NOT NULL,
  redirect_uris TEXT DEFAULT '[]',
  scopes TEXT DEFAULT '[]',
  webhook_url TEXT,
  webhook_secret TEXT,
  description TEXT,
  privacy_policy_url TEXT,
  terms_url TEXT,
  icon_url TEXT,
  is_public INTEGER DEFAULT 0,
  install_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_commands (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  description TEXT NOT NULL,
  parameters TEXT DEFAULT '[]',
  scope TEXT DEFAULT 'all',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_server_installs (
  bot_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  installed_by TEXT REFERENCES users(id),
  permissions TEXT DEFAULT '{}',
  installed_at INTEGER NOT NULL,
  PRIMARY KEY (bot_id, server_id)
);

CREATE TABLE IF NOT EXISTS bot_oauth_tokens (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT UNIQUE NOT NULL,
  refresh_token TEXT UNIQUE,
  scopes TEXT DEFAULT '[]',
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);

-- ==============================
-- MODERATION & ADMIN
-- ==============================

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  reported_user_id TEXT REFERENCES users(id),
  reported_message_id TEXT REFERENCES messages(id),
  reported_chat_id TEXT REFERENCES chats(id),
  type TEXT NOT NULL,
  description TEXT,
  evidence_urls TEXT DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at INTEGER,
  action_taken TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  banned_by TEXT,
  ban_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  ai_confidence REAL,
  ai_violation_type TEXT,
  evidence_message_ids TEXT DEFAULT '[]',
  starts_at INTEGER NOT NULL,
  expires_at INTEGER,
  is_active INTEGER DEFAULT 1,
  appeal_status TEXT DEFAULT 'none',
  appeal_submitted_at INTEGER,
  appeal_message TEXT,
  appeal_reviewed_by TEXT,
  appeal_reviewed_at INTEGER,
  appeal_decision_reason TEXT,
  next_review_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_moderation_logs (
  id TEXT PRIMARY KEY,
  message_id TEXT REFERENCES messages(id),
  user_id TEXT REFERENCES users(id),
  violation_type TEXT,
  confidence REAL,
  action_taken TEXT,
  model_version TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  permissions TEXT DEFAULT '{}',
  added_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id),
  updated_at INTEGER NOT NULL
);

-- ==============================
-- CHAT ORGANIZATION
-- ==============================

CREATE TABLE IF NOT EXISTS chat_folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT,
  chat_ids TEXT DEFAULT '[]',
  position INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS archived_chats (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  archived_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, chat_id)
);

CREATE TABLE IF NOT EXISTS muted_chats (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  muted_until INTEGER,
  muted_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, chat_id)
);

-- ==============================
-- INDEXES
-- ==============================

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_bot_token ON users(bot_token);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

CREATE INDEX IF NOT EXISTS idx_chat_members_user_id ON chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_chat_id ON chat_members(chat_id);

CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_scheduled ON messages(is_scheduled, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_messages_disappear ON messages(disappears_at) WHERE disappears_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_server_members_user_id ON server_members(user_id);
CREATE INDEX IF NOT EXISTS idx_server_members_server_id ON server_members(server_id);

CREATE INDEX IF NOT EXISTS idx_status_updates_user_id ON status_updates(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_updates_expires ON status_updates(expires_at);

CREATE INDEX IF NOT EXISTS idx_bans_user_id ON bans(user_id);
CREATE INDEX IF NOT EXISTS idx_bans_active ON bans(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_bans_appeal ON bans(appeal_status);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);

CREATE INDEX IF NOT EXISTS idx_audit_logs_server ON audit_logs(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_moderation_logs ON ai_moderation_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calls_chat_id ON calls(chat_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);

-- ==============================
-- INITIAL SYSTEM SETTINGS
-- ==============================

INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES
  ('registration_enabled', 'true', 0),
  ('bot_creation_enabled', 'true', 0),
  ('max_group_members', '200000', 0),
  ('max_server_members', '500000', 0),
  ('max_file_size_image', '16777216', 0),
  ('max_file_size_video', '2147483648', 0),
  ('max_file_size_doc', '2147483648', 0),
  ('ai_moderation_enabled', 'true', 0),
  ('ai_ban_threshold', '0.95', 0),
  ('ai_delete_threshold', '0.85', 0),
  ('ai_flag_threshold', '0.70', 0),
  ('maintenance_mode', 'false', 0),
  ('app_version', '1.0.0', 0),
  ('team_name', 'DEATH LEGION Team', 0);
