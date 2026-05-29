// ============================================
// DL Chat - Scheduled Messages API Routes
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
const scheduled = new Hono<AppEnv>();
scheduled.use('*', authMiddleware);

const scheduleSchema = z.object({
  chat_id: z.string(),
  content: z.string().min(1).max(4096),
  send_at: z.number().int().min(Date.now()),
  message_type: z.enum(['text', 'image', 'file', 'voice']).default('text'),
  file_url: z.string().url().optional(),
  reply_to_id: z.string().optional(),
  recurring: z.object({
    enabled: z.boolean().default(false),
    interval: z.enum(['daily', 'weekly', 'monthly']).optional(),
    day_of_week: z.number().int().min(0).max(6).optional(),
    day_of_month: z.number().int().min(1).max(31).optional(),
    hour: z.number().int().min(0).max(23).optional(),
    minute: z.number().int().min(0).max(59).optional(),
    end_at: z.number().int().optional(),
    max_occurrences: z.number().int().min(1).max(365).optional(),
  }).optional(),
});

// GET /api/v1/scheduled — list user's scheduled messages
scheduled.get('/', async (c) => {
  const user = c.get('user');
  const chatId = c.req.query('chat_id');

  let query = `SELECT sm.*, ch.name as chat_name
     FROM scheduled_messages sm
     LEFT JOIN chats ch ON ch.id = sm.chat_id
     WHERE sm.sender_id = ? AND sm.is_sent = 0 AND sm.is_cancelled = 0`;
  const params: unknown[] = [user.id];

  if (chatId) { query += ' AND sm.chat_id = ?'; params.push(chatId); }
  query += ' ORDER BY sm.send_at ASC LIMIT 50';

  const rows = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ scheduled: rows.results || [] });
});

// POST /api/v1/scheduled — schedule a message
scheduled.post('/', zValidator('json', scheduleSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');

  // Min 1 minute in the future
  if (body.send_at < Date.now() + 60_000) {
    throw new HTTPException(400, { message: 'Scheduled time must be at least 1 minute in the future' });
  }

  // Max 1 year in future
  if (body.send_at > Date.now() + 365 * 24 * 3600 * 1000) {
    throw new HTTPException(400, { message: 'Cannot schedule more than 1 year in advance' });
  }

  // Verify chat membership
  const member = await c.env.DB.prepare(
    'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(body.chat_id, user.id).first();
  if (!member) throw new HTTPException(403, { message: 'Not a chat member' });

  // Limit: max 50 scheduled messages per user
  const count = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM scheduled_messages WHERE sender_id = ? AND is_sent = 0 AND is_cancelled = 0'
  ).bind(user.id).first<{ cnt: number }>();

  if ((count?.cnt || 0) >= 50) {
    throw new HTTPException(400, { message: 'Too many pending scheduled messages (max 50)' });
  }

  const id = generateId();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO scheduled_messages
     (id, chat_id, sender_id, content, message_type, file_url, reply_to_id,
     send_at, recurring_json, is_sent, is_cancelled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`
  ).bind(
    id, body.chat_id, user.id, body.content,
    body.message_type, body.file_url ?? null,
    body.reply_to_id ?? null,
    body.send_at,
    body.recurring ? JSON.stringify(body.recurring) : null,
    now
  ).run();

  return c.json({
    id,
    chat_id: body.chat_id,
    content: body.content,
    send_at: body.send_at,
    message_type: body.message_type,
    recurring: body.recurring,
    created_at: now,
  }, 201);
});

// PATCH /api/v1/scheduled/:id — update scheduled message
scheduled.patch('/:id', async (c) => {
  const { id } = c.req.param();
  const user = c.get('user');
  const body = await c.req.json();

  const msg = await c.env.DB.prepare(
    'SELECT * FROM scheduled_messages WHERE id = ? AND sender_id = ? AND is_sent = 0 AND is_cancelled = 0'
  ).bind(id, user.id).first<any>();

  if (!msg) throw new HTTPException(404, { message: 'Scheduled message not found' });

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.content) { updates.push('content = ?'); values.push(body.content); }
  if (body.send_at) {
    if (body.send_at < Date.now() + 60_000) {
      throw new HTTPException(400, { message: 'Must be at least 1 minute in the future' });
    }
    updates.push('send_at = ?'); values.push(body.send_at);
  }

  if (updates.length > 0) {
    values.push(id);
    await c.env.DB.prepare(`UPDATE scheduled_messages SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  return c.json({ success: true });
});

// DELETE /api/v1/scheduled/:id — cancel scheduled message
scheduled.delete('/:id', async (c) => {
  const { id } = c.req.param();
  const user = c.get('user');

  const result = await c.env.DB.prepare(
    'UPDATE scheduled_messages SET is_cancelled = 1 WHERE id = ? AND sender_id = ? AND is_sent = 0'
  ).bind(id, user.id).run();

  if (!result.meta?.changes) throw new HTTPException(404, { message: 'Scheduled message not found' });
  return c.json({ success: true });
});

// POST /api/v1/scheduled/:id/send-now — send a scheduled message immediately
scheduled.post('/:id/send-now', async (c) => {
  const { id } = c.req.param();
  const user = c.get('user');

  const msg = await c.env.DB.prepare(
    'SELECT * FROM scheduled_messages WHERE id = ? AND sender_id = ? AND is_sent = 0 AND is_cancelled = 0'
  ).bind(id, user.id).first<any>();

  if (!msg) throw new HTTPException(404, { message: 'Scheduled message not found' });

  const messageId = generateId();
  const now = Date.now();

  // Send the message now
  await c.env.DB.prepare(
    `INSERT INTO messages (id, chat_id, sender_id, content, message_type, file_url, reply_to_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(messageId, msg.chat_id, user.id, msg.content, msg.message_type, msg.file_url, msg.reply_to_id, now).run();

  // Mark scheduled message as sent
  await c.env.DB.prepare(
    'UPDATE scheduled_messages SET is_sent = 1, sent_message_id = ?, sent_at = ? WHERE id = ?'
  ).bind(messageId, now, id).run();

  // Broadcast
  try {
    const roomId = c.env.CHAT_ROOM.idFromName(msg.chat_id);
    const room = c.env.CHAT_ROOM.get(roomId);
    await room.fetch('https://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'new_message', message_id: messageId, chat_id: msg.chat_id }),
    });
  } catch {}

  return c.json({ success: true, message_id: messageId });
});

export default scheduled;
