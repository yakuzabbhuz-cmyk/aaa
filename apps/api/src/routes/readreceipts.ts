// ============================================
// DL Chat - Read Receipts API
// DEATH LEGION Team
// ============================================

import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';

type AppEnv = { Bindings: Env; Variables: Variables };
const readreceipts = new Hono<AppEnv>();

readreceipts.use('*', authMiddleware);

// POST /read-receipts/mark - Mark messages as read
readreceipts.post('/mark', async (c) => {
  const userId = c.get('userId');
  const { chatId, messageId, markAll = false } = await c.req.json();

  if (!chatId) return c.json({ error: 'chatId required' }, 400);

  // Verify membership
  const member = await c.env.DB.prepare(
    'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NULL'
  ).bind(chatId, userId).first();
  
  if (!member) return c.json({ error: 'Not a member' }, 403);

  const now = new Date().toISOString();

  if (markAll || !messageId) {
    // Mark all unread messages in chat as read
    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO message_reads (id, message_id, user_id, read_at)
      SELECT COALESCE(mr.id, ?), m.id, ?, ?
      FROM messages m
      LEFT JOIN message_reads mr ON m.id = mr.message_id AND mr.user_id = ?
      WHERE m.chat_id = ? AND m.sender_id != ? AND m.deleted_at IS NULL
        AND mr.id IS NULL
    `).bind(crypto.randomUUID(), userId, now, userId, chatId, userId).run().catch(() => {});
    
    // Update last_read_at in chat_members
    await c.env.DB.prepare(
      'UPDATE chat_members SET last_read_at = ? WHERE chat_id = ? AND user_id = ?'
    ).bind(now, chatId, userId).run();
  } else {
    // Mark specific message as read
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO message_reads (id, message_id, user_id, read_at)
      VALUES (?, ?, ?, ?)
    `).bind(crypto.randomUUID(), messageId, userId, now).run();
  }

  return c.json({ success: true, markedAt: now });
});

// GET /read-receipts/:messageId - Get read receipts for a message
readreceipts.get('/:messageId', async (c) => {
  const { messageId } = c.req.param();
  const userId = c.get('userId');

  // Verify user has access to this message
  const message = await c.env.DB.prepare(`
    SELECT m.*, ch.type as chat_type FROM messages m
    JOIN chats ch ON m.chat_id = ch.id
    JOIN chat_members cm ON m.chat_id = cm.chat_id
    WHERE m.id = ? AND cm.user_id = ? AND cm.left_at IS NULL
  `).bind(messageId, userId).first();

  if (!message) return c.json({ error: 'Message not found or no access' }, 404);

  // For group chats, only show receipts to sender
  if (message.chat_type !== 'dm' && message.sender_id !== userId) {
    // For non-DM, show count only
    const count = await c.env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM message_reads WHERE message_id = ?'
    ).bind(messageId).first();
    return c.json({ success: true, readCount: count?.cnt || 0, readers: null });
  }

  const receipts = await c.env.DB.prepare(`
    SELECT mr.read_at, u.username, u.display_name, u.avatar_url
    FROM message_reads mr
    JOIN users u ON mr.user_id = u.id
    WHERE mr.message_id = ?
    ORDER BY mr.read_at ASC
  `).bind(messageId).all();

  return c.json({
    success: true,
    messageId,
    readCount: receipts.results.length,
    readers: receipts.results,
    deliveredAt: message.created_at
  });
});

// GET /read-receipts/chat/:chatId/unread - Get unread count per chat
readreceipts.get('/chat/:chatId/unread', async (c) => {
  const { chatId } = c.req.param();
  const userId = c.get('userId');

  const member = await c.env.DB.prepare(
    'SELECT last_read_at FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NULL'
  ).bind(chatId, userId).first();
  
  if (!member) return c.json({ error: 'Not a member' }, 403);

  const unreadCount = await c.env.DB.prepare(`
    SELECT COUNT(*) as cnt FROM messages
    WHERE chat_id = ? 
      AND sender_id != ?
      AND deleted_at IS NULL
      AND id NOT IN (SELECT message_id FROM message_reads WHERE user_id = ?)
  `).bind(chatId, userId, userId).first();

  // Get first unread message
  const firstUnread = await c.env.DB.prepare(`
    SELECT id, created_at FROM messages
    WHERE chat_id = ? AND sender_id != ? AND deleted_at IS NULL
      AND id NOT IN (SELECT message_id FROM message_reads WHERE user_id = ?)
    ORDER BY created_at ASC LIMIT 1
  `).bind(chatId, userId, userId).first();

  return c.json({
    success: true,
    chatId,
    unreadCount: (unreadCount?.cnt as number) || 0,
    firstUnreadMessageId: firstUnread?.id || null,
    lastReadAt: member.last_read_at
  });
});

// GET /read-receipts/unread - Get total unread counts across all chats
readreceipts.get('/unread', async (c) => {
  const userId = c.get('userId');

  const unreadByChat = await c.env.DB.prepare(`
    SELECT 
      m.chat_id,
      COUNT(*) as unread_count,
      MAX(m.created_at) as latest_message_at
    FROM messages m
    JOIN chat_members cm ON m.chat_id = cm.chat_id
    WHERE cm.user_id = ? AND cm.left_at IS NULL
      AND m.sender_id != ?
      AND m.deleted_at IS NULL
      AND m.id NOT IN (SELECT message_id FROM message_reads WHERE user_id = ?)
    GROUP BY m.chat_id
    ORDER BY latest_message_at DESC
  `).bind(userId, userId, userId).all();

  const totalUnread = (unreadByChat.results as any[]).reduce((sum, r) => sum + (r.unread_count as number), 0);

  return c.json({
    success: true,
    totalUnread,
    byChat: unreadByChat.results
  });
});

export default readreceipts;
