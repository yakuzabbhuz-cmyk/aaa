// ============================================
// DL Chat - Reactions API Routes
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
const reactions = new Hono<AppEnv>();
reactions.use('*', authMiddleware);

const addReactionSchema = z.object({
  emoji: z.string().min(1).max(10),
  custom_emoji_id: z.string().optional(),
});

// GET /api/v1/reactions/:messageId — get all reactions for a message
reactions.get('/:messageId', async (c) => {
  const { messageId } = c.req.param();
  const user = c.get('user');

  // Verify message exists and user can see it
  const msg = await c.env.DB.prepare(
    `SELECT m.id, m.chat_id FROM messages m
     JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ?
     WHERE m.id = ?`
  ).bind(user.id, messageId).first<any>();

  if (!msg) throw new HTTPException(404, { message: 'Message not found or access denied' });

  const rows = await c.env.DB.prepare(
    `SELECT r.emoji, r.custom_emoji_id,
     COUNT(*) as count,
     GROUP_CONCAT(r.user_id) as user_ids,
     MAX(CASE WHEN r.user_id = ? THEN 1 ELSE 0 END) as reacted_by_me
     FROM message_reactions r WHERE r.message_id = ?
     GROUP BY r.emoji, r.custom_emoji_id ORDER BY count DESC`
  ).bind(user.id, messageId).all();

  return c.json({
    message_id: messageId,
    reactions: (rows.results || []).map((r: any) => ({
      emoji: r.emoji,
      custom_emoji_id: r.custom_emoji_id,
      count: r.count,
      user_ids: r.user_ids ? r.user_ids.split(',') : [],
      reacted_by_me: r.reacted_by_me === 1,
    })),
  });
});

// POST /api/v1/reactions/:messageId — add reaction
reactions.post('/:messageId', zValidator('json', addReactionSchema), async (c) => {
  const { messageId } = c.req.param();
  const user = c.get('user');
  const { emoji, custom_emoji_id } = c.req.valid('json');

  // Verify access
  const msg = await c.env.DB.prepare(
    `SELECT m.id, m.chat_id, m.sender_id FROM messages m
     JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ?
     WHERE m.id = ?`
  ).bind(user.id, messageId).first<any>();

  if (!msg) throw new HTTPException(404, { message: 'Message not found' });

  // Check if already reacted with this emoji
  const existing = await c.env.DB.prepare(
    'SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?'
  ).bind(messageId, user.id, emoji).first();

  if (existing) {
    // Toggle off — remove reaction
    await c.env.DB.prepare(
      'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?'
    ).bind(messageId, user.id, emoji).run();

    return c.json({ action: 'removed', emoji });
  }

  // Limit: max 20 different emoji per message per user
  const count = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM message_reactions WHERE message_id = ? AND user_id = ?'
  ).bind(messageId, user.id).first<{ cnt: number }>();

  if ((count?.cnt || 0) >= 20) {
    throw new HTTPException(400, { message: 'Too many reactions on this message' });
  }

  const id = generateId();
  const now = Date.now();

  await c.env.DB.prepare(
    'INSERT INTO message_reactions (id, message_id, user_id, emoji, custom_emoji_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, messageId, user.id, emoji, custom_emoji_id || null, now).run();

  // Broadcast reaction event to chat room
  try {
    const roomId = c.env.CHAT_ROOM.idFromName(msg.chat_id);
    const room = c.env.CHAT_ROOM.get(roomId);
    await room.fetch('https://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'reaction_add',
        message_id: messageId,
        user_id: user.id,
        emoji,
        custom_emoji_id: custom_emoji_id || null,
        timestamp: now,
      }),
    });
  } catch {}

  return c.json({ action: 'added', emoji, id }, 201);
});

// DELETE /api/v1/reactions/:messageId/:emoji — remove specific reaction
reactions.delete('/:messageId/:emoji', async (c) => {
  const { messageId, emoji } = c.req.param();
  const user = c.get('user');

  const result = await c.env.DB.prepare(
    'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?'
  ).bind(messageId, user.id, decodeURIComponent(emoji)).run();

  if (!result.meta?.changes) {
    throw new HTTPException(404, { message: 'Reaction not found' });
  }

  return c.json({ success: true });
});

// GET /api/v1/reactions/:messageId/:emoji/users — get users who reacted with specific emoji
reactions.get('/:messageId/:emoji/users', async (c) => {
  const { messageId, emoji } = c.req.param();
  const user = c.get('user');

  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_verified
     FROM message_reactions r JOIN users u ON u.id = r.user_id
     WHERE r.message_id = ? AND r.emoji = ? LIMIT 50`
  ).bind(messageId, decodeURIComponent(emoji)).all();

  return c.json({ users: rows.results || [] });
});

export default reactions;
