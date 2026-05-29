// ============================================
// DL Chat Bot SDK — Type Definitions
// DEATH LEGION Team — Proprietary Software
// ============================================

export interface BotConfig {
  token: string;
  apiUrl?: string;
  polling?: {
    interval?: number;      // ms, default 1000
    timeout?: number;       // long-poll timeout seconds
    limit?: number;         // max updates per poll
    allowedUpdates?: UpdateType[];
  };
  webhook?: {
    url: string;
    secret?: string;
    port?: number;
    path?: string;
  };
  rateLimits?: {
    global?: number;        // requests/minute
    perUser?: number;       // per-user requests/minute
  };
}

export type UpdateType =
  | 'message'
  | 'edited_message'
  | 'channel_post'
  | 'callback_query'
  | 'inline_query'
  | 'chosen_inline_result'
  | 'reaction'
  | 'poll_vote'
  | 'member_joined'
  | 'member_left'
  | 'bot_command'
  | 'mention'
  | 'reply'
  | 'all';

export interface Update {
  update_id: string;
  type: UpdateType;
  timestamp: number;
  message?: Message;
  edited_message?: Message;
  callback_query?: CallbackQuery;
  inline_query?: InlineQuery;
  reaction?: Reaction;
  poll_vote?: PollVote;
  member?: MemberUpdate;
}

export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  is_bot: boolean;
  is_verified: boolean;
  language_code?: string;
}

export interface Chat {
  id: string;
  type: 'direct' | 'group' | 'channel' | 'server';
  name?: string;
  description?: string;
  avatar_url?: string;
  member_count?: number;
  username?: string;
  is_verified?: boolean;
}

export interface Message {
  id: string;
  chat: Chat;
  from: User;
  date: number;
  content: string;
  message_type: MessageType;
  reply_to?: Message;
  forward_from?: User;
  forward_date?: number;
  entities?: MessageEntity[];
  file_url?: string;
  file_name?: string;
  file_size?: number;
  voice_duration?: number;
  video_duration?: number;
  sticker_id?: string;
  poll_id?: string;
  metadata?: Record<string, unknown>;
  // Convenience
  text?: string;
  caption?: string;
}

export type MessageType =
  | 'text' | 'image' | 'video' | 'audio' | 'voice'
  | 'document' | 'sticker' | 'gif' | 'poll' | 'location'
  | 'contact' | 'webhook' | 'system';

export interface MessageEntity {
  type: 'mention' | 'hashtag' | 'url' | 'bold' | 'italic' | 'code' | 'pre' | 'spoiler' | 'command';
  offset: number;
  length: number;
  url?: string;
  user?: User;
  language?: string;
}

export interface CallbackQuery {
  id: string;
  from: User;
  message?: Message;
  data: string;
  timestamp: number;
}

export interface InlineQuery {
  id: string;
  from: User;
  query: string;
  offset?: string;
  chat_type?: string;
}

export interface InlineResult {
  id: string;
  type: 'article' | 'photo' | 'gif' | 'video' | 'audio' | 'document' | 'sticker';
  title?: string;
  description?: string;
  thumb_url?: string;
  content?: string;
  url?: string;
  file_url?: string;
  caption?: string;
  reply_markup?: InlineKeyboard;
}

export interface Reaction {
  message_id: string;
  user: User;
  emoji: string;
  chat: Chat;
  timestamp: number;
}

export interface PollVote {
  poll_id: string;
  user: User;
  option_indices: number[];
  timestamp: number;
}

export interface MemberUpdate {
  type: 'joined' | 'left' | 'banned' | 'kicked' | 'promoted' | 'demoted';
  user: User;
  chat: Chat;
  by?: User;
  timestamp: number;
}

export interface SendMessageOptions {
  reply_to_id?: string;
  parse_mode?: 'markdown' | 'html' | 'text';
  disable_notification?: boolean;
  reply_markup?: ReplyMarkup;
  entities?: MessageEntity[];
  protect_content?: boolean;
  message_thread_id?: string;
}

export type ReplyMarkup = InlineKeyboard | ReplyKeyboard | RemoveKeyboard;

export interface InlineKeyboard {
  type: 'inline_keyboard';
  inline_keyboard: InlineKeyboardButton[][];
}

export interface ReplyKeyboard {
  type: 'keyboard';
  keyboard: KeyboardButton[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  placeholder?: string;
  selective?: boolean;
}

export interface RemoveKeyboard {
  type: 'remove_keyboard';
  selective?: boolean;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
  switch_inline_query?: string;
  switch_inline_query_current_chat?: string;
  web_app?: { url: string };
}

export interface KeyboardButton {
  text: string;
  request_contact?: boolean;
  request_location?: boolean;
}

export interface BotCommand {
  command: string;
  description: string;
  scope?: 'all_private_chats' | 'all_group_chats' | 'all_chats' | string;
}

export interface BotInfo {
  id: string;
  username: string;
  display_name: string;
  is_bot: true;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
  supports_inline_queries: boolean;
}

export interface File {
  file_id: string;
  file_name?: string;
  file_size?: number;
  file_url: string;
  content_type?: string;
  expires_at?: number;
}

export type Middleware<T = {}> = (ctx: T, next: () => Promise<void>) => Promise<void> | void;
export type Handler<T = {}> = (ctx: T) => Promise<void> | void;
export type Filter<T = {}> = (ctx: T) => boolean | Promise<boolean>;
