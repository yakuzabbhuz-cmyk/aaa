// ============================================
// DL Chat - Sticker Packs API Routes
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
const stickers = new Hono<AppEnv>();
stickers.use('*', authMiddleware);

const createPackSchema = z.object({
  name: z.string().min(1).max(64),
  title: z.string().min(1).max(128),
  description: z.string().max(300).optional(),
  is_animated: z.boolean().default(false),
  is_video: z.boolean().default(false),
});

const addStickerSchema = z.object({
  file_url: z.string().url(),
  thumbnail_url: z.string().url().optional(),
  emoji: z.string().min(1).max(10),
  file_size: z.number().int().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  is_animated: z.boolean().default(false),
});

// GET /api/v1/stickers/featured — featured sticker packs
stickers.get('/featured', async (c) => {
  const packs = await c.env.DB.prepare(
    `SELECT sp.*, u.display_name as creator_name, u.username as creator_username,
     (SELECT COUNT(*) FROM stickers s WHERE s.pack_id = sp.id) as sticker_count,
     (SELECT COUNT(*) FROM user_sticker_packs usp WHERE usp.pack_id = sp.id) as install_count
     FROM sticker_packs sp JOIN users u ON u.id = sp.creator_id
     WHERE sp.is_official = 1 AND sp.is_published = 1
     ORDER BY install_count DESC LIMIT 20`
  ).all();

  return c.json({ packs: packs.results || [] });
});

// GET /api/v1/stickers/search — search sticker packs
stickers.get('/search', async (c) => {
  const q = c.req.query('q') || '';
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);

  if (q.length < 2) return c.json({ packs: [] });

  const packs = await c.env.DB.prepare(
    `SELECT sp.*, u.display_name as creator_name,
     (SELECT COUNT(*) FROM stickers s WHERE s.pack_id = sp.id) as sticker_count,
     (SELECT COUNT(*) FROM user_sticker_packs usp WHERE usp.pack_id = sp.id) as install_count
     FROM sticker_packs sp JOIN users u ON u.id = sp.creator_id
     WHERE sp.is_published = 1 AND (sp.name LIKE ? OR sp.title LIKE ?)
     ORDER BY install_count DESC LIMIT ?`
  ).bind(`%${q}%`, `%${q}%`, limit).all();

  return c.json({ packs: packs.results || [] });
});

// GET /api/v1/stickers/my — user's installed sticker packs
stickers.get('/my', async (c) => {
  const user = c.get('user');

  const packs = await c.env.DB.prepare(
    `SELECT sp.*, usp.installed_at,
     (SELECT COUNT(*) FROM stickers s WHERE s.pack_id = sp.id) as sticker_count
     FROM user_sticker_packs usp
     JOIN sticker_packs sp ON sp.id = usp.pack_id
     WHERE usp.user_id = ? ORDER BY usp.installed_at DESC`
  ).bind(user.id).all();

  return c.json({ packs: packs.results || [] });
});

// GET /api/v1/stickers/recent — user's recently used stickers
stickers.get('/recent', async (c) => {
  const user = c.get('user');

  const recent = await c.env.DB.prepare(
    `SELECT s.*, sp.name as pack_name, sp.title as pack_title, rus.last_used_at
     FROM recent_user_stickers rus
     JOIN stickers s ON s.id = rus.sticker_id
     JOIN sticker_packs sp ON sp.id = s.pack_id
     WHERE rus.user_id = ? ORDER BY rus.last_used_at DESC LIMIT 24`
  ).bind(user.id).all();

  return c.json({ stickers: recent.results || [] });
});

// GET /api/v1/stickers/:packId — get a sticker pack with all stickers
stickers.get('/:packId', async (c) => {
  const { packId } = c.req.param();

  const pack = await c.env.DB.prepare(
    `SELECT sp.*, u.display_name as creator_name, u.username as creator_username,
     (SELECT COUNT(*) FROM user_sticker_packs usp WHERE usp.pack_id = sp.id) as install_count
     FROM sticker_packs sp JOIN users u ON u.id = sp.creator_id WHERE sp.id = ?`
  ).first<any>(packId);

  if (!pack) throw new HTTPException(404, { message: 'Sticker pack not found' });

  const stickers = await c.env.DB.prepare(
    'SELECT * FROM stickers WHERE pack_id = ? ORDER BY position ASC'
  ).bind(packId).all();

  return c.json({ ...pack, stickers: stickers.results || [] });
});

