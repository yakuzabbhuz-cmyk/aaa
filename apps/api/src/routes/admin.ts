// ============================================
// DL Chat - Admin Routes
// DEATH LEGION Team - Full Platform Control
// ============================================
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Env, Variables } from '../types';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { generateId } from '../utils/hash';
import { reviewBanAppeal } from '../services/aiModeration';

type AppEnv = { Bindings: Env; Variables: Variables };
const admin = new Hono<AppEnv>();

admin.use('*', authMiddleware, adminMiddleware);

// GET /api/v1/admin/stats
admin.get('/stats', async (c) => {
  const now = Date.now();
  const today = now - 86400000;

  const stats = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE is_bot = 0) as total_users,
      (SELECT COUNT(*) FROM users WHERE last_seen > ? AND is_bot = 0) as active_users_today,
      (SELECT COUNT(*) FROM messages) as total_messages,
      (SELECT COUNT(*) FROM messages WHERE created_at > ?) as messages_today,
      (SELECT COUNT(*) FROM servers WHERE is_deleted = 0) as total_servers,
      (SELECT COUNT(*) FROM users WHERE is_bot = 1) as total_bots,
      (SELECT COUNT(*) FROM bans WHERE is_active = 1) as active_bans,
      (SELECT COUNT(*) FROM reports WHERE status = 'pending') as pending_reports,
      (SELECT COUNT(*) FROM bans WHERE appeal_status = 'pending') as pending_appeals,
      (SELECT COUNT(*) FROM chats WHERE is_deleted = 0) as total_chats
  `).bind(today, today).first();

  return c.json({ stats });
});

// GET /api/v1/admin/users
admin.get('/users', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const query = c.req.query('q');
  const filter = c.req.query('filter'); // banned, bots, verified

  let sql = `SELECT u.id, u.username, u.phone, u.email, u.display_name, u.avatar_url, u.is_verified, 
   u.is_premium, u.is_bot, u.is_banned, u.ban_reason, u.created_at, u.last_seen,
   (SELECT COUNT(*) FROM messages WHERE sender_id = u.id) as message_count
   FROM users u WHERE 1=1`;

  const params: unknown[] = [];

  if (query) {
    sql += ' AND (u.username LIKE ? OR u.display_name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)';
    params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
  }

  if (filter === 'banned') { sql += ' AND u.is_banned = 1'; }
  else if (filter === 'bots') { sql += ' AND u.is_bot = 1'; }
  else if (filter === 'verified') { sql += ' AND u.is_verified = 1'; }

  sql += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const users = await c.env.DB.prepare(sql).bind(...params).all();

  const total = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();

  return c.json({ users: users.results, total: total?.count || 0 });
});

// GET /api/v1/admin/users/:id
admin.get('/users/:id', async (c) => {
  const userId = c.req.param('id');

  const user = await c.env.DB.prepare(
    `SELECT u.*, 
     (SELECT COUNT(*) FROM messages WHERE sender_id = u.id) as message_count,
     (SELECT COUNT(*) FROM contacts WHERE user_id = u.id) as contact_count
     FROM users u WHERE u.id = ?`
  ).bind(userId).first<any>();

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  // Get recent messages (admin can see any user's messages)
  const recentMessages = await c.env.DB.prepare(
    `SELECT m.*, c.name as chat_name, c.type as chat_type 
     FROM messages m JOIN chats c ON c.id = m.chat_id
     WHERE m.sender_id = ? AND m.is_deleted = 0
     ORDER BY m.created_at DESC LIMIT 50`
  ).bind(userId).all();

  // Get active bans
  const activeBans = await c.env.DB.prepare(
    'SELECT * FROM bans WHERE user_id = ? ORDER BY created_at DESC LIMIT 10'
  ).bind(userId).all();

  // Get sessions
  const sessions = await c.env.DB.prepare(
    'SELECT id, device_info, ip_address, created_at, is_active FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5'
  ).bind(userId).all();

  return c.json({
    user,
    recent_messages: recentMessages.results,
    bans: activeBans.results,
    sessions: sessions.results.map((s: any) => ({
      ...s,
      device_info: s.device_info ? JSON.parse(s.device_info) : null,
    })),
  });
});

// PUT /api/v1/admin/users/:id
admin.put('/users/:id', async (c) => {
  const adminUser = c.get('user');
  const userId = c.req.param('id');
  const body = await c.req.json();

  const allowed = ['is_verified', 'is_premium', 'display_name', 'username'];
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(body[key]);
    }
  }

  if (fields.length === 0) {
    throw new HTTPException(400, { message: 'No valid fields to update' });
  }

  fields.push('updated_at = ?');
  values.push(Date.now(), userId);

  await c.env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();

  return c.json({ success: true });
});

// POST /api/v1/admin/users/:id/ban
admin.post('/users/:id/ban', zValidator('json', z.object({
  reason: z.string().min(1).max(500),
  ban_type: z.enum(['permanent', 'temporary', 'shadow']),
  expires_at: z.number().optional(),
})), async (c) => {
  const adminUser = c.get('user');
  const userId = c.req.param('id');
  const body = c.req.valid('json');
  const now = Date.now();

  const banId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO bans (id, user_id, banned_by, ban_type, reason, starts_at, expires_at, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).bind(banId, userId, adminUser.id, body.ban_type, body.reason, now, body.expires_at || null, now).run();

  if (body.ban_type !== 'shadow') {
    await c.env.DB.prepare('UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?')
      .bind(body.reason, userId).run();

    // Invalidate all sessions
    await c.env.DB.prepare('UPDATE sessions SET is_active = 0 WHERE user_id = ?').bind(userId).run();
  }

  // Log audit
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (id, actor_id, target_id, action, changes, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(generateId(), adminUser.id, userId, 'USER_BAN', JSON.stringify({ ban_type: body.ban_type }), body.reason, now).run();

  return c.json({ success: true, ban_id: banId });
});

// POST /api/v1/admin/users/:id/unban
admin.post('/users/:id/unban', async (c) => {
  const adminUser = c.get('user');
  const userId = c.req.param('id');
  const now = Date.now();

  await c.env.DB.prepare('UPDATE bans SET is_active = 0 WHERE user_id = ? AND is_active = 1').bind(userId).run();
  await c.env.DB.prepare('UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?').bind(userId).run();

  await c.env.DB.prepare(
    'INSERT INTO audit_logs (id, actor_id, target_id, action, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(generateId(), adminUser.id, userId, 'USER_UNBAN', now).run();

  return c.json({ success: true });
});

// GET /api/v1/admin/bans
admin.get('/bans', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const filter = c.req.query('filter'); // active, appeal_pending

  let sql = `SELECT b.*, u.display_name, u.username, u.avatar_url FROM bans b JOIN users u ON u.id = b.user_id WHERE 1=1`;
  const params: unknown[] = [];

  if (filter === 'active') { sql += ' AND b.is_active = 1'; }
  else if (filter === 'appeal_pending') { sql += ` AND b.appeal_status = 'pending'`; }

  sql += ' ORDER BY b.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const bans = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ bans: bans.results });
});

// GET /api/v1/admin/bans/:id
admin.get('/bans/:id', async (c) => {
  const banId = c.req.param('id');

  const ban = await c.env.DB.prepare(
    `SELECT b.*, u.display_name, u.username, u.avatar_url FROM bans b JOIN users u ON u.id = b.user_id WHERE b.id = ?`
  ).bind(banId).first();

  if (!ban) {
    throw new HTTPException(404, { message: 'Ban not found' });
  }

  return c.json({ ban });
});

// POST /api/v1/admin/bans/:id/appeal
admin.post('/bans/:id/appeal', zValidator('json', z.object({
  decision: z.enum(['approve', 'deny']),
  reason: z.string().min(1).max(500),
})), async (c) => {
  const adminUser = c.get('user');
  const banId = c.req.param('id');
  const { decision, reason } = c.req.valid('json');
  const now = Date.now();

  const ban = await c.env.DB.prepare('SELECT user_id, appeal_message, ai_violation_type FROM bans WHERE id = ?').bind(banId).first<any>();
  if (!ban) {
    throw new HTTPException(404, { message: 'Ban not found' });
  }

  const approved = decision === 'approve';

  await c.env.DB.prepare(
    `UPDATE bans SET appeal_status = ?, appeal_reviewed_by = ?, appeal_reviewed_at = ?, appeal_decision_reason = ?,
     is_active = ? WHERE id = ?`
  ).bind(
    approved ? 'approved' : 'denied',
    adminUser.id, now, reason,
    approved ? 0 : 1,
    banId
  ).run();

  if (approved) {
    await c.env.DB.prepare('UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?').bind(ban.user_id).run();
  }

  return c.json({ success: true, decision, reason });
});

// GET /api/v1/admin/reports
admin.get('/reports', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const status = c.req.query('status') || 'pending';

  const reports = await c.env.DB.prepare(
    `SELECT r.*, u.display_name as reporter_name, u2.display_name as reported_user_name
     FROM reports r
     JOIN users u ON u.id = r.reporter_id
     LEFT JOIN users u2 ON u2.id = r.reported_user_id
     WHERE r.status = ?
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`
  ).bind(status, limit, offset).all();

  return c.json({ reports: reports.results });
});

// PUT /api/v1/admin/reports/:id
admin.put('/reports/:id', zValidator('json', z.object({
  status: z.enum(['reviewing', 'actioned', 'dismissed']),
  action_taken: z.string().optional(),
})), async (c) => {
  const adminUser = c.get('user');
  const reportId = c.req.param('id');
  const body = c.req.valid('json');
  const now = Date.now();

  await c.env.DB.prepare(
    'UPDATE reports SET status = ?, action_taken = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?'
  ).bind(body.status, body.action_taken || null, adminUser.id, now, reportId).run();

  return c.json({ success: true });
});

// GET /api/v1/admin/messages - Search/view any messages
admin.get('/messages', async (c) => {
  const query = c.req.query('q');
  const chatId = c.req.query('chat_id');
  const userId = c.req.query('user_id');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  let sql = `SELECT m.*, u.display_name as sender_name, u.username as sender_username,
   c.name as chat_name, c.type as chat_type
   FROM messages m JOIN users u ON u.id = m.sender_id JOIN chats c ON c.id = m.chat_id
   WHERE 1=1`;

  const params: unknown[] = [];

  if (query) {
    sql += ' AND m.content LIKE ?';
    params.push(`%${query}%`);
  }
  if (chatId) {
    sql += ' AND m.chat_id = ?';
    params.push(chatId);
  }
  if (userId) {
    sql += ' AND m.sender_id = ?';
    params.push(userId);
  }

  sql += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const messages = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ messages: messages.results });
});

// GET /api/v1/admin/servers
admin.get('/servers', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const servers = await c.env.DB.prepare(
    `SELECT s.*, u.display_name as owner_name,
     (SELECT COUNT(*) FROM server_members sm WHERE sm.server_id = s.id) as member_count
     FROM servers s JOIN users u ON u.id = s.owner_id
     WHERE s.is_deleted = 0 ORDER BY member_count DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();

  return c.json({ servers: servers.results });
});

