// ============================================
// DL Chat - Telegram-like Bot API Service
// ============================================
import type { Env } from '../types';
import { generateId } from '../utils/hash';

export interface BotUpdate {
  update_id: number;
  message?: BotMessage;
  edited_message?: BotMessage;
  callback_query?: BotCallbackQuery;
  inline_query?: BotInlineQuery;
}

export interface BotMessage {
  message_id: string;
  from: BotUser;
  chat: BotChat;
  date: number;
  text?: string;
  photo?: BotPhoto[];
  document?: BotDocument;
  voice?: BotVoice;
  sticker?: BotSticker;
  poll?: BotPoll;
  location?: BotLocation;
  reply_to_message?: BotMessage;
}

export interface BotUser {
  id: string;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface BotChat {
  id: string;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
}

export interface BotPhoto {
  file_id: string;
  file_size: number;
  width: number;
  height: number;
}

export interface BotDocument {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  file_size: number;
}

export interface BotVoice {
  file_id: string;
  duration: number;
  mime_type?: string;
}

export interface BotSticker {
  file_id: string;
  width: number;
  height: number;
  is_animated: boolean;
  emoji?: string;
}

export interface BotPoll {
  id: string;
  question: string;
  options: Array<{ text: string; voter_count: number }>;
  is_closed: boolean;
}

export interface BotLocation {
  latitude: number;
  longitude: number;
}

export interface BotCallbackQuery {
  id: string;
  from: BotUser;
  message?: BotMessage;
  data?: string;
}

export interface BotInlineQuery {
  id: string;
  from: BotUser;
  query: string;
  offset: string;
}

/**
 * Queue an update for a bot (for long polling)
 */
export async function queueBotUpdate(
  env: Env,
  botId: string,
  update: Omit<BotUpdate, 'update_id'>
): Promise<void> {
  const updateKey = `bot_updates:${botId}`;

  // Get current updates queue
  const current = await env.KV.get(updateKey);
  const updates: BotUpdate[] = current ? JSON.parse(current) : [];

  // Get next update_id
  const lastId = updates.length > 0 ? updates[updates.length - 1].update_id : 0;
  const newUpdate: BotUpdate = { ...update, update_id: lastId + 1 };

  // Keep max 100 updates
  updates.push(newUpdate);
  if (updates.length > 100) {
    updates.splice(0, updates.length - 100);
  }

  await env.KV.put(updateKey, JSON.stringify(updates), {
    expirationTtl: 24 * 60 * 60, // 1 day
  });

  // Also trigger webhook if configured
  const bot = await env.DB.prepare(
    'SELECT bot_token FROM users WHERE id = ?'
  ).bind(botId).first<{ bot_token: string }>();

  if (bot) {
    const webhook = await env.DB.prepare(
      'SELECT webhook_url, webhook_secret FROM bot_apps WHERE bot_id = ? AND webhook_url IS NOT NULL'
    ).bind(botId).first<{ webhook_url: string; webhook_secret: string }>();

    if (webhook?.webhook_url) {
      await triggerWebhook(webhook.webhook_url, webhook.webhook_secret, newUpdate);
    }
  }
}

/**
 * Get pending updates for a bot (long polling)
 */
export async function getBotUpdates(
  env: Env,
  botId: string,
  offset: number = 0,
  limit: number = 100
): Promise<BotUpdate[]> {
  const updateKey = `bot_updates:${botId}`;
  const current = await env.KV.get(updateKey);
  if (!current) return [];

  const updates: BotUpdate[] = JSON.parse(current);

  // Filter updates >= offset
  const filtered = updates.filter(u => u.update_id > offset);
  return filtered.slice(0, limit);
}

/**
 * Acknowledge updates up to a certain offset
 */
export async function acknowledgeUpdates(
  env: Env,
  botId: string,
  upToUpdateId: number
): Promise<void> {
  const updateKey = `bot_updates:${botId}`;
  const current = await env.KV.get(updateKey);
  if (!current) return;

  const updates: BotUpdate[] = JSON.parse(current);
  const remaining = updates.filter(u => u.update_id > upToUpdateId);
  await env.KV.put(updateKey, JSON.stringify(remaining), {
    expirationTtl: 24 * 60 * 60,
  });
}

/**
 * Trigger bot webhook
 */
async function triggerWebhook(
  webhookUrl: string,
  webhookSecret: string | null,
  update: BotUpdate
): Promise<void> {
  try {
    const body = JSON.stringify(update);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'DLChatBot/1.0',
    };

    if (webhookSecret) {
      // Sign with HMAC-SHA256
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(webhookSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
      const sigHex = Array.from(new Uint8Array(sig))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      headers['X-DL-Signature'] = `sha256=${sigHex}`;
    }

    await fetch(webhookUrl, { method: 'POST', headers, body });
  } catch (error) {
    console.error('[Bot Webhook] Failed to trigger:', webhookUrl, error);
  }
}

/**
 * Convert a DL Chat message to Bot API format
 */
export function toBotMessage(msg: any, chat: any, sender: any): BotMessage {
  const botMsg: BotMessage = {
    message_id: msg.id,
    from: {
      id: sender.id,
      is_bot: sender.is_bot === 1,
      first_name: sender.display_name,
      username: sender.username,
    },
    chat: {
      id: chat.id,
      type: chat.type === 'direct' ? 'private' : chat.type === 'group' ? 'supergroup' : 'channel',
      title: chat.name,
      username: chat.username,
    },
    date: Math.floor(msg.created_at / 1000),
    text: msg.type === 'text' ? msg.content : undefined,
  };

  if (msg.type === 'image' && msg.media_url) {
    botMsg.photo = [{
      file_id: msg.media_url,
      file_size: msg.media_size || 0,
      width: msg.media_width || 0,
      height: msg.media_height || 0,
    }];
  }

  if (msg.type === 'voice' && msg.media_url) {
    botMsg.voice = {
      file_id: msg.media_url,
      duration: msg.media_duration || 0,
      mime_type: msg.media_mime_type,
    };
  }

  return botMsg;
}
