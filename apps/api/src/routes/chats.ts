// ============================================
// DL Chat - Chat Routes
// ============================================
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { generateId, generateInviteCode } from '../utils/hash';
import { createGroupSchema } from '../utils/validators';

type AppEnv = { Bindings: Env; Variables: Variables };
const chats = new Hono<AppEnv>();

chats.use('*', authMiddleware);

// GET /api/v1/chats - List user's chats
chats.get('/', async (c) => {
  const user = c.get('user');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const chatList = await c.env.DB.prepare(
    `SELECT c.id, c.type, c.name, c.description, c.avatar_url, c.owner_id, c.is_public,
     c.slow_mode_seconds, c.disappearing_messages_timer, c.last_message_at, c.total_messages,
     c.created_at, c.updated_at,
     cm.role, cm.notifications_enabled, cm.is_muted, cm.mute_until,
     (SELECT COUNT(*) FROM message_reads mr 
      WHERE mr.user_id = ? 
      AND mr.message_id IN (SELECT id FROM messages WHERE chat_id = c.id)) as read_count,
     (SELECT m.id FROM messages m WHERE m.chat_id = c.id AND m.is_deleted = 0 
      AND m.is_scheduled = 0 ORDER BY m.created_at DESC LIMIT 1) as last_message_id
     FROM chats c
     JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = ?
     WHERE c.is_deleted = 0 AND cm.role != 'banned'
     ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(user.id, user.id, limit, offset).all();

  // Get last messages
  const results = await Promise.all(chatList.results.map(async (chat: any) => {
    let lastMessage = null;
    if (chat.last_message_id) {
      lastMessage = await c.env.DB.prepare(
        `SELECT m.id, m.type, m.content, m.media_url, m.media_mime_type, m.created_at, m.sender_id, m.is_deleted,
         u.display_name as sender_name, u.avatar_url as sender_avatar
         FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`
      ).bind(chat.last_message_id).first();
    }

    // Unread count
    const unreadResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM messages m
       WHERE m.chat_id = ? AND m.is_deleted = 0 AND m.is_scheduled = 0
       AND m.sender_id != ?
       AND m.id NOT IN (SELECT mr.message_id FROM message_reads mr WHERE mr.user_id = ?)
       AND m.created_at > COALESCE((SELECT cm2.joined_at FROM chat_members cm2 WHERE cm2.chat_id = ? AND cm2.user_id = ?), 0)`
    ).bind(chat.id, user.id, user.id, chat.id, user.id).first<{ count: number }>();

    return {
      ...chat,
      last_message: lastMessage,
      unread_count: unreadResult?.count || 0,
    };
  }));

  return c.json({ chats: results });
});

// POST /api/v1/chats/direct - Create/get direct chat
chats.post('/direct', zValidator('json', z.object({ user_id: z.string() })), async (c) => {
  const currentUser = c.get('user');
  const { user_id } = c.req.valid('json');
  const now = Date.now();

  if (user_id === currentUser.id) {
    throw new HTTPException(400, { message: 'Cannot create chat with yourself' });
  }

  // Check if other user exists
  const otherUser = await c.env.DB.prepare('SELECT id, display_name, is_banned FROM users WHERE id = ?').bind(user_id).first<any>();
  if (!otherUser || otherUser.is_banned) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  // Check if blocked
  const isBlocked = await c.env.DB.prepare(
    'SELECT 1 FROM contacts WHERE (user_id = ? AND contact_id = ? OR user_id = ? AND contact_id = ?) AND is_blocked = 1'
  ).bind(currentUser.id, user_id, user_id, currentUser.id).first();

  if (isBlocked) {
    throw new HTTPException(403, { message: 'Cannot create chat with blocked user' });
  }

  // Check if direct chat already exists
  const existingChat = await c.env.DB.prepare(
    `SELECT c.id FROM chats c
     JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = ?
     JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = ?
     WHERE c.type = 'direct' AND c.is_deleted = 0`
  ).bind(currentUser.id, user_id).first<any>();

  if (existingChat) {
    const chat = await c.env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(existingChat.id).first();
    return c.json({ chat, is_new: false });
  }

  // Create new direct chat
  const chatId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO chats (id, type, owner_id, created_at, updated_at) VALUES (?, 'direct', ?, ?, ?)`
  ).bind(chatId, currentUser.id, now, now).run();

  // Add both members
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO chat_members (chat_id, user_id, role, can_send_messages, can_send_media, joined_at) VALUES (?, ?, 'owner', 1, 1, ?)`
    ).bind(chatId, currentUser.id, now),
    c.env.DB.prepare(
      `INSERT INTO chat_members (chat_id, user_id, role, can_send_messages, can_send_media, joined_at) VALUES (?, ?, 'member', 1, 1, ?)`
    ).bind(chatId, user_id, now),
  ]);

  const chat = await c.env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(chatId).first();
  return c.json({ chat, is_new: true }, 201);
});

