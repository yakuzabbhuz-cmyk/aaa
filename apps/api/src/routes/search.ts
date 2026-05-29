// ============================================
// DL Chat - Global Search API Routes
// DEATH LEGION Team — Proprietary Software
// ============================================
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';

type AppEnv = { Bindings: Env; Variables: Variables };
const search = new Hono<AppEnv>();
search.use('*', authMiddleware);

// GET /api/v1/search — global search (users, chats, messages, servers, channels)
search.get('/', async (c) => {
  const user = c.get('user');
  const q = c.req.query('q') || '';
  const type = c.req.query('type') || 'all'; // all|users|chats|messages|servers|channels
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);

  if (q.length < 2) {
    return c.json({ results: {}, query: q, type });
  }

  const pattern = `%${q}%`;
  const results: Record<string, unknown[]> = {};

  if (type === 'all' || type === 'users') {
    const users = await c.env.DB.prepare(
      `SELECT id, username, display_name, avatar_url, is_verified, is_bot, bio
       FROM users WHERE (username LIKE ? OR display_name LIKE ?)
       AND is_banned = 0 AND id != ? LIMIT ?`
    ).bind(pattern, pattern, user.id, limit).all();
    results.users = users.results || [];
  }

  if (type === 'all' || type === 'chats') {
    const chats = await c.env.DB.prepare(
      `SELECT c.id, c.name, c.description, c.avatar_url, c.type, c.member_count, c.is_public
       FROM chats c
       JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = ?
       WHERE c.name LIKE ? AND c.type != 'direct'
       LIMIT ?`
    ).bind(user.id, pattern, limit).all();
    results.chats = chats.results || [];
  }

  if (type === 'all' || type === 'messages') {
    const messages = await c.env.DB.prepare(
      `SELECT m.id, m.content, m.created_at, m.chat_id, m.sender_id,
       u.display_name as sender_name, u.avatar_url as sender_avatar,
       c.name as chat_name
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       JOIN chats c ON c.id = m.chat_id
       JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ?
       WHERE m.content LIKE ? AND m.is_deleted = 0 AND m.message_type = 'text'
       ORDER BY m.created_at DESC LIMIT ?`
    ).bind(user.id, pattern, limit).all();
    results.messages = results.messages || [];
    // Highlight match
    results.messages = (messages.results || []).map((m: any) => ({
      ...m,
      highlight: highlightMatch(m.content, q),
    }));
  }

  if (type === 'all' || type === 'servers') {
    const servers = await c.env.DB.prepare(
      `SELECT id, name, description, icon_url, banner_url, member_count, is_verified
       FROM servers WHERE (name LIKE ? OR description LIKE ?) AND is_discoverable = 1
       ORDER BY member_count DESC LIMIT ?`
    ).bind(pattern, pattern, limit).all();
    results.servers = servers.results || [];
  }

  if (type === 'all' || type === 'channels') {
    const channels = await c.env.DB.prepare(
      `SELECT ch.id, ch.name, ch.description, ch.type, ch.server_id,
       s.name as server_name, ch.member_count
       FROM channels ch
       JOIN servers s ON s.id = ch.server_id
       WHERE (ch.name LIKE ? OR ch.description LIKE ?) AND ch.is_private = 0
       LIMIT ?`
    ).bind(pattern, pattern, limit).all();
    results.channels = channels.results || [];
  }

  return c.json({
    query: q,
    type,
    results,
    total: Object.values(results).reduce((a, b) => a + (b as any[]).length, 0),
  });
});

// GET /api/v1/search/messages/:chatId — search within a specific chat
search.get('/messages/:chatId', async (c) => {
  const user = c.get('user');
  const { chatId } = c.req.param();
  const q = c.req.query('q') || '';
  const limit = Math.min(parseInt(c.req.query('limit') || '30'), 50);
  const before = c.req.query('before');

  if (q.length < 1) return c.json({ messages: [] });

  // Verify access
  const member = await c.env.DB.prepare(
    'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(chatId, user.id).first();
  if (!member) throw new HTTPException(403, { message: 'Access denied' });

  let query = `SELECT m.id, m.content, m.message_type, m.created_at, m.sender_id,
   u.display_name as sender_name, u.avatar_url as sender_avatar, u.username as sender_username
   FROM messages m JOIN users u ON u.id = m.sender_id
   WHERE m.chat_id = ? AND m.content LIKE ? AND m.is_deleted = 0`;
  const params: unknown[] = [chatId, `%${q}%`];

  if (before) {
    query += ' AND m.created_at < ?';
    params.push(parseInt(before));
  }

  query += ' ORDER BY m.created_at DESC LIMIT ?';
  params.push(limit);

  const messages = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({
    query: q,
    chat_id: chatId,
    messages: (messages.results || []).map((m: any) => ({
      ...m,
      highlight: highlightMatch(m.content, q),
    })),
  });
});

// GET /api/v1/search/hashtags — search hashtags/topics
search.get('/hashtags', async (c) => {
  const q = c.req.query('q') || '';
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);

  const tags = await c.env.DB.prepare(
    `SELECT tag, COUNT(*) as count FROM message_hashtags
     WHERE tag LIKE ? GROUP BY tag ORDER BY count DESC LIMIT ?`
  ).bind(`%${q}%`, limit).all();

  return c.json({ hashtags: tags.results || [] });
});

// GET /api/v1/search/trending — trending topics/channels/servers
search.get('/trending', async (c) => {
  const [servers, channels] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, name, icon_url, member_count, description FROM servers
       WHERE is_discoverable = 1 ORDER BY member_count DESC LIMIT 10`
    ).all(),
    c.env.DB.prepare(
      `SELECT ch.id, ch.name, ch.type, ch.member_count, s.name as server_name, s.id as server_id
       FROM channels ch JOIN servers s ON s.id = ch.server_id
       WHERE ch.is_private = 0 ORDER BY ch.member_count DESC LIMIT 10`
    ).all(),
  ]);

  return c.json({
    servers: servers.results || [],
    channels: channels.results || [],
  });
});

function highlightMatch(text: string, query: string): string {
  if (!text || !query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

export default search;