// POST /api/v1/stickers — create sticker pack
stickers.post('/', zValidator('json', createPackSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');

  // Check name uniqueness
  const existing = await c.env.DB.prepare('SELECT id FROM sticker_packs WHERE name = ?').bind(body.name).first();
  if (existing) throw new HTTPException(409, { message: 'Pack name already exists' });

  const id = generateId();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO sticker_packs (id, creator_id, name, title, description, is_animated, is_video, is_official, is_published, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`
  ).bind(id, user.id, body.name, body.title, body.description ?? null, body.is_animated ? 1 : 0, body.is_video ? 1 : 0, now).run();

  return c.json({ id, name: body.name, title: body.title, created_at: now }, 201);
});

// POST /api/v1/stickers/:packId/stickers — add sticker to pack
stickers.post('/:packId/stickers', zValidator('json', addStickerSchema), async (c) => {
  const { packId } = c.req.param();
  const user = c.get('user');
  const body = c.req.valid('json');

  const pack = await c.env.DB.prepare(
    'SELECT * FROM sticker_packs WHERE id = ? AND creator_id = ?'
  ).bind(packId, user.id).first<any>();

  if (!pack) throw new HTTPException(404, { message: 'Pack not found or not owned by you' });

  // Max 120 stickers per pack
  const count = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM stickers WHERE pack_id = ?'
  ).bind(packId).first<{ cnt: number }>();

  if ((count?.cnt || 0) >= 120) {
    throw new HTTPException(400, { message: 'Pack is full (max 120 stickers)' });
  }

  const id = generateId();
  const position = (count?.cnt || 0) + 1;
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO stickers (id, pack_id, file_url, thumbnail_url, emoji, file_size, width, height, is_animated, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, packId, body.file_url, body.thumbnail_url ?? null,
    body.emoji, body.file_size ?? null, body.width ?? null, body.height ?? null,
    body.is_animated ? 1 : 0, position, now
  ).run();

  return c.json({ id, pack_id: packId, emoji: body.emoji, position, created_at: now }, 201);
});

// POST /api/v1/stickers/:packId/install — install a sticker pack
stickers.post('/:packId/install', async (c) => {
  const { packId } = c.req.param();
  const user = c.get('user');

  const pack = await c.env.DB.prepare('SELECT id FROM sticker_packs WHERE id = ? AND is_published = 1').bind(packId).first();
  if (!pack) throw new HTTPException(404, { message: 'Sticker pack not found' });

  const existing = await c.env.DB.prepare(
    'SELECT 1 FROM user_sticker_packs WHERE user_id = ? AND pack_id = ?'
  ).bind(user.id, packId).first();

  if (existing) return c.json({ success: true, already_installed: true });

  await c.env.DB.prepare(
    'INSERT INTO user_sticker_packs (user_id, pack_id, installed_at) VALUES (?, ?, ?)'
  ).bind(user.id, packId, Date.now()).run();

  return c.json({ success: true, installed: true });
});

// DELETE /api/v1/stickers/:packId/install — uninstall a sticker pack
stickers.delete('/:packId/install', async (c) => {
  const { packId } = c.req.param();
  const user = c.get('user');

  await c.env.DB.prepare(
    'DELETE FROM user_sticker_packs WHERE user_id = ? AND pack_id = ?'
  ).bind(user.id, packId).run();

  return c.json({ success: true });
});

// POST /api/v1/stickers/:stickerId/use — track sticker usage
stickers.post('/:stickerId/use', async (c) => {
  const { stickerId } = c.req.param();
  const user = c.get('user');
  const now = Date.now();

  // Upsert recent sticker
  await c.env.DB.prepare(
    `INSERT INTO recent_user_stickers (user_id, sticker_id, last_used_at, use_count)
     VALUES (?, ?, ?, 1)
     ON CONFLICT (user_id, sticker_id) DO UPDATE SET last_used_at = ?, use_count = use_count + 1`
  ).bind(user.id, stickerId, now, now).run();

  // Keep only last 50 recent stickers
  await c.env.DB.prepare(
    `DELETE FROM recent_user_stickers WHERE user_id = ? AND sticker_id NOT IN (
     SELECT sticker_id FROM recent_user_stickers WHERE user_id = ? ORDER BY last_used_at DESC LIMIT 50
     )`
  ).bind(user.id, user.id).run();

  return c.json({ success: true });
});

export default stickers;