// POST /api/v1/chats/group - Create group
chats.post('/group', zValidator('json', createGroupSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const now = Date.now();

  const chatId = generateId();
  const inviteLink = generateInviteCode(12);

  await c.env.DB.prepare(
    `INSERT INTO chats (id, type, name, description, avatar_url, owner_id, invite_link, created_at, updated_at)
     VALUES (?, 'group', ?, ?, ?, ?, ?, ?, ?)`
  ).bind(chatId, body.name, body.description || null, body.avatar_url || null, user.id, inviteLink, now, now).run();

  // Add creator as owner
  await c.env.DB.prepare(
    `INSERT INTO chat_members (chat_id, user_id, role, can_send_messages, can_send_media, can_send_polls, 
     can_add_members, can_pin_messages, can_change_info, can_manage_bots, joined_at)
     VALUES (?, ?, 'owner', 1, 1, 1, 1, 1, 1, 1, ?)`
  ).bind(chatId, user.id, now).run();

  // Add initial members
  if (body.member_ids?.length) {
    const memberInserts = body.member_ids.slice(0, 256).map((memberId: string) =>
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO chat_members (chat_id, user_id, role, can_send_messages, can_send_media, joined_at, invite_by)
         VALUES (?, ?, 'member', 1, 1, ?, ?)`
      ).bind(chatId, memberId, now, user.id)
    );
    await c.env.DB.batch(memberInserts);
  }

  const chat = await c.env.DB.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM chat_members WHERE chat_id = c.id) as member_count
    FROM chats c WHERE c.id = ?
  `).bind(chatId).first();

  return c.json({ chat }, 201);
});

// GET /api/v1/chats/:id
chats.get('/:id', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');

  // Check membership
  const member = await c.env.DB.prepare(
    'SELECT * FROM chat_members WHERE chat_id = ? AND user_id = ? AND role != ?'
  ).bind(chatId, user.id, 'banned').first();

  const chat = await c.env.DB.prepare('SELECT * FROM chats WHERE id = ? AND is_deleted = 0').bind(chatId).first<any>();

  if (!chat) {
    throw new HTTPException(404, { message: 'Chat not found' });
  }

  if (!member && !chat.is_public) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const memberCount = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM chat_members WHERE chat_id = ? AND role != 'banned'`
  ).bind(chatId).first<{ count: number }>();

  return c.json({
    chat: { ...chat, member_count: memberCount?.count || 0, membership: member }
  });
});

// PUT /api/v1/chats/:id
chats.put('/:id', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');
  const body = await c.req.json();

  const member = await c.env.DB.prepare(
    `SELECT role, can_change_info FROM chat_members WHERE chat_id = ? AND user_id = ?`
  ).bind(chatId, user.id).first<any>();

  if (!member || (!member.can_change_info && !['owner', 'admin'].includes(member.role))) {
    throw new HTTPException(403, { message: 'Not authorized to update this chat' });
  }

  const allowed = ['name', 'description', 'avatar_url', 'slow_mode_seconds', 'is_announcement_only', 'topic', 'disappearing_messages_timer'];
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
  values.push(Date.now());
  values.push(chatId);

  await c.env.DB.prepare(`UPDATE chats SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();

  const updated = await c.env.DB.prepare('SELECT * FROM chats WHERE id = ?').bind(chatId).first();
  return c.json({ chat: updated });
});

// DELETE /api/v1/chats/:id
chats.delete('/:id', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');
  const now = Date.now();

  const member = await c.env.DB.prepare(
    `SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?`
  ).bind(chatId, user.id).first<any>();

  if (!member) {
    throw new HTTPException(403, { message: 'Not a member of this chat' });
  }

  const chat = await c.env.DB.prepare('SELECT type, owner_id FROM chats WHERE id = ?').bind(chatId).first<any>();

  if (chat?.type === 'direct' || member.role === 'owner') {
    // Owner deletes for everyone
    await c.env.DB.prepare('UPDATE chats SET is_deleted = 1, updated_at = ? WHERE id = ?').bind(now, chatId).run();
  } else {
    // Leave group
    await c.env.DB.prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').bind(chatId, user.id).run();
  }

  return c.json({ success: true });
});

