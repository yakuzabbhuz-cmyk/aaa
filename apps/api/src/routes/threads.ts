// ============================================
// DL Chat - Message Threads API Routes
// DEATH LEGION Team — Proprietary Software
// ============================================
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { generateId } from '../utils/hash';

type AppEnv = { Bindings: Env; Variables: Variables };
const threads = new Hono<AppEnv>();
threads.use('*', authMiddleware);

const replySchema = z.object({
  content: z.string().min(1).max(4096),
  message_type: z.enum(['text', 'image', 'file', 'voice', 'sticker', 'gif']).default('text'),
  file_url: z.string().url().optional(),
  file_name: z.string().max(255).optional(),
  file_size: z.number().int().optional(),
  mentions: z.array(z.string()).max(20).optional(),
  encryption: z.object({
    algorithm: z.string().optional(),
    iv: z.string().optional(),
    tag: z.string().optional(),
  }).optional(),
});

// GET /api/v1/threads/:messageId — get thread replies for a message
threads.get('/:messageId', async (c) => {
  const { messageId } = c.req.param();
  const user = c.get('user');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const offset = parseInt(c.req.query('offset') || '0');

  // Verify the parent message exists and user has access
  const parent = await c.env.DB.prepare(
    `SELECT m.id, m.chat_id, m.content, m.sender_id, m.created_at,
     u.display_name, u.avatar_url, u.username
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ?
     WHERE m.id = ? AND m.reply_to_id IS NULL`
  ).bind(user.id, messageId).first<any>();

  if (!parent) throw new HTTPException(404, { message: 'Thread parent message not found' });

  // Get reply count
  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM messages WHERE reply_to_id = ? AND is_deleted = 0'
  ).bind(messageId).first<{ cnt: number }>();

  // Get replies
  const replies = await c.env.DB.prepare(
    `SELECT m.*, u.display_name as sender_name, u.avatar_url as sender_avatar,
     u.username as sender_username, u.is_verified as sender_verified, u.is_bot as sender_is_bot,
     (SELECT GROUP_CONCAT(r.emoji) FROM message_reactions r WHERE r.message_id = m.id) as reaction_emojis
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.reply_to_id = ? AND m.is_deleted = 0
     ORDER BY m.created_at ASC LIMIT ? OFFSET ?`
  ).bind(messageId, limit, offset).all();

  return c.json({
    parent_message: {
      id: parent.id,
      content: parent.content,
      sender_name: parent.display_name,
      sender_username: parent.username,
      sender_avatar: parent.avatar_url,
      created_at: parent.created_at,
    },
    replies: replies.results || [],
    total_replies: countRow?.cnt || 0,
    has_more: (countRow?.cnt || 0) > offset + limit,
  });
});

// POST /api/v1/threads/:messageId — reply to a message (start/add to thread)
threads.post('/:messageId', zValidator('json', replySchema), async (c) => {
  const { messageId } = c.req.param();
  const user = c.get('user');
  const body = c.req.valid('json');

  // Verify the parent message exists and user has access
  const parent = await c.env.DB.prepare(
    `SELECT m.id, m.chat_id FROM messages m
     JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ?
     WHERE m.id = ?`
  ).bind(user.id, messageId).first<any>();

  if (!parent) throw new HTTPException(404, { message: 'Parent message not found' });

  // Prevent threading beyond 1 level (reply to reply not allowed - keep it clean)
  const isAlreadyReply = await c.env.DB.prepare(
    'SELECT reply_to_id FROM messages WHERE id = ?'
  ).bind(messageId).first<any>();

  // If the message is itself a reply, use its parent as thread root
  const threadRootId = isAlreadyReply?.reply_to_id || messageId;

  const id = generateId();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO messages (id, chat_id, sender_id, reply_to_id, content, message_type,
     file_url, file_name, file_size, mentions_json, encryption_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    parent.chat_id,
    user.id,
    threadRootId,
    body.content,
    body.message_type,
    body.file_url ?? null,
    body.file_name ?? null,
    body.file_size ?? null,
    body.mentions ? JSON.stringify(body.mentions) : null,
    body.encryption ? JSON.stringify(body.encryption) : null,
    now
  ).run();

  // Update reply count on parent message
  await c.env.DB.prepare(
    'UPDATE messages SET reply_count = reply_count + 1, last_reply_at = ? WHERE id = ?'
  ).bind(now, threadRootId).run();

  // Broadcast to chat room
  try {
    const roomId = c.env.CHAT_ROOM.idFromName(parent.chat_id);
    const room = c.env.CHAT_ROOM.get(roomId);
    await room.fetch('https://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'thread_reply',
        message_id: id,
        parent_id: threadRootId,
        chat_id: parent.chat_id,
        sender_id: user.id,
        content: body.content,
        timestamp: now,
      }),
    });
  } catch {}

  return c.json({
    id,
    chat_id: parent.chat_id,
    reply_to_id: threadRootId,
    content: body.content,
    message_type: body.message_type,
    sender_id: user.id,
    created_at: now,
  }, 201);
});

// DELETE /api/v1/threads/:messageId/:replyId — delete a thread reply
threads.delete('/:messageId/:replyId', async (c) => {
  const { replyId } = c.req.param();
  const user = c.get('user');

  const reply = await c.env.DB.prepare(
    'SELECT id, reply_to_id, sender_id, chat_id FROM messages WHERE id = ?'
  ).bind(replyId).first<any>();

  if (!reply) throw new HTTPException(404, { message: 'Reply not found' });

  // Check if user is sender or chat admin
  const isAdmin = await c.env.DB.prepare(
    'SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ? AND role IN (?,?)'
  ).bind(reply.chat_id, user.id, 'admin', 'owner').first();

  if (reply.sender_id !== user.id && !isAdmin) {
    throw new HTTPException(403, { message: 'Cannot delete this reply' });
  }

  await c.env.DB.prepare(
    'UPDATE messages SET is_deleted = 1, content = "[deleted]", deleted_at = ? WHERE id = ?'
  ).bind(Date.now(), replyId).run();

  // Decrement reply count
  await c.env.DB.prepare(
    'UPDATE messages SET reply_count = MAX(0, reply_count - 1) WHERE id = ?'
  ).bind(reply.reply_to_id).run();

  return c.json({ success: true });
});

export default threads;
