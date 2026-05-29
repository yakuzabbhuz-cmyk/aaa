// ============================================
// DL Chat - Notifications API Routes
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
const notifications = new Hono<AppEnv>();
notifications.use('*', authMiddleware);

const pushTokenSchema = z.object({
  token: z.string().min(10),
  platform: z.enum(['ios', 'android', 'web', 'desktop']),
  device_name: z.string().max(100).optional(),
  device_id: z.string().max(256).optional(),
});

const prefsSchema = z.object({
  messages: z.boolean().optional(),
  mentions: z.boolean().optional(),
  reactions: z.boolean().optional(),
  calls: z.boolean().optional(),
  friend_requests: z.boolean().optional(),
  group_invites: z.boolean().optional(),
  system: z.boolean().optional(),
  sound_enabled: z.boolean().optional(),
  vibration_enabled: z.boolean().optional(),
  badge_enabled: z.boolean().optional(),
  preview_enabled: z.boolean().optional(),
  quiet_hours_enabled: z.boolean().optional(),
  quiet_hours_start: z.string().optional(), // "22:00"
  quiet_hours_end: z.string().optional(),   // "08:00"
  muted_chats: z.array(z.string()).optional(),
});

// GET /api/v1/notifications — get notifications
notifications.get('/', async (c) => {
  const user = c.get('user');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const offset = parseInt(c.req.query('offset') || '0');
  const unread_only = c.req.query('unread_only') === 'true';
  const type = c.req.query('type');

  let query = `SELECT n.*, u.display_name as from_username, u.avatar_url as from_avatar,
   u.username as from_user_handle
   FROM notifications n LEFT JOIN users u ON u.id = n.from_user_id
   WHERE n.user_id = ?`;
  const params: unknown[] = [user.id];

  if (unread_only) { query += ' AND n.is_read = 0'; }
  if (type) { query += ' AND n.type = ?'; params.push(type); }
  query += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = await c.env.DB.prepare(query).bind(...params).all();

  const unreadCount = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0'
  ).bind(user.id).first<{ cnt: number }>();

  return c.json({
    notifications: (rows.results || []).map((n: any) => ({
      ...n,
      data: n.data_json ? JSON.parse(n.data_json) : null,
    })),
    unread_count: unreadCount?.cnt || 0,
    has_more: (rows.results?.length || 0) === limit,
  });
});

// POST /api/v1/notifications/read — mark notifications as read
notifications.post('/read', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const ids: string[] | undefined = body.ids;

  if (ids && ids.length > 0) {
    // Mark specific notifications
    const placeholders = ids.map(() => '?').join(',');
    await c.env.DB.prepare(
      `UPDATE notifications SET is_read = 1, read_at = ? WHERE user_id = ? AND id IN (${placeholders})`
    ).bind(Date.now(), user.id, ...ids).run();
  } else {
    // Mark all as read
    await c.env.DB.prepare(
      'UPDATE notifications SET is_read = 1, read_at = ? WHERE user_id = ? AND is_read = 0'
    ).bind(Date.now(), user.id).run();
  }

  return c.json({ success: true });
});