// GET /api/v1/chats/:id/members
chats.get('/:id/members', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const isMember = await c.env.DB.prepare(
    'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ? AND role != ?'
  ).bind(chatId, user.id, 'banned').first();

  const chat = await c.env.DB.prepare('SELECT is_public FROM chats WHERE id = ?').bind(chatId).first<any>();

  if (!isMember && !chat?.is_public) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const members = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_verified, u.is_premium, u.is_bot,
     cm.role, cm.custom_title, cm.is_anonymous, cm.joined_at
     FROM users u JOIN chat_members cm ON cm.user_id = u.id
     WHERE cm.chat_id = ? AND cm.role != 'banned'
     ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END, u.display_name ASC
     LIMIT ? OFFSET ?`
  ).bind(chatId, limit, offset).all();

  return c.json({ members: members.results });
});

// POST /api/v1/chats/:id/members
chats.post('/:id/members', zValidator('json', z.object({ user_ids: z.array(z.string()) })), async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');
  const { user_ids } = c.req.valid('json');
  const now = Date.now();

  const member = await c.env.DB.prepare(
    'SELECT role, can_add_members FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(chatId, user.id).first<any>();

  if (!member || (!member.can_add_members && !['owner', 'admin'].includes(member.role))) {
    throw new HTTPException(403, { message: 'Not authorized to add members' });
  }

  const chat = await c.env.DB.prepare('SELECT max_members FROM chats WHERE id = ?').bind(chatId).first<any>();
  const currentCount = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM chat_members WHERE chat_id = ? AND role != 'banned'`
  ).bind(chatId).first<{ count: number }>();

  if ((currentCount?.count || 0) + user_ids.length > (chat?.max_members || 200000)) {
    throw new HTTPException(400, { message: 'Group member limit reached' });
  }

  const inserts = user_ids.slice(0, 100).map(uid =>
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO chat_members (chat_id, user_id, role, can_send_messages, can_send_media, joined_at, invite_by)
       VALUES (?, ?, 'member', 1, 1, ?, ?)`
    ).bind(chatId, uid, now, user.id)
  );

  await c.env.DB.batch(inserts);

  return c.json({ success: true, added: user_ids.length });
});

// DELETE /api/v1/chats/:id/members/:uid
chats.delete('/:id/members/:uid', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');
  const targetUid = c.req.param('uid');

  if (targetUid === user.id) {
    // Leave chat
    await c.env.DB.prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').bind(chatId, user.id).run();
    return c.json({ success: true, message: 'Left chat' });
  }

  const member = await c.env.DB.prepare(
    'SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(chatId, user.id).first<any>();

  if (!member || !['owner', 'admin', 'moderator'].includes(member.role)) {
    throw new HTTPException(403, { message: 'Not authorized to remove members' });
  }

  await c.env.DB.prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').bind(chatId, targetUid).run();

  return c.json({ success: true });
});

// PUT /api/v1/chats/:id/members/:uid
chats.put('/:id/members/:uid', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');
  const targetUid = c.req.param('uid');
  const body = await c.req.json();

  const member = await c.env.DB.prepare(
    'SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(chatId, user.id).first<any>();

  if (!member || !['owner', 'admin'].includes(member.role)) {
    throw new HTTPException(403, { message: 'Not authorized' });
  }

  const allowed = ['role', 'custom_title', 'can_send_messages', 'can_send_media', 'can_send_polls', 'can_add_members', 'can_pin_messages'];
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(body[key]);
    }
  }

  if (fields.length === 0) {
    throw new HTTPException(400, { message: 'No fields to update' });
  }

  values.push(chatId, targetUid);
  await c.env.DB.prepare(`UPDATE chat_members SET ${fields.join(', ')} WHERE chat_id = ? AND user_id = ?`).bind(...values).run();

  return c.json({ success: true });
});

// POST /api/v1/chats/:id/invite
chats.post('/:id/invite', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');

  const member = await c.env.DB.prepare(
    'SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(chatId, user.id).first<any>();

  if (!member || !['owner', 'admin'].includes(member.role)) {
    throw new HTTPException(403, { message: 'Not authorized to generate invite links' });
  }

  const inviteCode = generateInviteCode(12);
  const body = await c.req.json().catch(() => ({}));
  const expiresAt = body.expires_in ? Date.now() + body.expires_in * 1000 : null;

  await c.env.DB.prepare('UPDATE chats SET invite_link = ?, invite_link_expires_at = ? WHERE id = ?')
    .bind(inviteCode, expiresAt, chatId).run();

  return c.json({ invite_link: inviteCode, invite_url: `https://dlchat.app/join/${inviteCode}` });
});

