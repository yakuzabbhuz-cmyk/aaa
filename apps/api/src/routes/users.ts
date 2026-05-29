// ============================================
// DL Chat - User Routes
// ============================================
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { updateProfileSchema, privacySchema } from '../utils/validators';
import { storePublicKey } from '../services/encryption';

type AppEnv = { Bindings: Env; Variables: Variables };
const users = new Hono<AppEnv>();

// All user routes require auth
users.use('*', authMiddleware);

// GET /api/v1/users/me
users.get('/me', async (c) => {
  const user = c.get('user');
  const fullUser = await c.env.DB.prepare(
    `SELECT id, username, phone, email, display_name, bio, avatar_url, status, is_verified, is_premium,
     is_bot, created_at, updated_at, last_seen, privacy_last_seen, privacy_profile_photo, privacy_about,
     privacy_status, privacy_read_receipts, privacy_groups, custom_theme, language, notification_sound,
     two_factor_enabled, public_key FROM users WHERE id = ?`
  ).bind(user.id).first();

  return c.json({ user: fullUser });
});

// PUT /api/v1/users/me
users.put('/me', zValidator('json', updateProfileSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const now = Date.now();

  // Check username uniqueness if updating
  if (body.username) {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM users WHERE username = ? AND id != ?'
    ).bind(body.username, user.id).first();
    if (existing) {
      throw new HTTPException(409, { message: 'Username already taken' });
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.display_name !== undefined) { fields.push('display_name = ?'); values.push(body.display_name); }
  if (body.username !== undefined) { fields.push('username = ?'); values.push(body.username); }
  if (body.bio !== undefined) { fields.push('bio = ?'); values.push(body.bio); }
  if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status); }
  if (body.language !== undefined) { fields.push('language = ?'); values.push(body.language); }
  if (body.notification_sound !== undefined) { fields.push('notification_sound = ?'); values.push(body.notification_sound); }
  if (body.custom_theme !== undefined) { fields.push('custom_theme = ?'); values.push(body.custom_theme); }

  if (fields.length === 0) {
    throw new HTTPException(400, { message: 'No fields to update' });
  }

  fields.push('updated_at = ?');
  values.push(now);
  values.push(user.id);

  await c.env.DB.prepare(
    `UPDATE users SET ${fields.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  const updatedUser = await c.env.DB.prepare(
    `SELECT id, username, phone, email, display_name, bio, avatar_url, status, is_verified, is_premium,
     created_at, updated_at, last_seen, language, notification_sound, custom_theme FROM users WHERE id = ?`
  ).bind(user.id).first();

  return c.json({ user: updatedUser });
});

// GET /api/v1/users/search
users.get('/search', async (c) => {
  const query = c.req.query('q');
  const limit = parseInt(c.req.query('limit') || '20');

  if (!query || query.length < 2) {
    throw new HTTPException(400, { message: 'Search query must be at least 2 characters' });
  }

  const results = await c.env.DB.prepare(
    `SELECT id, username, display_name, bio, avatar_url, is_verified, is_premium, is_bot
     FROM users WHERE (username LIKE ? OR display_name LIKE ?) AND is_banned = 0
     ORDER BY is_verified DESC, username ASC LIMIT ?`
  ).bind(`%${query}%`, `%${query}%`, limit).all();

  return c.json({ users: results.results });
});

// GET /api/v1/users/:id
users.get('/:id', async (c) => {
  const currentUser = c.get('user');
  const userId = c.req.param('id');

  const user = await c.env.DB.prepare(
    `SELECT id, username, display_name, bio, avatar_url, status, is_verified, is_premium, is_bot,
     created_at, last_seen, privacy_last_seen, privacy_profile_photo, privacy_about, privacy_status
     FROM users WHERE id = ? AND is_banned = 0`
  ).bind(userId).first<any>();

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  // Check privacy settings
  const isContact = await c.env.DB.prepare(
    'SELECT 1 FROM contacts WHERE user_id = ? AND contact_id = ? AND is_blocked = 0'
  ).bind(currentUser.id, userId).first();

  // Apply privacy filters
  const canSeeLastSeen =
    user.privacy_last_seen === 'everyone' ||
    (user.privacy_last_seen === 'contacts' && isContact);

  const canSeeStatus =
    user.privacy_about === 'everyone' ||
    (user.privacy_about === 'contacts' && isContact);

  return c.json({
    user: {
      ...user,
      last_seen: canSeeLastSeen ? user.last_seen : null,
      bio: canSeeStatus ? user.bio : null,
    }
  });
});

// POST /api/v1/users/contacts
users.post('/contacts', zValidator('json', z.object({
  phone: z.string().optional(),
  user_id: z.string().optional(),
  nickname: z.string().optional(),
})), async (c) => {
  const currentUser = c.get('user');
  const body = c.req.valid('json');

  let contactId = body.user_id;

  if (body.phone && !contactId) {
    const found = await c.env.DB.prepare('SELECT id FROM users WHERE phone = ?').bind(body.phone).first<any>();
    if (!found) {
      throw new HTTPException(404, { message: 'User not found with this phone number' });
    }
    contactId = found.id;
  }

  if (!contactId) {
    throw new HTTPException(400, { message: 'Either phone or user_id required' });
  }

  if (contactId === currentUser.id) {
    throw new HTTPException(400, { message: 'Cannot add yourself as a contact' });
  }

  // Check if already exists
  const existing = await c.env.DB.prepare(
    'SELECT 1 FROM contacts WHERE user_id = ? AND contact_id = ?'
  ).bind(currentUser.id, contactId).first();

  if (existing) {
    // Update nickname if provided
    if (body.nickname) {
      await c.env.DB.prepare('UPDATE contacts SET nickname = ? WHERE user_id = ? AND contact_id = ?')
        .bind(body.nickname, currentUser.id, contactId).run();
    }
    return c.json({ success: true, message: 'Contact already exists' });
  }

  await c.env.DB.prepare(
    'INSERT INTO contacts (user_id, contact_id, nickname, is_blocked, created_at) VALUES (?, ?, ?, 0, ?)'
  ).bind(currentUser.id, contactId, body.nickname || null, Date.now()).run();

  const contact = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_verified, c.nickname, c.created_at
     FROM users u JOIN contacts c ON c.contact_id = u.id
     WHERE c.user_id = ? AND c.contact_id = ?`
  ).bind(currentUser.id, contactId).first();

  return c.json({ contact }, 201);
});