// DELETE /api/v1/notifications/:id — delete notification
notifications.delete('/:id', async (c) => {
  const { id } = c.req.param();
  const user = c.get('user');

  await c.env.DB.prepare(
    'DELETE FROM notifications WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).run();

  return c.json({ success: true });
});

// DELETE /api/v1/notifications — clear all notifications
notifications.delete('/', async (c) => {
  const user = c.get('user');

  await c.env.DB.prepare('DELETE FROM notifications WHERE user_id = ?').bind(user.id).run();
  return c.json({ success: true });
});

// GET /api/v1/notifications/prefs — get notification preferences
notifications.get('/prefs', async (c) => {
  const user = c.get('user');

  const prefs = await c.env.DB.prepare(
    'SELECT prefs_json FROM notification_prefs WHERE user_id = ?'
  ).bind(user.id).first<{ prefs_json: string }>();

  const defaults = {
    messages: true, mentions: true, reactions: true,
    calls: true, friend_requests: true, group_invites: true, system: true,
    sound_enabled: true, vibration_enabled: true, badge_enabled: true, preview_enabled: true,
    quiet_hours_enabled: false, quiet_hours_start: '22:00', quiet_hours_end: '08:00',
    muted_chats: [],
  };

  return c.json({
    prefs: prefs?.prefs_json ? { ...defaults, ...JSON.parse(prefs.prefs_json) } : defaults,
  });
});

// PATCH /api/v1/notifications/prefs — update notification preferences
notifications.patch('/prefs', zValidator('json', prefsSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');

  // Get existing prefs
  const existing = await c.env.DB.prepare(
    'SELECT prefs_json FROM notification_prefs WHERE user_id = ?'
  ).bind(user.id).first<{ prefs_json: string }>();

  const currentPrefs = existing?.prefs_json ? JSON.parse(existing.prefs_json) : {};
  const newPrefs = { ...currentPrefs, ...body };

  await c.env.DB.prepare(
    `INSERT INTO notification_prefs (user_id, prefs_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET prefs_json = ?, updated_at = ?`
  ).bind(user.id, JSON.stringify(newPrefs), Date.now(), JSON.stringify(newPrefs), Date.now()).run();

  return c.json({ success: true, prefs: newPrefs });
});

// POST /api/v1/notifications/push-token — register push token
notifications.post('/push-token', zValidator('json', pushTokenSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const now = Date.now();

  // Upsert push token (device_id-based dedup)
  if (body.device_id) {
    await c.env.DB.prepare(
      `INSERT INTO push_tokens (id, user_id, token, platform, device_name, device_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (device_id) DO UPDATE SET token = ?, updated_at = ?`
    ).bind(
      generateId(), user.id, body.token, body.platform,
      body.device_name ?? null, body.device_id, now,
      body.token, now
    ).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO push_tokens (id, user_id, token, platform, device_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(generateId(), user.id, body.token, body.platform, body.device_name ?? null, now).run();
  }

  return c.json({ success: true, registered: true });
});

// DELETE /api/v1/notifications/push-token — unregister push token (on logout)
notifications.delete('/push-token', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));

  if (body.token) {
    await c.env.DB.prepare(
      'DELETE FROM push_tokens WHERE user_id = ? AND token = ?'
    ).bind(user.id, body.token).run();
  } else {
    await c.env.DB.prepare('DELETE FROM push_tokens WHERE user_id = ?').bind(user.id).run();
  }

  return c.json({ success: true });
});

// GET /api/v1/notifications/mute/:chatId — get mute status for a chat
notifications.get('/mute/:chatId', async (c) => {
  const { chatId } = c.req.param();
  const user = c.get('user');

  const mute = await c.env.DB.prepare(
    'SELECT muted_until FROM chat_mutes WHERE user_id = ? AND chat_id = ?'
  ).bind(user.id, chatId).first<any>();

  const isMuted = mute && (!mute.muted_until || mute.muted_until > Date.now());
  return c.json({ is_muted: isMuted, muted_until: mute?.muted_until || null });
});

// POST /api/v1/notifications/mute/:chatId — mute a chat
notifications.post('/mute/:chatId', async (c) => {
  const { chatId } = c.req.param();
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const duration = body.duration; // seconds, null = forever

  const mutedUntil = duration ? Date.now() + duration * 1000 : null;

  await c.env.DB.prepare(
    `INSERT INTO chat_mutes (user_id, chat_id, muted_until, muted_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, chat_id) DO UPDATE SET muted_until = ?, muted_at = ?`
  ).bind(user.id, chatId, mutedUntil, Date.now(), mutedUntil, Date.now()).run();

  return c.json({ success: true, muted: true, muted_until: mutedUntil });
});

// DELETE /api/v1/notifications/mute/:chatId — unmute a chat
notifications.delete('/mute/:chatId', async (c) => {
  const { chatId } = c.req.param();
  const user = c.get('user');

  await c.env.DB.prepare('DELETE FROM chat_mutes WHERE user_id = ? AND chat_id = ?').bind(user.id, chatId).run();
  return c.json({ success: true, muted: false });
});

export default notifications;
