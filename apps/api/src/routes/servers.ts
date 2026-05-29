// ============================================
// DL Chat - Server Routes (Discord-like)
// ============================================
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { generateId, generateInviteCode } from '../utils/hash';
import { createServerSchema, roleSchema } from '../utils/validators';

type AppEnv = { Bindings: Env; Variables: Variables };
const servers = new Hono<AppEnv>();

servers.use('*', authMiddleware);

// Helper: log audit action
async function auditLog(env: Env, serverId: string, actorId: string, action: string, targetId?: string, changes?: unknown, reason?: string) {
  await env.DB.prepare(
    'INSERT INTO audit_logs (id, server_id, actor_id, target_id, action, changes, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(generateId(), serverId, actorId, targetId || null, action, changes ? JSON.stringify(changes) : null, reason || null, Date.now()).run();
}

// GET /api/v1/servers
servers.get('/', async (c) => {
  const user = c.get('user');

  const serverList = await c.env.DB.prepare(
    `SELECT s.id, s.name, s.description, s.icon_url, s.banner_url, s.owner_id, s.is_public,
     s.boost_level, s.total_boosts, s.features, s.created_at,
     (SELECT COUNT(*) FROM server_members sm2 WHERE sm2.server_id = s.id AND sm2.is_banned = 0) as member_count,
     sm.joined_at, sm.nickname
     FROM servers s
     JOIN server_members sm ON sm.server_id = s.id AND sm.user_id = ?
     WHERE s.is_deleted = 0 AND sm.is_banned = 0
     ORDER BY sm.joined_at DESC`
  ).bind(user.id).all();

  return c.json({ servers: serverList.results });
});

// POST /api/v1/servers
servers.post('/', zValidator('json', createServerSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const now = Date.now();

  const serverId = generateId();
  const inviteLink = generateInviteCode(8);

  await c.env.DB.prepare(
    `INSERT INTO servers (id, name, description, icon_url, owner_id, is_public, invite_link, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(serverId, body.name, body.description || null, body.icon_url || null, user.id, body.is_public ? 1 : 0, inviteLink, now, now).run();

  // Add creator as member and owner
  await c.env.DB.prepare(
    'INSERT INTO server_members (server_id, user_id, joined_at) VALUES (?, ?, ?)'
  ).bind(serverId, user.id, now).run();

  // Create default channels
  const generalChatId = generateId();
  const generalVoiceId = generateId();

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO chats (id, type, name, server_id, owner_id, created_at, updated_at) VALUES (?, 'server_channel', 'general', ?, ?, ?, ?)`
    ).bind(generalChatId, serverId, user.id, now, now),
    c.env.DB.prepare(
      `INSERT INTO chats (id, type, name, server_id, owner_id, created_at, updated_at) VALUES (?, 'server_channel', 'voice', ?, ?, ?, ?)`
    ).bind(generalVoiceId, serverId, user.id, now, now),
    c.env.DB.prepare(
      'INSERT INTO chat_members (chat_id, user_id, role, can_send_messages, can_send_media, joined_at) VALUES (?, ?, ?, 1, 1, ?)'
    ).bind(generalChatId, user.id, 'owner', now),
  ]);

  // Create @everyone role
  const everyoneRoleId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO server_roles (id, server_id, name, color, position, permissions, created_at)
     VALUES (?, ?, '@everyone', '#99AAB5', 0, ?, ?)`
  ).bind(everyoneRoleId, serverId, JSON.stringify({ view_channels: true, send_messages: true, send_media: true, add_reactions: true, connect: true, speak: true }), now).run();

  const server = await c.env.DB.prepare('SELECT * FROM servers WHERE id = ?').bind(serverId).first();

  return c.json({ server, channels: [{ id: generalChatId, name: 'general' }, { id: generalVoiceId, name: 'voice' }] }, 201);
});

// GET /api/v1/servers/discover
servers.get('/discover', async (c) => {
  const query = c.req.query('q');
  const limit = parseInt(c.req.query('limit') || '20');

  let sql = `SELECT s.id, s.name, s.description, s.icon_url, s.banner_url, s.features, s.boost_level,
   (SELECT COUNT(*) FROM server_members sm WHERE sm.server_id = s.id AND sm.is_banned = 0) as member_count
   FROM servers s WHERE s.is_public = 1 AND s.is_deleted = 0`;

  const params: unknown[] = [];

  if (query) {
    sql += ' AND (s.name LIKE ? OR s.description LIKE ?)';
    params.push(`%${query}%`, `%${query}%`);
  }

  sql += ' ORDER BY member_count DESC LIMIT ?';
  params.push(limit);

  const result = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ servers: result.results });
});

// GET /api/v1/servers/:id
servers.get('/:id', async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');

  const server = await c.env.DB.prepare(
    `SELECT s.*, (SELECT COUNT(*) FROM server_members sm WHERE sm.server_id = s.id AND sm.is_banned = 0) as member_count
     FROM servers s WHERE s.id = ? AND s.is_deleted = 0`
  ).bind(serverId).first<any>();

  if (!server) {
    throw new HTTPException(404, { message: 'Server not found' });
  }

  const isMember = await c.env.DB.prepare(
    'SELECT * FROM server_members WHERE server_id = ? AND user_id = ? AND is_banned = 0'
  ).bind(serverId, user.id).first();

  if (!server.is_public && !isMember) {
    throw new HTTPException(403, { message: 'Server is private' });
  }

  const channels = await c.env.DB.prepare(
    'SELECT id, type, name, topic, slow_mode_seconds, category_id FROM chats WHERE server_id = ? AND is_deleted = 0 ORDER BY category_id, name ASC'
  ).bind(serverId).all();

  const categories = await c.env.DB.prepare(
    'SELECT * FROM server_categories WHERE server_id = ? ORDER BY position ASC'
  ).bind(serverId).all();

  const roles = await c.env.DB.prepare(
    'SELECT id, name, color, position, is_hoist, is_mentionable FROM server_roles WHERE server_id = ? ORDER BY position DESC'
  ).bind(serverId).all();

  return c.json({
    server: { ...server, features: JSON.parse(server.features || '[]') },
    channels: channels.results,
    categories: categories.results,
    roles: roles.results,
    membership: isMember,
  });
});

// PUT /api/v1/servers/:id
servers.put('/:id', async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const body = await c.req.json();

  const server = await c.env.DB.prepare(
    'SELECT owner_id FROM servers WHERE id = ? AND is_deleted = 0'
  ).bind(serverId).first<any>();

  if (!server) {
    throw new HTTPException(404, { message: 'Server not found' });
  }

  const isMember = await c.env.DB.prepare('SELECT server_id, user_id FROM server_member_roles smr JOIN server_roles sr ON sr.id = smr.role_id WHERE smr.server_id = ? AND smr.user_id = ? AND sr.permissions LIKE ?').bind(serverId, user.id, '%manage_server%').first();

  if (server.owner_id !== user.id && !isMember) {
    throw new HTTPException(403, { message: 'Not authorized' });
  }

  const allowed = ['name', 'description', 'icon_url', 'banner_url', 'is_public', 'verification_level'];
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
    values.push(Date.now(), serverId);
    await c.env.DB.prepare(`UPDATE servers SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
    await auditLog(c.env, serverId, user.id, 'SERVER_UPDATE', serverId, body);
  }

  const updated = await c.env.DB.prepare('SELECT * FROM servers WHERE id = ?').bind(serverId).first();
  return c.json({ server: updated });
});