// POST /api/v1/chats/join/:inviteCode
chats.post('/join/:inviteCode', async (c) => {
  const user = c.get('user');
  const inviteCode = c.req.param('inviteCode');
  const now = Date.now();

  const chat = await c.env.DB.prepare(
    'SELECT id, name, type, max_members, invite_link_expires_at FROM chats WHERE invite_link = ? AND is_deleted = 0'
  ).bind(inviteCode).first<any>();

  if (!chat) {
    throw new HTTPException(404, { message: 'Invalid invite link' });
  }

  if (chat.invite_link_expires_at && chat.invite_link_expires_at < now) {
    throw new HTTPException(400, { message: 'Invite link has expired' });
  }

  const memberCount = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM chat_members WHERE chat_id = ? AND role != 'banned'`
  ).bind(chat.id).first<{ count: number }>();

  if ((memberCount?.count || 0) >= chat.max_members) {
    throw new HTTPException(400, { message: 'Chat is full' });
  }

  // Check if already member
  const existing = await c.env.DB.prepare(
    'SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(chat.id, user.id).first<any>();

  if (existing && existing.role !== 'banned') {
    return c.json({ success: true, chat, already_member: true });
  }

  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO chat_members (chat_id, user_id, role, can_send_messages, can_send_media, joined_at)
     VALUES (?, ?, 'member', 1, 1, ?)`
  ).bind(chat.id, user.id, now).run();

  return c.json({ success: true, chat, already_member: false }, 201);
});

// GET /api/v1/chats/:id/pinned
chats.get('/:id/pinned', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');

  const isMember = await c.env.DB.prepare(
    'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(chatId, user.id).first();

  if (!isMember) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const pinned = await c.env.DB.prepare(
    `SELECT m.*, u.display_name as sender_name, u.avatar_url as sender_avatar,
     pm.pinned_by, pm.pinned_at
     FROM messages m
     JOIN pinned_messages pm ON pm.message_id = m.id AND pm.chat_id = ?
     JOIN users u ON u.id = m.sender_id
     WHERE m.is_deleted = 0
     ORDER BY pm.pinned_at DESC`
  ).bind(chatId).all();

  return c.json({ pinned_messages: pinned.results });
});

// GET /api/v1/chats/:id/search
chats.get('/:id/search', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');
  const query = c.req.query('q');
  const limit = parseInt(c.req.query('limit') || '20');

  if (!query) {
    throw new HTTPException(400, { message: 'Query required' });
  }

  const isMember = await c.env.DB.prepare(
    'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(chatId, user.id).first();

  if (!isMember) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const results = await c.env.DB.prepare(
    `SELECT m.id, m.content, m.type, m.created_at, m.sender_id,
     u.display_name as sender_name, u.avatar_url as sender_avatar
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.chat_id = ? AND m.content LIKE ? AND m.is_deleted = 0
     ORDER BY m.created_at DESC LIMIT ?`
  ).bind(chatId, `%${query}%`, limit).all();

  return c.json({ messages: results.results });
});

// GET /api/v1/chats/:id/media
chats.get('/:id/media', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '30');
  const offset = parseInt(c.req.query('offset') || '0');

  const isMember = await c.env.DB.prepare(
    'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(chatId, user.id).first();

  if (!isMember) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const media = await c.env.DB.prepare(
    `SELECT id, type, media_url, media_thumbnail, media_mime_type, media_size, media_width, media_height, created_at, sender_id
     FROM messages WHERE chat_id = ? AND type IN ('image', 'video', 'gif') AND is_deleted = 0
     ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(chatId, limit, offset).all();

  return c.json({ media: media.results });
});

// GET /api/v1/chats/:id/docs
chats.get('/:id/docs', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '30');
  const offset = parseInt(c.req.query('offset') || '0');

  const isMember = await c.env.DB.prepare(
    'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(chatId, user.id).first();

  if (!isMember) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const docs = await c.env.DB.prepare(
    `SELECT id, type, content, media_url, media_mime_type, media_size, created_at, sender_id
     FROM messages WHERE chat_id = ? AND type = 'document' AND is_deleted = 0
     ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(chatId, limit, offset).all();

  return c.json({ documents: docs.results });
});

export default chats;
