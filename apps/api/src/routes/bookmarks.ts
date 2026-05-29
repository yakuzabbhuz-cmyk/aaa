// ============================================
// DL Chat - Bookmarks / Saved Messages API
// DEATH LEGION Team
// ============================================

import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';

type AppEnv = { Bindings: Env; Variables: Variables };
const bookmarks = new Hono<AppEnv>();

bookmarks.use('*', authMiddleware);

// GET /bookmarks - Get all bookmarks (with optional folder/tag filter)
bookmarks.get('/', async (c) => {
  const userId = c.get('userId');
  const { folder, tag, q, limit = '50', cursor } = c.req.query();
  const limitNum = Math.min(parseInt(limit), 100);

  let query = `
    SELECT b.*, m.content, m.type, m.created_at as message_created_at,
           u.username as sender_username, u.display_name as sender_name,
           ch.name as chat_name, ch.type as chat_type
    FROM bookmarks b
    JOIN messages m ON b.message_id = m.id
    JOIN users u ON m.sender_id = u.id
    JOIN chats ch ON m.chat_id = ch.id
    WHERE b.user_id = ?
  `;
  const params: any[] = [userId];

  if (folder) { query += ' AND b.folder = ?'; params.push(folder); }
  if (tag) { query += ' AND b.tags LIKE ?'; params.push(`%${tag}%`); }
  if (q) { query += ' AND (m.content LIKE ? OR b.note LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  if (cursor) { query += ' AND b.id < ?'; params.push(cursor); }

  query += ' ORDER BY b.saved_at DESC LIMIT ?';
  params.push(limitNum + 1);

  const rows = await c.env.DB.prepare(query).bind(...params).all();
  const items = rows.results as any[];
  const hasMore = items.length > limitNum;
  if (hasMore) items.pop();

  return c.json({
    success: true,
    bookmarks: items.map(b => ({ ...b, tags: JSON.parse(b.tags || '[]') })),
    hasMore,
    nextCursor: hasMore ? items[items.length - 1].id : null
  });
});

// GET /bookmarks/folders - Get bookmark folders
bookmarks.get('/folders', async (c) => {
  const userId = c.get('userId');
  
  const folders = await c.env.DB.prepare(`
    SELECT folder, COUNT(*) as count
    FROM bookmarks
    WHERE user_id = ? AND folder IS NOT NULL
    GROUP BY folder
    ORDER BY count DESC
  `).bind(userId).all();

  return c.json({ success: true, folders: folders.results });
});

// POST /bookmarks - Save a message
bookmarks.post('/', async (c) => {
  const userId = c.get('userId');
  const { messageId, note, folder, tags = [] } = await c.req.json();

  if (!messageId) return c.json({ error: 'messageId required' }, 400);

  // Verify message exists and user has access
  const message = await c.env.DB.prepare(`
    SELECT m.id FROM messages m
    JOIN chat_members cm ON m.chat_id = cm.chat_id
    WHERE m.id = ? AND cm.user_id = ? AND cm.left_at IS NULL
  `).bind(messageId, userId).first();
  
  if (!message) return c.json({ error: 'Message not found or no access' }, 404);

  // Check if already bookmarked
  const existing = await c.env.DB.prepare(
    'SELECT id FROM bookmarks WHERE user_id = ? AND message_id = ?'
  ).bind(userId, messageId).first();
  
  if (existing) return c.json({ error: 'Already bookmarked' }, 409);

  // Limit 1000 bookmarks per user
  const count = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM bookmarks WHERE user_id = ?').bind(userId).first();
  if ((count?.cnt as number) >= 1000) {
    return c.json({ error: 'Bookmark limit reached (1000 max)' }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  await c.env.DB.prepare(`
    INSERT INTO bookmarks (id, user_id, message_id, note, folder, tags, saved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, userId, messageId, note || null, folder || null, JSON.stringify(tags), now).run();

  return c.json({ success: true, id, message: 'Message bookmarked' }, 201);
});

// PATCH /bookmarks/:id - Update bookmark (note, folder, tags)
bookmarks.patch('/:id', async (c) => {
  const { id } = c.req.param();
  const userId = c.get('userId');
  const updates = await c.req.json();

  const bookmark = await c.env.DB.prepare(
    'SELECT * FROM bookmarks WHERE id = ? AND user_id = ?'
  ).bind(id, userId).first();
  
  if (!bookmark) return c.json({ error: 'Bookmark not found' }, 404);

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.note !== undefined) { fields.push('note = ?'); values.push(updates.note); }
  if (updates.folder !== undefined) { fields.push('folder = ?'); values.push(updates.folder); }
  if (updates.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(updates.tags)); }

  if (fields.length === 0) return c.json({ error: 'No updates provided' }, 400);

  values.push(id, userId);
  await c.env.DB.prepare(`UPDATE bookmarks SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).bind(...values).run();

  return c.json({ success: true });
});

// DELETE /bookmarks/:id - Remove bookmark
bookmarks.delete('/:id', async (c) => {
  const { id } = c.req.param();
  const userId = c.get('userId');

  await c.env.DB.prepare('DELETE FROM bookmarks WHERE id = ? AND user_id = ?').bind(id, userId).run();
  return c.json({ success: true });
});

// DELETE /bookmarks - Clear all bookmarks (or by folder)
bookmarks.delete('/', async (c) => {
  const userId = c.get('userId');
  const { folder } = c.req.query();

  if (folder) {
    await c.env.DB.prepare('DELETE FROM bookmarks WHERE user_id = ? AND folder = ?').bind(userId, folder).run();
  } else {
    await c.env.DB.prepare('DELETE FROM bookmarks WHERE user_id = ?').bind(userId).run();
  }

  return c.json({ success: true });
});

export default bookmarks;
