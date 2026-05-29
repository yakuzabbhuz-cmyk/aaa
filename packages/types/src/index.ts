// ============================================
// DL Chat - Shared TypeScript Types
// DEATH LEGION Team
// ============================================

// ---- User & Auth ----
export interface User {
  id: string;
  username?: string;
  phone?: string;
  email?: string;
  display_name: string;
  bio?: string;
  avatar_url?: string;
  status: string;
  is_verified: boolean;
  is_premium: boolean;
  is_bot: boolean;
  bot_owner_id?: string;
  bot_token?: string;
  bot_description?: string;
  bot_commands?: BotCommand[];
  is_banned: boolean;
  ban_reason?: string;
  ban_expires_at?: number;
  created_at: number;
  updated_at: number;
  last_seen?: number;
  privacy_last_seen: PrivacyLevel;
  privacy_profile_photo: PrivacyLevel;
  privacy_about: PrivacyLevel;
  privacy_status: PrivacyLevel;
  privacy_read_receipts: boolean;
  privacy_groups: PrivacyLevel;
  custom_theme?: string;
  language: string;
  notification_sound: string;
  two_factor_enabled: boolean;
  public_key?: string;
}

export type PrivacyLevel = 'everyone' | 'contacts' | 'nobody' | 'selected' | 'exclude';

export interface Session {
  id: string;
  user_id: string;
  token: string;
  device_info?: DeviceInfo;
  ip_address?: string;
  created_at: number;
  expires_at: number;
  is_active: boolean;
}

export interface DeviceInfo {
  platform: string;
  os: string;
  os_version: string;
  app_version: string;
  device_name: string;
  device_id?: string;
}

export interface OtpCode {
  id: string;
  target: string;
  code: string;
  type: OtpType;
  expires_at: number;
  used: boolean;
}

export type OtpType = 'register' | 'login' | '2fa';

export interface Contact {
  user_id: string;
  contact_id: string;
  nickname?: string;
  is_blocked: boolean;
  created_at: number;
  user?: User;
}

// ---- Chat ----
export interface Chat {
  id: string;
  type: ChatType;
  name?: string;
  description?: string;
  avatar_url?: string;
  owner_id?: string;
  server_id?: string;
  category_id?: string;
  is_public: boolean;
  invite_link?: string;
  invite_link_expires_at?: number;
  max_members: number;
  slow_mode_seconds: number;
  is_announcement_only: boolean;
  pinned_message_id?: string;
  topic?: string;
  linked_chat_id?: string;
  disappearing_messages_timer: number;
  created_at: number;
  updated_at: number;
  last_message_at?: number;
  total_messages: number;
  is_deleted: boolean;
  // computed fields
  unread_count?: number;
  last_message?: Message;
  members?: ChatMember[];
}

export type ChatType = 'direct' | 'group' | 'channel' | 'server_channel' | 'forum';

export interface ChatMember {
  chat_id: string;
  user_id: string;
  role: MemberRole;
  custom_title?: string;
  member_tag?: string;
  can_send_messages: boolean;
  can_send_media: boolean;
  can_send_polls: boolean;
  can_add_members: boolean;
  can_pin_messages: boolean;
  can_change_info: boolean;
  can_manage_bots: boolean;
  is_anonymous: boolean;
  is_muted: boolean;
  mute_until?: number;
  notifications_enabled: boolean;
  joined_at: number;
  invite_by?: string;
  user?: User;
}

export type MemberRole = 'owner' | 'admin' | 'moderator' | 'member' | 'restricted' | 'banned';

// ---- Server (Discord-like) ----
export interface Server {
  id: string;
  name: string;
  description?: string;
  icon_url?: string;
  banner_url?: string;
  owner_id: string;
  is_public: boolean;
  invite_link?: string;
  max_members: number;
  verification_level: number;
  boost_level: number;
  total_boosts: number;
  rules_channel_id?: string;
  system_channel_id?: string;
  afk_channel_id?: string;
  afk_timeout: number;
  features: string[];
  custom_emojis_count: number;
  created_at: number;
  updated_at: number;
  is_deleted: boolean;
  // computed
  channels?: Chat[];
  member_count?: number;
  roles?: ServerRole[];
}

export interface ServerCategory {
  id: string;
  server_id: string;
  name: string;
  position: number;
  created_at: number;
}

export interface ServerMember {
  server_id: string;
  user_id: string;
  nickname?: string;
  joined_at: number;
  is_banned: boolean;
  ban_reason?: string;
  timeout_until?: number;
  roles?: ServerRole[];
  user?: User;
}

