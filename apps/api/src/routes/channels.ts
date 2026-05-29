// ============================================
// DL Chat - Channel Routes (Telegram-like)
// ============================================
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { generateId, generateInviteCode } from '../utils/hash';
import { createChannelSchema } from '../utils/validators';

type AppEnv = { Bindings: Env; Variables: Variables };
const channels = new Hono<AppEnv>();

channels.use('*', authMiddleware);

// POST /api/v1/channels
channels.post('/', zValidator('json', createChannelSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const now = Date.now();

  const chatId = generateId();
  const inviteCode = generateInviteCode(12);

  await c.env.DB.prepare(
    `INSERT INTO chats (id, type, name, description, avatar_url, owner_id, is_public, invite_link, 
     is_announcement_only, created_at, updated_at)
     VALUES (?, 'channel', ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).bind(chatId, body.name, body.description || null, body.avatar_url || null, user.id, body.is_public ? 1 : 0, inviteCode, now, now).run();

  // Add owner as member
  await c.env.DB.prepare(
    `INSERT INTO chat_members (chat_id, user_id, role, can_send_messages, can_send_media, can_add_members, 
     can_pin_messages, can_change_info, joined_at)
     VALUES (?, ?, 'owner', 1, 1, 1, 1, 1, ?)`
  ).bind(chatId, user.id, now).run();

  const chat = await c.env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(chatId).first();
  return c.json({ channel: chat }, 201);
});

// GET /api/v1/channels/discover
channels.get('/discover', async (c) => {
  const query = c.req.query('q');
  const limit = parseInt(c.req.query('limit') || '20');

  let sql = `SELECT c.id, c.name, c.description, c.avatar_url, c.total_messages, c.created_at,
   (SELECT COUNT(*) FROM chat_members cm WHERE cm.chat_id = c.id) as subscriber_count
   FROM chats c WHERE c.type = 'channel' AND c.is_public = 1 AND c.is_deleted = 0`;

  const params: unknown[] = [];
  if (query) {
    sql += ' AND (c.name LIKE ? OR c.description LIKE ?)';
    params.push(`%${query}%`, `%${query}%`);
  }

  sql += ' ORDER BY subscriber_count DESC LIMIT ?';
  params.push(limit);

  const result = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ channels: result.results });
});

// GET /api/v1/channels/search
channels.get('/search', async (c) => {
  const query = c.req.query('q');
  const limit = parseInt(c.req.query('limit') || '20');

  if (!query) {
    throw new HTTPException(400, { message: 'Query required' });
  }

  const result = await c.env.DB.prepare(
    `SELECT c.id, c.name, c.description, c.avatar_url, c.is_public,
     (SELECT COUNT(*) FROM chat_members cm WHERE cm.chat_id = c.id) as subscriber_count
     FROM chats c WHERE c.type = 'channel' AND (c.name LIKE ? OR c.description LIKE ?) AND c.is_deleted = 0
     ORDER BY subscriber_count DESC LIMIT ?`
  ).bind(`%${query}%`, `%${query}%`, limit).all();

  return c.json({ channels: result.results });
});

// GET /api/v1/channels/:id
channels.get('/:id', async (c) => {
  const user = c.get('user');
  const channelId = c.req.param('id');

  const channel = await c.env.DB.prepare('SELECT * FROM chats WHERE id = ? AND type = ? AND is_deleted = 0').bind(channelId, 'channel').first<any>();
  if (!channel) {
    throw new HTTPException(404, { message: 'Channel not found' });
  }

  const subscriberCount = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM chat_members WHERE chat_id = ? AND role != 'banned'`
  ).bind(channelId).first<{ count: number }>();

  const isMember = await c.env.DB.prepare(
    'SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(channelId, user.id).first<any>();

  return c.json({
    channel: {
      ...channel,
      subscriber_count: subscriberCount?.count || 0,
      is_subscribed: !!isMember,
      membership: isMember,
    }
  });
});

// PUT /api/v1/channels/:id
channels.put('/:id', async (c) => {
  const user = c.get('user');
  const channelId = c.req.param('id');
  const body = await c.req.json();

  const member = await c.env.DB.prepare(
    'SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(channelId, user.id).first<any>();

  if (!member || !['owner', 'admin'].includes(member.role)) {
    throw new HTTPException(403, { message: 'Not authorized' });
  }

  const allowed = ['name', 'description', 'avatar_url', 'is_public', 'linked_chat_id'];
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(body[key]);
    }
  }

  if (fields.length > 0) {
    fields.push('updated_at = ?');
    values.push(Date.now(), channelId);
    await c.env.DB.prepare(`UPDATE chats SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  const updated = await c.env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(channelId).first();
  return c.json({ channel: updated });
});

// DELETE /api/v1/channels/:id
channels.delete('/:id', async (c) => {
  const user = c.get('user');
  const channelId = c.req.param('id');

  const channel = await c.env.DB.prepare('SELECT owner_id FROM chats WHERE id = ?').bind(channelId).first<any>();
  if (!channel || channel.owner_id !== user.id) {
    throw new HTTPException(403, { message: 'Not authorized' });
  }

  await c.env.DB.prepare('UPDATE chats SET is_deleted = 1, updated_at = ? WHERE id = ?').bind(Date.now(), channelId).run();
  return c.json({ success: true });
});

// POST /api/v1/channels/:id/subscribe
channels.post('/:id/subscribe', async (c) => {
  const user = c.get('user');
  const channelId = c.req.param('id');
  const now = Date.now();

  const channel = await c.env.DB.prepare('SELECT id, max_members, is_deleted FROM chats WHERE id = ? AND type = ?').bind(channelId, 'channel').first<any>();
  if (!channel || channel.is_deleted) {
    throw new HTTPException(404, { message: 'Channel not found' });
  }

  const existing = await c.env.DB.prepare('SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?').bind(channelId, user.id).first<any>();

  if (existing && existing.role !== 'banned') {
    return c.json({ success: true, already_subscribed: true });
  }

  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO chat_members (chat_id, user_id, role, can_send_messages, can_send_media, joined_at)
     VALUES (?, ?, 'member', 0, 0, ?)`
  ).bind(channelId, user.id, now).run();

  return c.json({ success: true, already_subscribed: false }, 201);
});

// DELETE /api/v1/channels/:id/subscribe
channels.delete('/:id/subscribe', async (c) => {
  const user = c.get('user');
  const channelId = c.req.param('id');

  await c.env.DB.prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').bind(channelId, user.id).run();
  return c.json({ success: true });
});

// GET /api/v1/channels/:id/stats
channels.get('/:id/stats', async (c) => {
  const user = c.get('user');
  const channelId = c.req.param('id');

  const member = await c.env.DB.prepare('SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?').bind(channelId, user.id).first<any>();
  if (!member || !['owner', 'admin'].includes(member.role)) {
    throw new HTTPException(403, { message: 'Admin access required' });
  }

  const stats = await c.env.DB.prepare(
    `SELECT 
      (SELECT COUNT(*) FROM chat_members WHERE chat_id = ?) as total_subscribers,
      (SELECT COUNT(*) FROM messages WHERE chat_id = ? AND is_deleted = 0) as total_messages,
      (SELECT COUNT(*) FROM messages WHERE chat_id = ? AND is_deleted = 0 AND created_at > ?) as messages_today,
      (SELECT COUNT(*) FROM message_reads WHERE message_id IN (SELECT id FROM messages WHERE chat_id = ? LIMIT 100)) as total_views`
  ).bind(channelId, channelId, channelId, Date.now() - 86400000, channelId).first();

  return c.json({ stats });
});

export default channels;