// DELETE /api/v1/servers/:id
servers.delete('/:id', async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');

  const server = await c.env.DB.prepare('SELECT owner_id FROM servers WHERE id = ?').bind(serverId).first<any>();

  if (!server || server.owner_id !== user.id) {
    throw new HTTPException(403, { message: 'Only server owner can delete it' });
  }

  await c.env.DB.prepare('UPDATE servers SET is_deleted = 1, updated_at = ? WHERE id = ?').bind(Date.now(), serverId).run();

  return c.json({ success: true });
});

// GET /api/v1/servers/:id/channels
servers.get('/:id/channels', async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');

  const channels = await c.env.DB.prepare(
    `SELECT c.id, c.type, c.name, c.description, c.topic, c.slow_mode_seconds, c.is_announcement_only,
     c.category_id, c.created_at,
     (SELECT COUNT(*) FROM chat_members cm WHERE cm.chat_id = c.id) as member_count
     FROM chats c WHERE c.server_id = ? AND c.is_deleted = 0 ORDER BY c.category_id, c.name ASC`
  ).bind(serverId).all();

  return c.json({ channels: channels.results });
});

// POST /api/v1/servers/:id/channels
servers.post('/:id/channels', async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const body = await c.req.json();
  const now = Date.now();

  const server = await c.env.DB.prepare('SELECT owner_id FROM servers WHERE id = ?').bind(serverId).first<any>();
  if (!server) {
    throw new HTTPException(404, { message: 'Server not found' });
  }

  const isMember = await c.env.DB.prepare(
    'SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?'
  ).bind(serverId, user.id).first();

  if (server.owner_id !== user.id && !isMember) {
    throw new HTTPException(403, { message: 'Not authorized' });
  }

  const channelId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO chats (id, type, name, description, topic, server_id, category_id, owner_id, is_announcement_only, created_at, updated_at)
     VALUES (?, 'server_channel', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(channelId, body.name, body.description || null, body.topic || null, serverId, body.category_id || null, user.id, body.is_announcement_only ? 1 : 0, now, now).run();

  // Add creator as member
  await c.env.DB.prepare(
    'INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)'
  ).bind(channelId, user.id, 'owner', now).run();

  await auditLog(c.env, serverId, user.id, 'CHANNEL_CREATE', channelId, { name: body.name });

  const channel = await c.env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(channelId).first();
  return c.json({ channel }, 201);
});