export interface ServerRole {
  id: string;
  server_id: string;
  name: string;
  color: string;
  icon_url?: string;
  position: number;
  is_hoist: boolean;
  is_mentionable: boolean;
  permissions: ServerPermissions;
  created_at: number;
}

export interface ServerPermissions {
  view_channels?: boolean;
  send_messages?: boolean;
  send_media?: boolean;
  manage_messages?: boolean;
  manage_channels?: boolean;
  manage_roles?: boolean;
  manage_server?: boolean;
  kick_members?: boolean;
  ban_members?: boolean;
  mention_everyone?: boolean;
  use_external_emojis?: boolean;
  add_reactions?: boolean;
  connect?: boolean;
  speak?: boolean;
  mute_members?: boolean;
  deafen_members?: boolean;
  move_members?: boolean;
  manage_webhooks?: boolean;
  manage_events?: boolean;
  administrator?: boolean;
}

export interface ServerInvite {
  code: string;
  server_id: string;
  channel_id?: string;
  creator_id?: string;
  max_uses: number;
  uses: number;
  expires_at?: number;
  created_at: number;
  server?: Partial<Server>;
  creator?: Partial<User>;
}

export interface ServerEvent {
  id: string;
  server_id: string;
  channel_id?: string;
  creator_id: string;
  name: string;
  description?: string;
  image_url?: string;
  start_time: number;
  end_time?: number;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  interested_count: number;
  created_at: number;
}

export interface CustomEmoji {
  id: string;
  server_id: string;
  name: string;
  image_url: string;
  is_animated: boolean;
  creator_id?: string;
  created_at: number;
}

export interface Webhook {
  id: string;
  channel_id: string;
  server_id?: string;
  creator_id?: string;
  name: string;
  avatar_url?: string;
  token: string;
  url: string;
  created_at: number;
}

export interface AuditLog {
  id: string;
  server_id?: string;
  actor_id?: string;
  target_id?: string;
  action: string;
  changes?: Record<string, unknown>;
  reason?: string;
  created_at: number;
  actor?: Partial<User>;
}

// ---- Messages ----
export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  reply_to_id?: string;
  thread_id?: string;
  forwarded_from_id?: string;
  forwarded_from_chat_id?: string;
  type: MessageType;
  content?: string;
  media_url?: string;
  media_thumbnail?: string;
  media_mime_type?: string;
  media_size?: number;
  media_duration?: number;
  media_width?: number;
  media_height?: number;
  is_encrypted: boolean;
  encryption_key?: string;
  is_edited: boolean;
  edited_at?: number;
  edit_history?: MessageEdit[];
  is_deleted: boolean;
  deleted_for_everyone: boolean;
  deleted_at?: number;
  is_pinned: boolean;
  is_starred: boolean;
  is_view_once: boolean;
  view_once_viewed: boolean;
  disappears_at?: number;
  is_silent: boolean;
  is_scheduled: boolean;
  scheduled_at?: number;
  reactions: Record<string, string[]>;
  mention_ids: string[];
  bot_webhook_id?: string;
  inline_keyboard?: InlineKeyboardRow[][];
  created_at: number;
  server_id?: string;
  // computed
  sender?: Partial<User>;
  reply_to?: Partial<Message>;
  read_by?: MessageRead[];
}

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'document'
  | 'location'
  | 'contact'
  | 'sticker'
  | 'gif'
  | 'poll'
  | 'system'
  | 'call';

export interface MessageEdit {
  content: string;
  edited_at: number;
}

export interface MessageRead {
  message_id: string;
  user_id: string;
  read_at: number;
}

export interface InlineKeyboardRow {
  text: string;
  callback_data?: string;
  url?: string;
}

// ---- Poll ----
export interface Poll {
  id: string;
  message_id: string;
  question: string;
  is_anonymous: boolean;
  is_quiz: boolean;
  correct_option_index?: number;
  explanation?: string;
  multiple_answers: boolean;
  disable_revote: boolean;
  shuffle_options: boolean;
  time_limit_seconds?: number;
  members_only: boolean;
  expires_at?: number;
  is_closed: boolean;
  created_at: number;
  options: PollOption[];
  user_votes?: string[];
}

export interface PollOption {
  id: string;
  poll_id: string;
  text: string;
  vote_count: number;
  position: number;
}

export interface PollVote {
  poll_id: string;
  user_id: string;
  option_id: string;
  voted_at: number;
}

