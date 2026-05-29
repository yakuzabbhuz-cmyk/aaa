// ============================================
// DL Chat - Webhooks API Routes
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
const webhooks = new Hono<AppEnv>();
webhooks.use('*', authMiddleware);

const createWebhookSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(100),
  events: z.array(z.enum([
    'message.created', 'message.edited', 'message.deleted',
    'member.joined', 'member.left', 'member.banned',
    'reaction.added', 'reaction.removed',
    'poll.vote', 'poll.closed',
    'call.started', 'call.ended',
    'channel.created', 'channel.updated',
  ])).min(1).max(20),
  server_id: z.string().optional(),
  chat_id: z.string().optional(),
  secret: z.string().min(8).max(256).optional(),
  avatar_url: z.string().url().optional(),
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  name: z.string().min(1).max(100).optional(),
  events: z.array(z.string()).min(1).max(20).optional(),
  is_active: z.boolean().optional(),
  secret: z.string().min(8).max(256).optional(),
});

// GET /api/v1/webhooks — list user's webhooks
webhooks.get('/', async (c) => {
  const user = c.get('user');

  const rows = await c.env.DB.prepare(
    `SELECT w.*, s.name as server_name
     FROM webhooks w LEFT JOIN servers s ON s.id = w.server_id
     WHERE w.creator_id = ? ORDER BY w.created_at DESC`
  ).bind(user.id).all();

  return c.json({ webhooks: rows.results || [] });
});

// GET /api/v1/webhooks/:id — get a specific webhook
webhooks.get('/:id', async (c) => {
  const { id } = c.req.param();
  const user = c.get('user');

  const webhook = await c.env.DB.prepare(
    'SELECT * FROM webhooks WHERE id = ? AND creator_id = ?'
  ).bind(id, user.id).first();

  if (!webhook) throw new HTTPException(404, { message: 'Webhook not found' });
  return c.json(webhook);
});

// POST /api/v1/webhooks — create webhook
webhooks.post('/', zValidator('json', createWebhookSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');

  if (!body.server_id && !body.chat_id) {
    throw new HTTPException(400, { message: 'Either server_id or chat_id is required' });
  }

  // Verify ownership of server/chat
  if (body.server_id) {
    const srv = await c.env.DB.prepare(
      'SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ? AND role IN (?,?)'
    ).bind(body.server_id, user.id, 'owner', 'admin').first();
    if (!srv) throw new HTTPException(403, { message: 'You must be a server admin to create webhooks' });
  }

  if (body.chat_id) {
    const member = await c.env.DB.prepare(
      'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ? AND role IN (?,?)'
    ).bind(body.chat_id, user.id, 'owner', 'admin').first();
    if (!member) throw new HTTPException(403, { message: 'You must be a chat admin to create webhooks' });
  }

  const id = generateId();
  const token = generateId() + generateId(); // 64-char random token
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO webhooks (id, creator_id, server_id, chat_id, url, name, events_json,
     secret, token, avatar_url, is_active, delivery_count, fail_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, ?)`
  ).bind(
    id, user.id,
    body.server_id ?? null,
    body.chat_id ?? null,
    body.url, body.name,
    JSON.stringify(body.events),
    body.secret ?? null,
    token,
    body.avatar_url ?? null,
    now
  ).run();

  return c.json({
    id, token,
    url: body.url,
    name: body.name,
    events: body.events,
    is_active: true,
    created_at: now,
    webhook_url: `https://dl-chat-api.death-legion-dlchat.workers.dev/api/v1/webhooks/incoming/${token}`,
  }, 201);
});

// PATCH /api/v1/webhooks/:id — update webhook
webhooks.patch('/:id', zValidator('json', updateWebhookSchema), async (c) => {
  const { id } = c.req.param();
  const user = c.get('user');
  const body = c.req.valid('json');

  const webhook = await c.env.DB.prepare(
    'SELECT id FROM webhooks WHERE id = ? AND creator_id = ?'
  ).bind(id, user.id).first();

  if (!webhook) throw new HTTPException(404, { message: 'Webhook not found' });

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.url !== undefined) { updates.push('url = ?'); values.push(body.url); }
  if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
  if (body.events !== undefined) { updates.push('events_json = ?'); values.push(JSON.stringify(body.events)); }
  if (body.is_active !== undefined) { updates.push('is_active = ?'); values.push(body.is_active ? 1 : 0); }
  if (body.secret !== undefined) { updates.push('secret = ?'); values.push(body.secret); }

  if (updates.length === 0) return c.json({ success: true });

  values.push(id);
  await c.env.DB.prepare(
    `UPDATE webhooks SET ${updates.join(', ')}, updated_at = ${Date.now()} WHERE id = ?`
  ).bind(...values).run();

  return c.json({ success: true });
});