// GET /api/v1/servers/:id/members
servers.get('/:id/members', async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const members = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_verified, u.is_premium, u.is_bot,
     sm.nickname, sm.joined_at, sm.timeout_until,
     (SELECT GROUP_CONCAT(sr.name) FROM server_member_roles smr JOIN server_roles sr ON sr.id = smr.role_id WHERE smr.server_id = ? AND smr.user_id = u.id) as roles
     FROM users u JOIN server_members sm ON sm.user_id = u.id
     WHERE sm.server_id = ? AND sm.is_banned = 0
     ORDER BY sm.joined_at ASC LIMIT ? OFFSET ?`
  ).bind(serverId, serverId, limit, offset).all();

  return c.json({ members: members.results });
});

// POST /api/v1/servers/:id/members/:uid/kick
servers.post('/:id/members/:uid/kick', zValidator('json', z.object({ reason: z.string().optional() })), async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const targetUid = c.req.param('uid');
  const { reason } = c.req.valid('json');

  const server = await c.env.DB.prepare('SELECT owner_id FROM servers WHERE id = ?').bind(serverId).first<any>();
  if (server?.owner_id !== user.id) {
    throw new HTTPException(403, { message: 'Not authorized' });
  }

  await c.env.DB.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').bind(serverId, targetUid).run();
  await auditLog(c.env, serverId, user.id, 'MEMBER_KICK', targetUid, null, reason);

  return c.json({ success: true });
});

// POST /api/v1/servers/:id/members/:uid/ban
servers.post('/:id/members/:uid/ban', zValidator('json', z.object({ reason: z.string(), duration_days: z.number().optional() })), async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const targetUid = c.req.param('uid');
  const body = c.req.valid('json');

  const server = await c.env.DB.prepare('SELECT owner_id FROM servers WHERE id = ?').bind(serverId).first<any>();
  if (server?.owner_id !== user.id) {
    throw new HTTPException(403, { message: 'Not authorized' });
  }

  await c.env.DB.prepare('UPDATE server_members SET is_banned = 1, ban_reason = ? WHERE server_id = ? AND user_id = ?')
    .bind(body.reason, serverId, targetUid).run();

  await auditLog(c.env, serverId, user.id, 'MEMBER_BAN', targetUid, { reason: body.reason });

  return c.json({ success: true });
});

// POST /api/v1/servers/:id/members/:uid/timeout
servers.post('/:id/members/:uid/timeout', zValidator('json', z.object({ duration_seconds: z.number().min(60).max(604800) })), async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const targetUid = c.req.param('uid');
  const { duration_seconds } = c.req.valid('json');

  const timeoutUntil = Date.now() + duration_seconds * 1000;
  await c.env.DB.prepare('UPDATE server_members SET timeout_until = ? WHERE server_id = ? AND user_id = ?')
    .bind(timeoutUntil, serverId, targetUid).run();

  await auditLog(c.env, serverId, user.id, 'MEMBER_TIMEOUT', targetUid, { duration_seconds });

  return c.json({ success: true, timeout_until: timeoutUntil });
});

// GET /api/v1/servers/:id/roles
servers.get('/:id/roles', async (c) => {
  const serverId = c.req.param('id');

  const roles = await c.env.DB.prepare(
    'SELECT * FROM server_roles WHERE server_id = ? ORDER BY position DESC'
  ).bind(serverId).all();

  return c.json({
    roles: roles.results.map((r: any) => ({
      ...r,
      permissions: JSON.parse(r.permissions || '{}')
    }))
  });
});

// POST /api/v1/servers/:id/roles
servers.post('/:id/roles', zValidator('json', roleSchema), async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const body = c.req.valid('json');
  const now = Date.now();

  const server = await c.env.DB.prepare('SELECT owner_id FROM servers WHERE id = ?').bind(serverId).first<any>();
  if (server?.owner_id !== user.id) {
    throw new HTTPException(403, { message: 'Not authorized' });
  }

  const roleId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO server_roles (id, server_id, name, color, is_hoist, is_mentionable, permissions, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(roleId, serverId, body.name, body.color || '#99AAB5', body.is_hoist ? 1 : 0, body.is_mentionable ? 1 : 0, JSON.stringify(body.permissions || {}), now).run();

  await auditLog(c.env, serverId, user.id, 'ROLE_CREATE', roleId, { name: body.name });

  const role = await c.env.DB.prepare('SELECT * FROM server_roles WHERE id = ?').bind(roleId).first<any>();
  return c.json({ role: { ...role, permissions: JSON.parse(role.permissions) } }, 201);
});

// PUT /api/v1/servers/:id/roles/:rid
servers.put('/:id/roles/:rid', zValidator('json', roleSchema), async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const roleId = c.req.param('rid');
  const body = c.req.valid('json');

  const server = await c.env.DB.prepare('SELECT owner_id FROM servers WHERE id = ?').bind(serverId).first<any>();
  if (server?.owner_id !== user.id) {
    throw new HTTPException(403, { message: 'Not authorized' });
  }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name); }
  if (body.color !== undefined) { fields.push('color = ?'); values.push(body.color); }
  if (body.is_hoist !== undefined) { fields.push('is_hoist = ?'); values.push(body.is_hoist ? 1 : 0); }
  if (body.is_mentionable !== undefined) { fields.push('is_mentionable = ?'); values.push(body.is_mentionable ? 1 : 0); }
  if (body.permissions !== undefined) { fields.push('permissions = ?'); values.push(JSON.stringify(body.permissions)); }

  values.push(roleId, serverId);
  await c.env.DB.prepare(`UPDATE server_roles SET ${fields.join(', ')} WHERE id = ? AND server_id = ?`).bind(...values).run();

  await auditLog(c.env, serverId, user.id, 'ROLE_UPDATE', roleId, body);

  return c.json({ success: true });
});

// DELETE /api/v1/servers/:id/roles/:rid
servers.delete('/:id/roles/:rid', async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const roleId = c.req.param('rid');

  const server = await c.env.DB.prepare('SELECT owner_id FROM servers WHERE id = ?').bind(serverId).first<any>();
  if (server?.owner_id !== user.id) {
    throw new HTTPException(403, { message: 'Not authorized' });
  }

  await c.env.DB.prepare('DELETE FROM server_roles WHERE id = ? AND server_id = ?').bind(roleId, serverId).run();
  await auditLog(c.env, serverId, user.id, 'ROLE_DELETE', roleId);

  return c.json({ success: true });
});

// GET /api/v1/servers/:id/invites
servers.get('/:id/invites', async (c) => {
  const serverId = c.req.param('id');

  const invites = await c.env.DB.prepare(
    `SELECT si.*, u.display_name as creator_name, c.name as channel_name
     FROM server_invites si
     LEFT JOIN users u ON u.id = si.creator_id
     LEFT JOIN chats c ON c.id = si.channel_id
     WHERE si.server_id = ?
     ORDER BY si.created_at DESC`
  ).bind(serverId).all();

  return c.json({ invites: invites.results });
});

// POST /api/v1/servers/:id/invites
servers.post('/:id/invites', async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const now = Date.now();

  const code = generateInviteCode(8);
  await c.env.DB.prepare(
    `INSERT INTO server_invites (code, server_id, channel_id, creator_id, max_uses, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(code, serverId, body.channel_id || null, user.id, body.max_uses || 0, body.expires_at || null, now).run();

  return c.json({ code, invite_url: `https://dlchat.app/invite/${code}` }, 201);
});

