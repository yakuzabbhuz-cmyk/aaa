// ============================================
// DL Chat - Status/Stories Routes
// ============================================
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { generateId } from '../utils/hash';

type AppEnv = { Bindings: Env; Variables: Variables };
const status = new Hono<AppEnv>();

status.use('*', authMiddleware);

// GET /api/v1/status - Get friends' statuses
status.get('/', async (c) => {
  const user = c.get('user');
  const now = Date.now();

  // Get contact IDs
  const contacts = await c.env.DB.prepare(
    'SELECT contact_id FROM contacts WHERE user_id = ? AND is_blocked = 0'
  ).bind(user.id).all<{ contact_id: string }>();

  const contactIds = contacts.results.map(c => c.contact_id);
  contactIds.push(user.id); // include own status

  if (contactIds.length === 0) {
    return c.json({ status_updates: [] });
  }

  const placeholders = contactIds.map(() => '?').join(',');
  const statuses = await c.env.DB.prepare(
    `SELECT su.*, u.display_name, u.avatar_url, u.username
     FROM status_updates su JOIN users u ON u.id = su.user_id
     WHERE su.user_id IN (${placeholders}) AND su.expires_at > ? AND su.privacy != 'nobody'
     ORDER BY su.created_at DESC`
  ).bind(...contactIds, now).all();

  // Group by user
  const grouped: Record<string, any> = {};
  for (const s of statuses.results as any[]) {
    if (!grouped[s.user_id]) {
      grouped[s.user_id] = {
        user: { id: s.user_id, display_name: s.display_name, avatar_url: s.avatar_url, username: s.username },
        statuses: [],
      };
    }

    const viewers: any[] = JSON.parse(s.viewers || '[]');
    const hasViewed = viewers.some((v: any) => v.user_id === user.id);

    grouped[s.user_id].statuses.push({
      id: s.id,
      type: s.type,
      content: s.content,
      media_url: s.media_url,
      background_color: s.background_color,
      caption: s.caption,
      created_at: s.created_at,
      expires_at: s.expires_at,
      viewer_count: viewers.length,
      has_viewed: hasViewed,
      reactions: JSON.parse(s.reactions || '{}'),
    });
  }

  return c.json({ status_updates: Object.values(grouped) });
});

