// ============================================
// DL Chat - Friends & Contacts API Routes
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
const friends = new Hono<AppEnv>();
friends.use('*', authMiddleware);

const requestSchema = z.object({
  user_id: z.string().optional(),
  username: z.string().optional(),
  message: z.string().max(200).optional(),
});

// GET /api/v1/friends — get all friends
friends.get('/', async (c) => {
  const user = c.get('user');
  const status = c.req.query('status') || 'accepted'; // accepted|pending|blocked

  const rows = await c.env.DB.prepare(
    `SELECT f.id, f.status, f.created_at, f.message,
     CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END as friend_user_id,
     u.username, u.display_name, u.avatar_url, u.is_verified, u.bio,
     u.last_seen, u.is_online
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END
     WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = ?
     ORDER BY u.is_online DESC, u.display_name ASC`
  ).bind(user.id, user.id, user.id, user.id, status).all();

  return c.json({ friends: rows.results || [], count: rows.results?.length || 0 });
});

// GET /api/v1/friends/suggestions — friend suggestions based on mutual friends
friends.get('/suggestions', async (c) => {
  const user = c.get('user');

  // Get users who share server membership or mutual friends
  const suggestions = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_verified,
     COUNT(DISTINCT sm2.server_id) as mutual_servers,
     0 as mutual_friends
     FROM users u
     JOIN server_members sm1 ON sm1.server_id IN (
       SELECT server_id FROM server_members WHERE user_id = ?
     )
     JOIN server_members sm2 ON sm2.server_id = sm1.server_id AND sm2.user_id = u.id
     WHERE u.id != ? AND u.is_banned = 0 AND u.is_bot = 0
     AND u.id NOT IN (
       SELECT CASE WHEN user_id = ? THEN friend_id ELSE user_id END
       FROM friendships WHERE (user_id = ? OR friend_id = ?) AND status != 'blocked'
     )
     GROUP BY u.id ORDER BY mutual_servers DESC LIMIT 20`
  ).bind(user.id, user.id, user.id, user.id, user.id).all();

  return c.json({ suggestions: suggestions.results || [] });
});

// POST /api/v1/friends/request — send friend request
friends.post('/request', zValidator('json', requestSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');

  let targetId = body.user_id;

  if (!targetId && body.username) {
    const target = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(body.username).first<any>();
    if (!target) throw new HTTPException(404, { message: 'User not found' });
    targetId = target.id;
  }

  if (!targetId) throw new HTTPException(400, { message: 'user_id or username required' });
  if (targetId === user.id) throw new HTTPException(400, { message: 'Cannot add yourself' });

  // Check if already friends or request pending
  const existing = await c.env.DB.prepare(
    `SELECT status FROM friendships WHERE
     (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`
  ).bind(user.id, targetId, targetId, user.id).first<any>();

  if (existing?.status === 'accepted') throw new HTTPException(409, { message: 'Already friends' });
  if (existing?.status === 'pending') throw new HTTPException(409, { message: 'Request already pending' });
  if (existing?.status === 'blocked') throw new HTTPException(403, { message: 'User blocked' });

  const id = generateId();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO friendships (id, user_id, friend_id, status, message, created_at)
     VALUES (?, ?, ?, 'pending', ?, ?)`
  ).bind(id, user.id, targetId, body.message ?? null, now).run();

  // Create notification for target
  await c.env.DB.prepare(
    `INSERT INTO notifications (id, user_id, type, from_user_id, data_json, created_at)
     VALUES (?, ?, 'friend_request', ?, ?, ?)`
  ).bind(generateId(), targetId, user.id, JSON.stringify({ friendship_id: id }), now).run();

  return c.json({ id, status: 'pending', created_at: now }, 201);
});

// POST /api/v1/friends/:id/accept — accept friend request
friends.post('/:id/accept', async (c) => {
  const { id } = c.req.param();
  const user = c.get('user');

  const friendship = await c.env.DB.prepare(
    'SELECT * FROM friendships WHERE id = ? AND friend_id = ? AND status = ?'
  ).bind(id, user.id, 'pending').first<any>();

  if (!friendship) throw new HTTPException(404, { message: 'Friend request not found' });

  const now = Date.now();
  await c.env.DB.prepare(
    'UPDATE friendships SET status = ?, accepted_at = ? WHERE id = ?'
  ).bind('accepted', now, id).run();

  // Notify sender
  await c.env.DB.prepare(
    `INSERT INTO notifications (id, user_id, type, from_user_id, data_json, created_at)
     VALUES (?, ?, 'friend_accepted', ?, ?, ?)`
  ).bind(generateId(), friendship.user_id, user.id, JSON.stringify({ friendship_id: id }), now).run();

  // Auto-create a DM chat between friends
  const dmId = generateId();
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO chats (id, type, name, created_by, created_at)
     VALUES (?, 'direct', NULL, ?, ?)`
  ).bind(dmId, user.id, now).run();

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .bind(dmId, user.id, 'member', now),
    c.env.DB.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .bind(dmId, friendship.user_id, 'member', now),
  ]);

  return c.json({ success: true, dm_chat_id: dmId });
});

// POST /api/v1/friends/:id/decline — decline/cancel friend request
friends.post('/:id/decline', async (c) => {
  const { id } = c.req.param();
  const user = c.get('user');

  const result = await c.env.DB.prepare(
    `DELETE FROM friendships WHERE id = ? AND (friend_id = ? OR user_id = ?) AND status = 'pending'`
  ).bind(id, user.id, user.id).run();

  if (!result.meta?.changes) throw new HTTPException(404, { message: 'Request not found' });
  return c.json({ success: true });
});

// DELETE /api/v1/friends/:userId — unfriend
friends.delete('/:userId', async (c) => {
  const { userId } = c.req.param();
  const user = c.get('user');

  await c.env.DB.prepare(
    `DELETE FROM friendships WHERE
     ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)) AND status = 'accepted'`
  ).bind(user.id, userId, userId, user.id).run();

  return c.json({ success: true });
});

// POST /api/v1/friends/:userId/block — block user
friends.post('/:userId/block', async (c) => {
  const { userId } = c.req.param();
  const user = c.get('user');
  const now = Date.now();

  // Remove existing friendship if any
  await c.env.DB.prepare(
    `DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`
  ).bind(user.id, userId, userId, user.id).run();

  // Insert block record
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO friendships (id, user_id, friend_id, status, created_at)
     VALUES (?, ?, ?, 'blocked', ?)`
  ).bind(generateId(), user.id, userId, now).run();

  return c.json({ success: true, blocked: true });
});

// DELETE /api/v1/friends/:userId/block — unblock user
friends.delete('/:userId/block', async (c) => {
  const { userId } = c.req.param();
  const user = c.get('user');

  await c.env.DB.prepare(
    `DELETE FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'blocked'`
  ).bind(user.id, userId).run();

  return c.json({ success: true, unblocked: true });
});

// GET /api/v1/friends/blocked — get blocked users list
friends.get('/blocked', async (c) => {
  const user = c.get('user');

  const blocked = await c.env.DB.prepare(
    `SELECT f.id, f.created_at, u.id as user_id, u.username, u.display_name, u.avatar_url
     FROM friendships f JOIN users u ON u.id = f.friend_id
     WHERE f.user_id = ? AND f.status = 'blocked'`
  ).bind(user.id).all();

  return c.json({ blocked: blocked.results || [] });
});

export default friends;