// ---- Status / Stories ----
export interface StatusUpdate {
  id: string;
  user_id: string;
  type: 'text' | 'image' | 'video' | 'gif';
  content?: string;
  media_url?: string;
  background_color?: string;
  font_style?: string;
  caption?: string;
  privacy: PrivacyLevel;
  allowed_user_ids: string[];
  excluded_user_ids: string[];
  viewers: StatusViewer[];
  reactions: Record<string, string>;
  reply_count: number;
  is_reshare_disabled: boolean;
  created_at: number;
  expires_at: number;
  user?: Partial<User>;
}

export interface StatusViewer {
  user_id: string;
  viewed_at: number;
}

// ---- Calls ----
export interface Call {
  id: string;
  chat_id?: string;
  initiator_id: string;
  type: CallType;
  status: CallStatus;
  started_at?: number;
  ended_at?: number;
  duration_seconds?: number;
  encryption_key?: string;
  created_at: number;
  participants?: CallParticipant[];
  initiator?: Partial<User>;
}

export type CallType = 'voice' | 'video' | 'group_voice' | 'group_video';
export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined';

export interface CallParticipant {
  call_id: string;
  user_id: string;
  joined_at?: number;
  left_at?: number;
  is_muted: boolean;
  is_video_on: boolean;
  is_screen_sharing: boolean;
  user?: Partial<User>;
}

// ---- Stickers ----
export interface StickerPack {
  id: string;
  name: string;
  creator_id?: string;
  thumbnail_url?: string;
  is_official: boolean;
  is_animated: boolean;
  is_public: boolean;
  install_count: number;
  created_at: number;
  stickers?: Sticker[];
}

export interface Sticker {
  id: string;
  pack_id: string;
  emoji?: string;
  image_url: string;
  is_animated: boolean;
  position: number;
}

// ---- Bots ----
export interface Bot extends User {
  bot_app?: BotApp;
  commands?: BotCommand[];
}

export interface BotApp {
  id: string;
  bot_id: string;
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
  scopes: string[];
  webhook_url?: string;
  webhook_secret?: string;
  description?: string;
  privacy_policy_url?: string;
  terms_url?: string;
  icon_url?: string;
  is_public: boolean;
  install_count: number;
  created_at: number;
}

export interface BotCommand {
  id: string;
  bot_id: string;
  command: string;
  description: string;
  parameters: BotCommandParameter[];
  scope: 'all' | 'private' | 'group' | 'channel';
  created_at: number;
}

export interface BotCommandParameter {
  name: string;
  type: 'string' | 'integer' | 'boolean' | 'user' | 'channel' | 'role';
  description: string;
  required: boolean;
}

export interface BotOAuthToken {
  id: string;
  bot_id: string;
  user_id: string;
  access_token: string;
  refresh_token?: string;
  scopes: string[];
  expires_at?: number;
  created_at: number;
}

// ---- Moderation & Bans ----
export interface Report {
  id: string;
  reporter_id: string;
  reported_user_id?: string;
  reported_message_id?: string;
  reported_chat_id?: string;
  type: ReportType;
  description?: string;
  evidence_urls: string[];
  status: ReportStatus;
  reviewed_by?: string;
  reviewed_at?: number;
  action_taken?: string;
  created_at: number;
}

export type ReportType = 'spam' | 'harassment' | 'illegal' | 'misinformation' | 'other';
export type ReportStatus = 'pending' | 'reviewing' | 'actioned' | 'dismissed';

export interface Ban {
  id: string;
  user_id: string;
  banned_by?: string;
  ban_type: 'permanent' | 'temporary' | 'shadow';
  reason: string;
  ai_confidence?: number;
  ai_violation_type?: string;
  evidence_message_ids: string[];
  starts_at: number;
  expires_at?: number;
  is_active: boolean;
  appeal_status: 'none' | 'pending' | 'approved' | 'denied';
  appeal_submitted_at?: number;
  appeal_message?: string;
  appeal_reviewed_by?: string;
  appeal_reviewed_at?: number;
  appeal_decision_reason?: string;
  next_review_at?: number;
  created_at: number;
  user?: Partial<User>;
}

export interface AiModerationLog {
  id: string;
  message_id?: string;
  user_id?: string;
  violation_type?: string;
  confidence?: number;
  action_taken?: string;
  model_version?: string;
  created_at: number;
}

export interface AdminUser {
  user_id: string;
  role: AdminRole;
  permissions: AdminPermissions;
  added_by?: string;
  created_at: number;
  user?: Partial<User>;
}