// POST /api/v1/status - Create status
status.post('/', zValidator('json', z.object({
  type: z.enum(['text', 'image', 'video', 'gif']),
  content: z.string().max(500).optional(),
  media_url: z.string().url().optional(),
  background_color: z.string().optional(),
  font_style: z.string().optional(),
  caption: z.string().max(500).optional(),
  privacy: z.enum(['everyone', 'contacts', 'selected', 'exclude']).optional(),
  allowed_user_ids: z.array(z.string()).optional(),
  excluded_user_ids: z.array(z.string()).optional(),
  is_reshare_disabled: z.boolean().optional(),
})), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const now = Date.now();

  if (body.type === 'text' && !body.content) {
    throw new HTTPException(400, { message: 'Content required for text status' });
  }
  if (['image', 'video', 'gif'].includes(body.type) && !body.media_url) {
    throw new HTTPException(400, { message: 'media_url required for media status' });
  }

  const statusId = generateId();
  const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

  await c.env.DB.prepare(
    `INSERT INTO status_updates (id, user_id, type, content, media_url, background_color, font_style, caption,
     privacy, allowed_user_ids, excluded_user_ids, is_reshare_disabled, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    statusId, user.id, body.type, body.content || null, body.media_url || null,
    body.background_color || null, body.font_style || null, body.caption || null,
    body.privacy || 'contacts',
    JSON.stringify(body.allowed_user_ids || []),
    JSON.stringify(body.excluded_user_ids || []),
    body.is_reshare_disabled ? 1 : 0,
    now, expiresAt
  ).run();

  const newStatus = await c.env.DB.prepare('SELECT * FROM status_updates WHERE id = ?').bind(statusId).first();
  return c.json({ status: newStatus }, 201);
});

// DELETE /api/v1/status/:id
status.delete('/:id', async (c) => {
  const user = c.get('user');
  const statusId = c.req.param('id');

  const s = await c.env.DB.prepare('SELECT user_id FROM status_updates WHERE id = ?').bind(statusId).first<any>();
  if (!s || s.user_id !== user.id) {
    throw new HTTPException(403, { message: 'Not authorized' });
  }

  await c.env.DB.prepare('DELETE FROM status_updates WHERE id = ?').bind(statusId).run();
  return c.json({ success: true });
});

// GET /api/v1/status/:id/viewers
status.get('/:id/viewers', async (c) => {
  const user = c.get('user');
  const statusId = c.req.param('id');

  const s = await c.env.DB.prepare('SELECT user_id, viewers FROM status_updates WHERE id = ?').bind(statusId).first<any>();
  if (!s || s.user_id !== user.id) {
    throw new HTTPException(403, { message: 'Not authorized' });
  }

  const viewers: Array<{ user_id: string; viewed_at: number }> = JSON.parse(s.viewers || '[]');

  // Get user details for viewers
  if (viewers.length === 0) {
    return c.json({ viewers: [] });
  }

  const viewerIds = viewers.map(v => v.user_id);
  const placeholders = viewerIds.map(() => '?').join(',');
  const users = await c.env.DB.prepare(
    `SELECT id, display_name, avatar_url, username FROM users WHERE id IN (${placeholders})`
  ).bind(...viewerIds).all<any>();

  const userMap: Record<string, any> = {};
  users.results.forEach(u => { userMap[u.id] = u; });

  return c.json({
    viewers: viewers.map(v => ({
      ...userMap[v.user_id],
      viewed_at: v.viewed_at,
    })).filter(v => v.id),
  });
});

// POST /api/v1/status/:id/react
status.post('/:id/react', zValidator('json', z.object({ emoji: z.string().max(10) })), async (c) => {
  const user = c.get('user');
  const statusId = c.req.param('id');
  const { emoji } = c.req.valid('json');
  const now = Date.now();

  const s = await c.env.DB.prepare('SELECT id, viewers, reactions FROM status_updates WHERE id = ? AND expires_at > ?').bind(statusId, now).first<any>();

  if (!s) {
    throw new HTTPException(404, { message: 'Status not found or expired' });
  }

  // Record view
  const viewers: any[] = JSON.parse(s.viewers || '[]');
  if (!viewers.some((v: any) => v.user_id === user.id)) {
    viewers.push({ user_id: user.id, viewed_at: now });
    await c.env.DB.prepare('UPDATE status_updates SET viewers = ? WHERE id = ?').bind(JSON.stringify(viewers), statusId).run();
  }

  // Add reaction
  const reactions: Record<string, string> = JSON.parse(s.reactions || '{}');
  reactions[user.id] = emoji;

  await c.env.DB.prepare('UPDATE status_updates SET reactions = ? WHERE id = ?')
    .bind(JSON.stringify(reactions), statusId).run();

  return c.json({ success: true, reactions });
});

// POST /api/v1/status/:id/reply (records view + sends DM to status owner)
status.post('/:id/reply', zValidator('json', z.object({ content: z.string().min(1).max(1000) })), async (c) => {
  const user = c.get('user');
  const statusId = c.req.param('id');
  const { content } = c.req.valid('json');
  const now = Date.now();

  const s = await c.env.DB.prepare('SELECT id, user_id, viewers FROM status_updates WHERE id = ? AND expires_at > ?').bind(statusId, now).first<any>();
  if (!s) {
    throw new HTTPException(404, { message: 'Status not found or expired' });
  }

  // Record view
  const viewers: any[] = JSON.parse(s.viewers || '[]');
  if (!viewers.some((v: any) => v.user_id === user.id)) {
    viewers.push({ user_id: user.id, viewed_at: now });
    await c.env.DB.prepare('UPDATE status_updates SET viewers = ?, reply_count = reply_count + 1 WHERE id = ?')
      .bind(JSON.stringify(viewers), statusId).run();
  }

  // Get or create direct chat with status owner
  let chatId: string;
  const existingChat = await c.env.DB.prepare(
    `SELECT c.id FROM chats c
     JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = ?
     JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = ?
     WHERE c.type = 'direct' AND c.is_deleted = 0`
  ).bind(user.id, s.user_id).first<any>();

  if (existingChat) {
    chatId = existingChat.id;
  } else {
    chatId = generateId();
    await c.env.DB.prepare(`INSERT INTO chats (id, type, owner_id, created_at, updated_at) VALUES (?, 'direct', ?, ?, ?)`).bind(chatId, user.id, now, now).run();
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)`).bind(chatId, user.id, now),
      c.env.DB.prepare(`INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`).bind(chatId, s.user_id, now),
    ]);
  }

  // Send message with status reference
  const msgId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO messages (id, chat_id, sender_id, type, content, created_at) VALUES (?, ?, ?, 'text', ?, ?)`
  ).bind(msgId, chatId, user.id, `[Status Reply] ${content}`, now).run();

  return c.json({ success: true, chat_id: chatId, message_id: msgId });
});

export default status;