// DELETE /api/v1/webhooks/:id — delete webhook
webhooks.delete('/:id', async (c) => {
  const { id } = c.req.param();
  const user = c.get('user');

  const result = await c.env.DB.prepare(
    'DELETE FROM webhooks WHERE id = ? AND creator_id = ?'
  ).bind(id, user.id).run();

  if (!result.meta?.changes) throw new HTTPException(404, { message: 'Webhook not found' });
  return c.json({ success: true });
});

// POST /api/v1/webhooks/:id/test — send test payload
webhooks.post('/:id/test', async (c) => {
  const { id } = c.req.param();
  const user = c.get('user');

  const webhook = await c.env.DB.prepare(
    'SELECT * FROM webhooks WHERE id = ? AND creator_id = ?'
  ).bind(id, user.id).first<any>();

  if (!webhook) throw new HTTPException(404, { message: 'Webhook not found' });

  const testPayload = {
    event: 'test',
    webhook_id: id,
    timestamp: Date.now(),
    data: {
      message: 'This is a test webhook from DL Chat API',
      team: 'DEATH LEGION Team',
      version: '1.0.0',
    },
  };

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DLChat-Event': 'test',
        'X-DLChat-Webhook-ID': id,
        'User-Agent': 'DLChat-Webhook/1.0',
      },
      body: JSON.stringify(testPayload),
    });

    return c.json({
      success: res.ok,
      status: res.status,
      response_time_ms: Date.now() - testPayload.timestamp,
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 200);
  }
});

// GET /api/v1/webhooks/:id/deliveries — delivery history
webhooks.get('/:id/deliveries', async (c) => {
  const { id } = c.req.param();
  const user = c.get('user');

  const webhook = await c.env.DB.prepare(
    'SELECT id FROM webhooks WHERE id = ? AND creator_id = ?'
  ).bind(id, user.id).first();

  if (!webhook) throw new HTTPException(404, { message: 'Webhook not found' });

  const deliveries = await c.env.DB.prepare(
    `SELECT id, event, status_code, success, response_time_ms, error, delivered_at
     FROM webhook_deliveries WHERE webhook_id = ? ORDER BY delivered_at DESC LIMIT 50`
  ).bind(id).all();

  return c.json({ deliveries: deliveries.results || [] });
});

// POST /api/v1/webhooks/incoming/:token — incoming webhook (like Discord webhooks)
const incoming = new Hono<AppEnv>();

incoming.post('/:token', async (c) => {
  const { token } = c.req.param();

  const webhook = await c.env.DB.prepare(
    'SELECT * FROM webhooks WHERE token = ? AND is_active = 1'
  ).bind(token).first<any>();

  if (!webhook) return c.json({ error: 'Invalid webhook token' }, 401);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON body' }, 400);

  // Validate fields
  const content = body.content?.slice(0, 2000);
  const username = body.username?.slice(0, 80);
  const avatarUrl = body.avatar_url;
  const embeds = body.embeds?.slice(0, 10) || [];

  if (!content && embeds.length === 0) {
    return c.json({ error: 'content or embeds required' }, 400);
  }

  const chatId = webhook.chat_id;
  if (!chatId) return c.json({ error: 'Webhook not bound to a chat' }, 400);

  const id = generateId();
  const now = Date.now();

  // Post message as bot/webhook in the chat
  await c.env.DB.prepare(
    `INSERT INTO messages (id, chat_id, sender_id, content, message_type, metadata, is_webhook, created_at)
     VALUES (?, ?, ?, ?, 'webhook', ?, 1, ?)`
  ).bind(
    id, chatId, webhook.creator_id,
    content || '',
    JSON.stringify({ webhook_id: webhook.id, username, avatar_url: avatarUrl, embeds }),
    now
  ).run();

  // Update delivery count
  await c.env.DB.prepare(
    'UPDATE webhooks SET delivery_count = delivery_count + 1, last_delivery_at = ? WHERE id = ?'
  ).bind(now, webhook.id).run();

  // Broadcast
  try {
    const roomId = c.env.CHAT_ROOM.idFromName(chatId);
    const room = c.env.CHAT_ROOM.get(roomId);
    await room.fetch('https://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'new_message', message_id: id, chat_id: chatId }),
    });
  } catch {}

  return c.json({ id, timestamp: now }, 200);
});

webhooks.route('/incoming', incoming);

export default webhooks;