// GET /api/v1/servers/:id/audit-log
servers.get('/:id/audit-log', async (c) => {
  const serverId = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '50');

  const logs = await c.env.DB.prepare(
    `SELECT al.*, u.display_name as actor_name, u.avatar_url as actor_avatar
     FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_id
     WHERE al.server_id = ? ORDER BY al.created_at DESC LIMIT ?`
  ).bind(serverId, limit).all();

  return c.json({ logs: logs.results.map((l: any) => ({ ...l, changes: l.changes ? JSON.parse(l.changes) : null })) });
});

// GET /api/v1/servers/:id/emojis
servers.get('/:id/emojis', async (c) => {
  const serverId = c.req.param('id');
  const emojis = await c.env.DB.prepare('SELECT * FROM custom_emojis WHERE server_id = ?').bind(serverId).all();
  return c.json({ emojis: emojis.results });
});

// POST /api/v1/servers/:id/emojis
servers.post('/:id/emojis', async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const body = await c.req.json<{ name: string; image_url: string; is_animated?: boolean }>();

  if (!body.name || !body.image_url) {
    throw new HTTPException(400, { message: 'name and image_url required' });
  }

  const emojiId = generateId();
  await c.env.DB.prepare(
    'INSERT INTO custom_emojis (id, server_id, name, image_url, is_animated, creator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(emojiId, serverId, body.name, body.image_url, body.is_animated ? 1 : 0, user.id, Date.now()).run();

  await c.env.DB.prepare('UPDATE servers SET custom_emojis_count = custom_emojis_count + 1 WHERE id = ?').bind(serverId).run();

  const emoji = await c.env.DB.prepare('SELECT * FROM custom_emojis WHERE id = ?').bind(emojiId).first();
  return c.json({ emoji }, 201);
});