// GET /api/v1/users/contacts
users.get('/contacts', async (c) => {
  const user = c.get('user');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const contacts = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.bio, u.avatar_url, u.status, u.is_verified, u.last_seen,
     c.nickname, c.is_blocked, c.created_at
     FROM users u JOIN contacts c ON c.contact_id = u.id
     WHERE c.user_id = ? AND c.is_blocked = 0
     ORDER BY u.display_name ASC LIMIT ? OFFSET ?`
  ).bind(user.id, limit, offset).all();

  return c.json({ contacts: contacts.results });
});

// DELETE /api/v1/users/contacts/:id
users.delete('/contacts/:id', async (c) => {
  const user = c.get('user');
  const contactId = c.req.param('id');

  await c.env.DB.prepare('DELETE FROM contacts WHERE user_id = ? AND contact_id = ?')
    .bind(user.id, contactId).run();

  return c.json({ success: true });
});

// POST /api/v1/users/block/:id
users.post('/block/:id', async (c) => {
  const user = c.get('user');
  const blockId = c.req.param('id');
  const now = Date.now();

  if (blockId === user.id) {
    throw new HTTPException(400, { message: 'Cannot block yourself' });
  }

  // Check if contact exists
  const existing = await c.env.DB.prepare(
    'SELECT 1 FROM contacts WHERE user_id = ? AND contact_id = ?'
  ).bind(user.id, blockId).first();

  if (existing) {
    await c.env.DB.prepare('UPDATE contacts SET is_blocked = 1 WHERE user_id = ? AND contact_id = ?')
      .bind(user.id, blockId).run();
  } else {
    await c.env.DB.prepare(
      'INSERT INTO contacts (user_id, contact_id, is_blocked, created_at) VALUES (?, ?, 1, ?)'
    ).bind(user.id, blockId, now).run();
  }

  return c.json({ success: true, message: 'User blocked' });
});

// DELETE /api/v1/users/block/:id
users.delete('/block/:id', async (c) => {
  const user = c.get('user');
  const blockId = c.req.param('id');

  await c.env.DB.prepare('UPDATE contacts SET is_blocked = 0 WHERE user_id = ? AND contact_id = ?')
    .bind(user.id, blockId).run();

  return c.json({ success: true, message: 'User unblocked' });
});

// GET /api/v1/users/blocked
users.get('/blocked', async (c) => {
  const user = c.get('user');

  const blocked = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, c.created_at as blocked_at
     FROM users u JOIN contacts c ON c.contact_id = u.id
     WHERE c.user_id = ? AND c.is_blocked = 1`
  ).bind(user.id).all();

  return c.json({ blocked_users: blocked.results });
});

// PUT /api/v1/users/privacy
users.put('/privacy', zValidator('json', privacySchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');

  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.privacy_last_seen !== undefined) { fields.push('privacy_last_seen = ?'); values.push(body.privacy_last_seen); }
  if (body.privacy_profile_photo !== undefined) { fields.push('privacy_profile_photo = ?'); values.push(body.privacy_profile_photo); }
  if (body.privacy_about !== undefined) { fields.push('privacy_about = ?'); values.push(body.privacy_about); }
  if (body.privacy_status !== undefined) { fields.push('privacy_status = ?'); values.push(body.privacy_status); }
  if (body.privacy_read_receipts !== undefined) { fields.push('privacy_read_receipts = ?'); values.push(body.privacy_read_receipts ? 1 : 0); }
  if (body.privacy_groups !== undefined) { fields.push('privacy_groups = ?'); values.push(body.privacy_groups); }

  if (fields.length > 0) {
    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(user.id);

    await c.env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  return c.json({ success: true });
});

// POST /api/v1/users/keys
users.post('/keys', zValidator('json', z.object({ public_key: z.string() })), async (c) => {
  const user = c.get('user');
  const { public_key } = c.req.valid('json');

  await storePublicKey(c.env, user.id, public_key);

  return c.json({ success: true, message: 'Public key stored' });
});

export default users;
