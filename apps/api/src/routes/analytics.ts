// ============================================
// DL Chat - Analytics API
// DEATH LEGION Team
// ============================================

import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';

type AppEnv = { Bindings: Env; Variables: Variables };
const analytics = new Hono<AppEnv>();

analytics.use('*', authMiddleware);

// GET /analytics/me - Personal usage stats
analytics.get('/me', async (c) => {
  const userId = c.get('userId');

  const [messages, chats, mediaShared, voiceMinutes, pollsCreated, reactionsGiven] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM messages WHERE sender_id = ? AND deleted_at IS NULL').bind(userId).first(),
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM chat_members WHERE user_id = ? AND left_at IS NULL').bind(userId).first(),
    c.env.DB.prepare("SELECT COUNT(*) as cnt FROM messages WHERE sender_id = ? AND type IN ('image','video','audio','document')").bind(userId).first(),
    c.env.DB.prepare('SELECT COALESCE(SUM(duration), 0) as total FROM voice_messages WHERE sender_id = ?').bind(userId).first(),
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM polls WHERE created_by = ?').bind(userId).first(),
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM message_reactions WHERE user_id = ?').bind(userId).first(),
  ]);

  // Messages by day (last 7 days)
  const weeklyActivity = await c.env.DB.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM messages
    WHERE sender_id = ? AND created_at >= datetime('now', '-7 days')
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).bind(userId).all();

  // Top chats by message count
  const topChats = await c.env.DB.prepare(`
    SELECT ch.id, ch.name, ch.type, COUNT(m.id) as message_count
    FROM messages m
    JOIN chats ch ON m.chat_id = ch.id
    WHERE m.sender_id = ?
    GROUP BY ch.id
    ORDER BY message_count DESC
    LIMIT 5
  `).bind(userId).all();

  // Most used reactions
  const topReactions = await c.env.DB.prepare(`
    SELECT emoji, COUNT(*) as count
    FROM message_reactions
    WHERE user_id = ?
    GROUP BY emoji
    ORDER BY count DESC
    LIMIT 10
  `).bind(userId).all();

  return c.json({
    success: true,
    stats: {
      totalMessages: (messages?.cnt as number) || 0,
      activeChats: (chats?.cnt as number) || 0,
      mediaShared: (mediaShared?.cnt as number) || 0,
      voiceMinutes: Math.round(((voiceMinutes?.total as number) || 0) / 60),
      pollsCreated: (pollsCreated?.cnt as number) || 0,
      reactionsGiven: (reactionsGiven?.cnt as number) || 0,
    },
    weeklyActivity: weeklyActivity.results,
    topChats: topChats.results,
    topReactions: topReactions.results
  });
});

// GET /analytics/chat/:chatId - Chat analytics
analytics.get('/chat/:chatId', async (c) => {
  const { chatId } = c.req.param();
  const userId = c.get('userId');

  // Verify access
  const member = await c.env.DB.prepare(
    'SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NULL'
  ).bind(chatId, userId).first();
  
  if (!member) return c.json({ error: 'Access denied' }, 403);

  const [totalMessages, activeMembers, mediaCount, totalReactions] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM messages WHERE chat_id = ? AND deleted_at IS NULL').bind(chatId).first(),
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM chat_members WHERE chat_id = ? AND left_at IS NULL').bind(chatId).first(),
    c.env.DB.prepare("SELECT COUNT(*) as cnt FROM messages WHERE chat_id = ? AND type != 'text'").bind(chatId).first(),
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM message_reactions mr JOIN messages m ON mr.message_id = m.id WHERE m.chat_id = ?').bind(chatId).first(),
  ]);

  // Message activity last 30 days
  const activity = await c.env.DB.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM messages
    WHERE chat_id = ? AND created_at >= datetime('now', '-30 days')
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).bind(chatId).all();

  // Top senders
  const topSenders = await c.env.DB.prepare(`
    SELECT u.username, u.display_name, u.avatar_url, COUNT(m.id) as message_count
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.chat_id = ? AND m.deleted_at IS NULL
    GROUP BY m.sender_id
    ORDER BY message_count DESC
    LIMIT 10
  `).bind(chatId).all();

  // Message types breakdown
  const typeBreakdown = await c.env.DB.prepare(`
    SELECT type, COUNT(*) as count
    FROM messages
    WHERE chat_id = ? AND deleted_at IS NULL
    GROUP BY type
    ORDER BY count DESC
  `).bind(chatId).all();

  // Peak activity hours
  const peakHours = await c.env.DB.prepare(`
    SELECT strftime('%H', created_at) as hour, COUNT(*) as count
    FROM messages
    WHERE chat_id = ? AND created_at >= datetime('now', '-7 days')
    GROUP BY hour
    ORDER BY hour ASC
  `).bind(chatId).all();

  return c.json({
    success: true,
    overview: {
      totalMessages: (totalMessages?.cnt as number) || 0,
      activeMembers: (activeMembers?.cnt as number) || 0,
      mediaCount: (mediaCount?.cnt as number) || 0,
      totalReactions: (totalReactions?.cnt as number) || 0,
    },
    activity: activity.results,
    topSenders: topSenders.results,
    typeBreakdown: typeBreakdown.results,
    peakHours: peakHours.results
  });
});

// GET /analytics/server/:serverId - Server analytics (admin only)
analytics.get('/server/:serverId', async (c) => {
  const { serverId } = c.req.param();
  const userId = c.get('userId');

  const member = await c.env.DB.prepare(
    `SELECT role FROM server_members WHERE server_id = ? AND user_id = ? AND role IN ('admin','moderator')`
  ).bind(serverId, userId).first();
  
  if (!member) return c.json({ error: 'Admin access required' }, 403);

  const [totalMembers, totalChannels, totalMessages, onlineNow] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM server_members WHERE server_id = ? AND left_at IS NULL').bind(serverId).first(),
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM channels WHERE server_id = ?').bind(serverId).first(),
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM messages m JOIN channels ch ON m.chat_id = ch.id WHERE ch.server_id = ? AND m.deleted_at IS NULL').bind(serverId).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM server_members WHERE server_id = ? AND last_seen >= datetime('now', '-5 minutes')`).bind(serverId).first(),
  ]);

  // Growth over time (member joins)
  const memberGrowth = await c.env.DB.prepare(`
    SELECT DATE(joined_at) as date, COUNT(*) as joins
    FROM server_members
    WHERE server_id = ? AND joined_at >= datetime('now', '-30 days')
    GROUP BY DATE(joined_at)
    ORDER BY date ASC
  `).bind(serverId).all();

  return c.json({
    success: true,
    overview: {
      totalMembers: (totalMembers?.cnt as number) || 0,
      totalChannels: (totalChannels?.cnt as number) || 0,
      totalMessages: (totalMessages?.cnt as number) || 0,
      onlineNow: (onlineNow?.cnt as number) || 0,
    },
    memberGrowth: memberGrowth.results
  });
});

export default analytics;