export type AdminRole = 'superadmin' | 'admin' | 'moderator' | 'support';

export interface AdminPermissions {
  view_users?: boolean;
  manage_users?: boolean;
  view_messages?: boolean;
  delete_messages?: boolean;
  manage_bans?: boolean;
  manage_reports?: boolean;
  view_servers?: boolean;
  manage_servers?: boolean;
  manage_bots?: boolean;
  view_analytics?: boolean;
  manage_settings?: boolean;
  manage_admins?: boolean;
}

export interface SystemSetting {
  key: string;
  value: string;
  updated_by?: string;
  updated_at: number;
}

// ---- Chat Organization ----
export interface ChatFolder {
  id: string;
  user_id: string;
  name: string;
  emoji?: string;
  chat_ids: string[];
  position: number;
  created_at: number;
}

// ---- WebSocket Events ----
export type WsClientEvent =
  | { type: 'subscribe'; chatId: string }
  | { type: 'unsubscribe'; chatId: string }
  | { type: 'typing'; chatId: string; isTyping: boolean }
  | { type: 'presence'; status: 'online' | 'away' | 'offline' }
  | { type: 'message_read'; messageId: string; chatId: string }
  | { type: 'call_signal'; callId: string; signal: RTCSignal };

export type WsServerEvent =
  | { type: 'new_message'; message: Message }
  | { type: 'message_edited'; message: Message }
  | { type: 'message_deleted'; messageId: string; chatId: string }
  | { type: 'reaction'; messageId: string; chatId: string; reactions: Record<string, string[]> }
  | { type: 'typing'; chatId: string; userId: string; isTyping: boolean }
  | { type: 'presence'; userId: string; status: string; lastSeen?: number }
  | { type: 'call_incoming'; call: Call }
  | { type: 'call_signal'; callId: string; signal: RTCSignal; fromUserId: string }
  | { type: 'status_update'; status: StatusUpdate }
  | { type: 'chat_update'; chat: Partial<Chat> }
  | { type: 'member_update'; chatId: string; member: Partial<ChatMember> }
  | { type: 'error'; code: string; message: string };

export interface RTCSignal {
  type: 'offer' | 'answer' | 'ice-candidate';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  targetUserId?: string;
}

// ---- API Request/Response Types ----

// Auth
export interface RegisterRequest {
  phone?: string;
  email?: string;
  display_name: string;
  country_code?: string;
}

export interface VerifyOtpRequest {
  target: string;
  code: string;
  type: OtpType;
  device_info?: DeviceInfo;
}

export interface LoginRequest {
  phone?: string;
  email?: string;
  password?: string;
  device_info?: DeviceInfo;
}

export interface AuthResponse {
  user: User;
  token: string;
  refresh_token: string;
  expires_at: number;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

// Messages
export interface SendMessageRequest {
  type: MessageType;
  content?: string;
  media_url?: string;
  media_mime_type?: string;
  media_size?: number;
  media_duration?: number;
  media_width?: number;
  media_height?: number;
  reply_to_id?: string;
  thread_id?: string;
  mention_ids?: string[];
  is_silent?: boolean;
  is_scheduled?: boolean;
  scheduled_at?: number;
  is_view_once?: boolean;
  inline_keyboard?: InlineKeyboardRow[][];
  // Poll data
  poll?: {
    question: string;
    options: string[];
    is_anonymous?: boolean;
    is_quiz?: boolean;
    correct_option_index?: number;
    explanation?: string;
    multiple_answers?: boolean;
    time_limit_seconds?: number;
    expires_at?: number;
  };
  // Location
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  // Contact
  contact?: {
    name: string;
    phone: string;
    user_id?: string;
  };
}

export interface EditMessageRequest {
  content: string;
}

// Pagination
export interface PaginationParams {
  limit?: number;
  offset?: number;
  before?: string;
  after?: string;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total?: number;
  has_more: boolean;
  next_cursor?: string;
}

// Upload
export interface UploadResponse {
  key: string;
  url: string;
  size: number;
  mime_type: string;
}

// Admin
export interface AdminStats {
  total_users: number;
  active_users_today: number;
  total_messages: number;
  messages_today: number;
  total_servers: number;
  total_bots: number;
  active_bans: number;
  pending_reports: number;
  pending_appeals: number;
  storage_used_bytes: number;
}

// E2E Encryption
export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface EncryptedMessage {
  ciphertext: string;
  iv: string;
  encryptedKey: string;
  senderPublicKey: string;
}