// GET /api/v1/admin/bots
admin.get('/bots', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');

  const botList = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.created_at,
     owner.display_name as owner_name,
     (SELECT COUNT(*) FROM bot_server_installs bsi WHERE bsi.bot_id = u.id) as server_installs
     FROM users u JOIN users owner ON owner.id = u.bot_owner_id
     WHERE u.is_bot = 1 ORDER BY server_installs DESC LIMIT ?`
  ).bind(limit).all();

  return c.json({ bots: botList.results });
});

// GET /api/v1/admin/audit
admin.get('/audit', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const logs = await c.env.DB.prepare(
    `SELECT al.*, u.display_name as actor_name FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_id
     ORDER BY al.created_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();

  return c.json({ logs: logs.results });
});

// GET /api/v1/admin/moderation
admin.get('/moderation', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');

  const queue = await c.env.DB.prepare(
    `SELECT aml.*, u.display_name, u.username, m.content, m.chat_id
     FROM ai_moderation_logs aml
     LEFT JOIN users u ON u.id = aml.user_id
     LEFT JOIN messages m ON m.id = aml.message_id
     WHERE aml.action_taken = 'warn' OR aml.confidence BETWEEN 0.70 AND 0.94
     ORDER BY aml.created_at DESC LIMIT ?`
  ).bind(limit).all();

  return c.json({ moderation_queue: queue.results });
});

