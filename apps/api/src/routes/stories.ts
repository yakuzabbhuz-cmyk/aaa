// ============================================
// DL Chat - Stories / Status API (like WhatsApp/Instagram)
// DEATH LEGION Team
// ============================================

import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';

type AppEnv = { Bindings: Env; Variables: Variables };
const stories = new Hono<AppEnv>();

stories.use('*', authMiddleware);

const STORY_DURATION_HOURS = 24;

// GET /stories/feed - Get stories from contacts
stories.get('/feed', async (c) => {
  const userId = c.get('userId');

  // Get stories from friends and contacts
  const feed = await c.env.DB.prepare(`
    SELECT s.*, u.username, u.display_name, u.avatar_url,
           SUM(CASE WHEN sv.viewer_id = ? THEN 1 ELSE 0 END) as viewed_by_me,
           COUNT(sv.id) as view_count
    FROM stories s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN story_views sv ON s.id = sv.story_id
    WHERE s.expires_at > datetime('now')
      AND s.deleted_at IS NULL
      AND (
        s.user_id = ?
        OR s.user_id IN (
          SELECT CASE WHEN user_id = ? THEN friend_id ELSE user_id END
          FROM friendships WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'
        )
      )
    GROUP BY s.id, u.id
    ORDER BY s.user_id = ? DESC, s.created_at DESC
  `).bind(userId, userId, userId, userId, userId, userId).all();

  // Group by user
  const grouped: Record<string, any> = {};
  for (const story of feed.results as any[]) {
    if (!grouped[story.user_id]) {
      grouped[story.user_id] = {
        user: { id: story.user_id, username: story.username, displayName: story.display_name, avatar: story.avatar_url },
        stories: [],
        hasUnviewed: false
      };
    }
    grouped[story.user_id].stories.push({
      id: story.id,
      type: story.type,
      content: story.content,
      mediaUrl: story.media_url,
      duration: story.duration,
      viewCount: story.view_count,
      viewedByMe: story.viewed_by_me > 0,
      createdAt: story.created_at,
      expiresAt: story.expires_at,
      backgroundColor: story.background_color,
      textStyle: story.text_style
    });
    if (!story.viewed_by_me) grouped[story.user_id].hasUnviewed = true;
  }

  const result = Object.values(grouped);
  // Sort: own story first, then unviewed, then viewed
  result.sort((a: any, b: any) => {
    if (a.user.id === userId) return -1;
    if (b.user.id === userId) return 1;
    if (a.hasUnviewed && !b.hasUnviewed) return -1;
    if (!a.hasUnviewed && b.hasUnviewed) return 1;
    return 0;
  });

  return c.json({ success: true, feed: result, count: result.length });
});

// GET /stories/my - Get my stories
stories.get('/my', async (c) => {
  const userId = c.get('userId');

  const myStories = await c.env.DB.prepare(`
    SELECT s.*, COUNT(sv.id) as view_count
    FROM stories s
    LEFT JOIN story_views sv ON s.id = sv.story_id
    WHERE s.user_id = ? AND s.deleted_at IS NULL
    GROUP BY s.id
    ORDER BY s.created_at DESC
    LIMIT 20
  `).bind(userId).all();

  return c.json({ success: true, stories: myStories.results });
});

// POST /stories - Create a story
stories.post('/', async (c) => {
  const userId = c.get('userId');
  const { type, content, mediaUrl, duration = 5, backgroundColor, textStyle, audience = 'contacts' } = await c.req.json();

  if (!type) return c.json({ error: 'type required (text|image|video)' }, 400);

  // Check daily limit (30 stories per day)
  const todayCount = await c.env.DB.prepare(`
    SELECT COUNT(*) as cnt FROM stories
    WHERE user_id = ? AND created_at >= datetime('now', '-24 hours')
  `).bind(userId).first();
  
  if ((todayCount?.cnt as number) >= 30) {
    return c.json({ error: 'Daily story limit reached (30)' }, 429);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + STORY_DURATION_HOURS * 3600 * 1000).toISOString();

  await c.env.DB.prepare(`
    INSERT INTO stories (id, user_id, type, content, media_url, duration, background_color, text_style, audience, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, userId, type, content || null, mediaUrl || null, duration, backgroundColor || null, textStyle || null, audience, now, expiresAt).run();

  return c.json({ success: true, id, expiresAt, message: 'Story posted!' }, 201);
});

// GET /stories/:storyId - View a story
stories.get('/:storyId', async (c) => {
  const { storyId } = c.req.param();
  const userId = c.get('userId');

  const story = await c.env.DB.prepare(`
    SELECT s.*, u.username, u.display_name, u.avatar_url
    FROM stories s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND s.expires_at > datetime('now') AND s.deleted_at IS NULL
  `).bind(storyId).first();

  if (!story) return c.json({ error: 'Story not found or expired' }, 404);

  // Record view (if not own story)
  if (story.user_id !== userId) {
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO story_views (id, story_id, viewer_id, viewed_at)
      VALUES (?, ?, ?, datetime('now'))
    `).bind(crypto.randomUUID(), storyId, userId).run().catch(() => {});
  }

  return c.json({ success: true, story });
});

// GET /stories/:storyId/views - Get story viewers (own stories only)
stories.get('/:storyId/views', async (c) => {
  const { storyId } = c.req.param();
  const userId = c.get('userId');

  const story = await c.env.DB.prepare('SELECT user_id FROM stories WHERE id = ?').bind(storyId).first();
  if (!story || story.user_id !== userId) return c.json({ error: 'Not your story' }, 403);

  const viewers = await c.env.DB.prepare(`
    SELECT sv.*, u.username, u.display_name, u.avatar_url
    FROM story_views sv
    JOIN users u ON sv.viewer_id = u.id
    WHERE sv.story_id = ?
    ORDER BY sv.viewed_at DESC
    LIMIT 100
  `).bind(storyId).all();

  return c.json({ success: true, viewers: viewers.results, count: viewers.results.length });
});

// DELETE /stories/:storyId - Delete a story
stories.delete('/:storyId', async (c) => {
  const { storyId } = c.req.param();
  const userId = c.get('userId');

  const story = await c.env.DB.prepare('SELECT user_id FROM stories WHERE id = ?').bind(storyId).first();
  if (!story || story.user_id !== userId) return c.json({ error: 'Not found or not authorized' }, 404);

  await c.env.DB.prepare("UPDATE stories SET deleted_at = datetime('now') WHERE id = ?").bind(storyId).run();
  return c.json({ success: true });
});

// POST /stories/:storyId/react - React to a story
stories.post('/:storyId/react', async (c) => {
  const { storyId } = c.req.param();
  const userId = c.get('userId');
  const { emoji } = await c.req.json();

  if (!emoji) return c.json({ error: 'emoji required' }, 400);

  const story = await c.env.DB.prepare('SELECT user_id FROM stories WHERE id = ? AND expires_at > datetime("now")').bind(storyId).first();
  if (!story) return c.json({ error: 'Story not found' }, 404);

  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO story_reactions (id, story_id, user_id, emoji, reacted_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).bind(crypto.randomUUID(), storyId, userId, emoji).run();

  return c.json({ success: true, emoji });
});

export default stories;
