// ============================================
// DL Chat - Presence & Typing Indicators API
// DEATH LEGION Team — Proprietary Software
// ============================================
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';

type AppEnv = { Bindings: Env; Variables: Variables };
const presence = new Hono<AppEnv>();
presence.use('*', authMiddleware);

// GET /api/v1/presence/:userId — get a user's presence info
presence.get('/:userId', async (c) => {
  const { userId } = c.req.param();
  const requestor = c.get('user');

  // Check if the user has blocked the requestor
  const blocked = await c.env.DB.prepare(
    `SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'blocked'`
  ).bind(userId, requestor.id).first();

  if (blocked) {
    return c.json({ user_id: userId, is_online: false, last_seen: null, status: 'offline' });
  }

  const user = await c.env.DB.prepare(
    `SELECT id, last_seen, is_online, custom_status, custom_status_emoji, custom_status_expires_at
     FROM users WHERE id = ?`
  ).bind(userId).first<any>();

  if (!user) throw new HTTPException(404, { message: 'User not found' });

  // Check privacy settings
  const privacyRow = await c.env.DB.prepare(
    'SELECT show_online_status FROM user_privacy WHERE user_id = ?'
  ).bind(userId).first<any>();

  const showOnline = privacyRow?.show_online_status !== 0;

  const now = Date.now();
  const isOnline = showOnline && user.is_online && user.last_seen && (now - user.last_seen) < 120_000; // 2 min threshold
  const customStatusExpired = user.custom_status_expires_at && user.custom_status_expires_at < now;

  return c.json({
    user_id: userId,
    is_online: isOnline,
    last_seen: showOnline ? user.last_seen : null,
    custom_status: customStatusExpired ? null : user.custom_status,
    custom_status_emoji: customStatusExpired ? null : user.custom_status_emoji,
  });
});

// GET /api/v1/presence/chat/:chatId — get online members of a chat
presence.get('/chat/:chatId', async (c) => {
  const { chatId } = c.req.param();
  const user = c.get('user');

  // Verify membership
  const member = await c.env.DB.prepare(
    'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(chatId, user.id).first();
  if (!member) throw new HTTPException(403, { message: 'Not a member of this chat' });

  const threshold = Date.now() - 120_000; // 2 minutes

  const online = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.last_seen,
     u.custom_status, u.custom_status_emoji, cm.role
     FROM chat_members cm JOIN users u ON u.id = cm.user_id
     WHERE cm.chat_id = ? AND u.last_seen > ? AND u.is_banned = 0
     ORDER BY u.display_name ASC LIMIT 100`
  ).bind(chatId, threshold).all();

  return c.json({ online: online.results || [], count: online.results?.length || 0 });
});

// POST /api/v1/presence/status — set custom status
presence.post('/status', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const status = body.status?.slice(0, 128) || null;
  const emoji = body.emoji?.slice(0, 10) || null;
  const expiresIn = body.expires_in; // seconds
  const now = Date.now();
  const expiresAt = expiresIn ? now + expiresIn * 1000 : null;

  await c.env.DB.prepare(
    `UPDATE users SET custom_status = ?, custom_status_emoji = ?, custom_status_expires_at = ? WHERE id = ?`
  ).bind(status, emoji, expiresAt, user.id).run();

  return c.json({ success: true, status, emoji, expires_at: expiresAt });
});

// DELETE /api/v1/presence/status — clear custom status
presence.delete('/status', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare(
    `UPDATE users SET custom_status = NULL, custom_status_emoji = NULL, custom_status_expires_at = NULL WHERE id = ?`
  ).bind(user.id).run();
  return c.json({ success: true });
});

// POST /api/v1/presence/typing — send typing indicator
presence.post('/typing', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const chatId = body.chat_id;
  const isTyping = body.is_typing !== false;

  if (!chatId) throw new HTTPException(400, { message: 'chat_id required' });

  // Broadcast typing event via Durable Object
  try {
    const roomId = c.env.CHAT_ROOM.idFromName(chatId);
    const room = c.env.CHAT_ROOM.get(roomId);
    await room.fetch('https://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'typing',
        user_id: user.id,
        chat_id: chatId,
        is_typing: isTyping,
        timestamp: Date.now(),
      }),
    });
  } catch {}

  return c.json({ success: true });
});

// POST /api/v1/presence/heartbeat — keep-alive / update last_seen
presence.post('/heartbeat', async (c) => {
  const user = c.get('user');
  const now = Date.now();

  await c.env.DB.prepare(
    'UPDATE users SET last_seen = ?, is_online = 1 WHERE id = ?'
  ).bind(now, user.id).run();

  return c.json({ success: true, timestamp: now });
});

export default presence;