// PUT /api/v1/admin/settings
admin.put('/settings', async (c) => {
  const adminUser = c.get('user');
  const body = await c.req.json<Record<string, string>>();
  const now = Date.now();

  const updates = Object.entries(body).map(([key, value]) =>
    c.env.DB.prepare(
      'INSERT OR REPLACE INTO system_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)'
    ).bind(key, String(value), adminUser.id, now)
  );

  if (updates.length > 0) {
    await c.env.DB.batch(updates);
  }

  return c.json({ success: true, updated: Object.keys(body).length });
});

// GET /api/v1/admin/analytics
admin.get('/analytics', async (c) => {
  const now = Date.now();
  const periods = [
    { label: '24h', start: now - 86400000 },
    { label: '7d', start: now - 7 * 86400000 },
    { label: '30d', start: now - 30 * 86400000 },
  ];

  const analytics: Record<string, unknown> = {};

  for (const period of periods) {
    const data = await c.env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE created_at > ?) as new_users,
        (SELECT COUNT(*) FROM messages WHERE created_at > ?) as new_messages,
        (SELECT COUNT(*) FROM bans WHERE created_at > ?) as new_bans,
        (SELECT COUNT(*) FROM servers WHERE created_at > ?) as new_servers
    `).bind(period.start, period.start, period.start, period.start).first();

    analytics[period.label] = data;
  }

  return c.json({ analytics });
});

export default admin;
