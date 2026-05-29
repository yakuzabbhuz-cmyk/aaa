// ============================================
// DL Chat - Pinned Messages API
// DEATH LEGION Team
// ============================================

import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';

type AppEnv = { Bindings: Env; Variables: Variables };
const pinned = new Hono<AppEnv>();

pinned.use('*', authMiddleware);

// GET /pinned/:chatId - Get all pinned messages in a chat
pinned.get('/:chatId', async (c) => {
  const { chatId } = c.req.param();
  const userId = c.get('userId');

  // Verify user is in chat
  const member = await c.env.DB.prepare(
    'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NULL'
  ).bind(chatId, userId).first();
  
  if (!member) return c.json({ error: 'Not a member of this chat' }, 403);

  const pins = await c.env.DB.prepare(`
    SELECT pm.*, m.content, m.type, m.sender_id, m.created_at as message_created_at,
           u.username as sender_username, u.display_name as sender_display_name, u.avatar_url as sender_avatar,
           pu.username as pinned_by_username
    FROM pinned_messages pm
    JOIN messages m ON pm.message_id = m.id
    JOIN users u ON m.sender_id = u.id
    JOIN users pu ON pm.pinned_by = pu.id
    WHERE pm.chat_id = ?
    ORDER BY pm.pinned_at DESC
  `).bind(chatId).all();

  return c.json({ success: true, pins: pins.results, count: pins.results.length });
});

// POST /pinned/:chatId - Pin a message
pinned.post('/:chatId', async (c) => {
  const { chatId } = c.req.param();
  const userId = c.get('userId');
  const { messageId, notify = true } = await c.req.json();

  if (!messageId) return c.json({ error: 'messageId required' }, 400);

  // Verify user is admin/mod or check permissions
  const member = await c.env.DB.prepare(
    `SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NULL`
  ).bind(chatId, userId).first();
  
  if (!member) return c.json({ error: 'Not a member' }, 403);
  
  // For groups, only admins can pin
  const chat = await c.env.DB.prepare('SELECT type FROM chats WHERE id = ?').bind(chatId).first();
  if (chat && (chat.type === 'group' || chat.type === 'channel')) {
    if (member.role !== 'admin' && member.role !== 'moderator') {
      return c.json({ error: 'Only admins and moderators can pin messages' }, 403);
    }
  }

  // Check max pins (50 per chat)
  const count = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM pinned_messages WHERE chat_id = ?').bind(chatId).first();
  if ((count?.cnt as number) >= 50) {
    return c.json({ error: 'Maximum 50 pinned messages per chat' }, 400);
  }

  // Check not already pinned
  const existing = await c.env.DB.prepare(
    'SELECT 1 FROM pinned_messages WHERE chat_id = ? AND message_id = ?'
  ).bind(chatId, messageId).first();
  
  if (existing) return c.json({ error: 'Message already pinned' }, 409);

  const now = new Date().toISOString();
  await c.env.DB.prepare(
    'INSERT INTO pinned_messages (id, chat_id, message_id, pinned_by, pinned_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), chatId, messageId, userId, now).run();

  return c.json({ success: true, message: 'Message pinned successfully' });
});

// DELETE /pinned/:chatId/:messageId - Unpin a message
pinned.delete('/:chatId/:messageId', async (c) => {
  const { chatId, messageId } = c.req.param();
  const userId = c.get('userId');

  const member = await c.env.DB.prepare(
    `SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NULL`
  ).bind(chatId, userId).first();
  
  if (!member) return c.json({ error: 'Not a member' }, 403);

  const chat = await c.env.DB.prepare('SELECT type FROM chats WHERE id = ?').bind(chatId).first();
  if (chat && (chat.type === 'group' || chat.type === 'channel')) {
    if (member.role !== 'admin' && member.role !== 'moderator') {
      return c.json({ error: 'Only admins and moderators can unpin messages' }, 403);
    }
  }

  await c.env.DB.prepare(
    'DELETE FROM pinned_messages WHERE chat_id = ? AND message_id = ?'
  ).bind(chatId, messageId).run();

  return c.json({ success: true, message: 'Message unpinned' });
});

// DELETE /pinned/:chatId - Unpin all messages
pinned.delete('/:chatId', async (c) => {
  const { chatId } = c.req.param();
  const userId = c.get('userId');

  const member = await c.env.DB.prepare(
    `SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NULL AND role = 'admin'`
  ).bind(chatId, userId).first();
  
  if (!member) return c.json({ error: 'Only admins can unpin all messages' }, 403);

  await c.env.DB.prepare('DELETE FROM pinned_messages WHERE chat_id = ?').bind(chatId).run();

  return c.json({ success: true, message: 'All messages unpinned' });
});

export default pinned;