// GET /api/v1/servers/:id/events
servers.get('/:id/events', async (c) => {
  const serverId = c.req.param('id');
  const events = await c.env.DB.prepare(
    `SELECT se.*, u.display_name as creator_name FROM server_events se
     JOIN users u ON u.id = se.creator_id WHERE se.server_id = ? ORDER BY se.start_time ASC`
  ).bind(serverId).all();
  return c.json({ events: events.results });
});

// POST /api/v1/servers/:id/events
servers.post('/:id/events', async (c) => {
  const user = c.get('user');
  const serverId = c.req.param('id');
  const body = await c.req.json<{ name: string; description?: string; start_time: number; end_time?: number; channel_id?: string }>();

  if (!body.name || !body.start_time) {
    throw new HTTPException(400, { message: 'name and start_time required' });
  }

  const eventId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO server_events (id, server_id, channel_id, creator_id, name, description, start_time, end_time, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(eventId, serverId, body.channel_id || null, user.id, body.name, body.description || null, body.start_time, body.end_time || null, Date.now()).run();

  const event = await c.env.DB.prepare('SELECT * FROM server_events WHERE id = ?').bind(eventId).first();
  return c.json({ event }, 201);
});

// POST /api/v1/servers/join/:inviteCode
servers.post('/join/:inviteCode', async (c) => {
  const user = c.get('user');
  const inviteCode = c.req.param('inviteCode');
  const now = Date.now();

  const invite = await c.env.DB.prepare(
    'SELECT * FROM server_invites WHERE code = ?'
  ).bind(inviteCode).first<any>();

  if (!invite) {
    throw new HTTPException(404, { message: 'Invalid invite code' });
  }

  if (invite.expires_at && invite.expires_at < now) {
    throw new HTTPException(400, { message: 'Invite has expired' });
  }

  if (invite.max_uses > 0 && invite.uses >= invite.max_uses) {
    throw new HTTPException(400, { message: 'Invite has reached maximum uses' });
  }

  const server = await c.env.DB.prepare(
    'SELECT id, name, max_members FROM servers WHERE id = ? AND is_deleted = 0'
  ).bind(invite.server_id).first<any>();

  if (!server) {
    throw new HTTPException(404, { message: 'Server not found' });
  }

  const memberCount = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM server_members WHERE server_id = ? AND is_banned = 0'
  ).bind(server.id).first<{ count: number }>();

  if ((memberCount?.count || 0) >= server.max_members) {
    throw new HTTPException(400, { message: 'Server is full' });
  }

  const existing = await c.env.DB.prepare(
    'SELECT is_banned FROM server_members WHERE server_id = ? AND user_id = ?'
  ).bind(server.id, user.id).first<any>();

  if (existing?.is_banned) {
    throw new HTTPException(403, { message: 'You are banned from this server' });
  }

  if (!existing) {
    await c.env.DB.prepare(
      'INSERT INTO server_members (server_id, user_id, joined_at) VALUES (?, ?, ?)'
    ).bind(server.id, user.id, now).run();
  }

  await c.env.DB.prepare('UPDATE server_invites SET uses = uses + 1 WHERE code = ?').bind(inviteCode).run();

  return c.json({ success: true, server, already_member: !!existing && !existing.is_banned }, existing ? 200 : 201);
});

export default servers;
