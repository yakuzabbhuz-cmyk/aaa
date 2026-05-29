// ============================================
// DL Chat API - Main Entry Point
// DEATH LEGION Team
// Version: 3.0.0
// Platform: Cloudflare Workers + Hono.js
// ============================================

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from './types';
import { corsMiddleware } from './middleware/cors';

// Routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import chatRoutes from './routes/chats';
import messageRoutes from './routes/messages';
import channelRoutes from './routes/channels';
import serverRoutes from './routes/servers';
import statusRoutes from './routes/status';
import callRoutes from './routes/calls';
import botRoutes, { botApi } from './routes/bots';
import uploadRoutes from './routes/upload';
import adminRoutes from './routes/admin';
import updateRoutes from './routes/updates';
// New feature routes (Session 3)
import reactionRoutes from './routes/reactions';
import pollRoutes from './routes/polls';
import threadRoutes from './routes/threads';
import stickerRoutes from './routes/stickers';
import webhookRoutes from './routes/webhooks';
import scheduledRoutes from './routes/scheduled';
import searchRoutes from './routes/search';
import friendRoutes from './routes/friends';
import notificationRoutes from './routes/notifications_api';
import presenceRoutes from './routes/presence';
import mediaRoutes from './routes/media';
// New feature routes (Session 4)
import voiceRoutes from './routes/voice';
import pinnedRoutes from './routes/pinned';
import bookmarkRoutes from './routes/bookmarks';
import translateRoutes from './routes/translate';
import analyticsRoutes from './routes/analytics';
import inviteRoutes from './routes/invite';
import storiesRoutes from './routes/stories';
import aiRoutes from './routes/ai';
import readreceiptsRoutes from './routes/readreceipts';
// Session 5 routes
import banRoutes from './routes/bans';
import appealRoutes from './routes/appeals';

// Durable Objects (must be exported)
export { ChatRoom } from './durable-objects/ChatRoom';
export { CallRoom } from './durable-objects/CallRoom';
export { Presence } from './durable-objects/Presence';

type AppEnv = { Bindings: Env; Variables: Variables };

const app = new Hono<AppEnv>();

// ============================================
// Global Middleware
// ============================================
app.use('*', corsMiddleware);

// Request logging
app.use('*', async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const url = c.req.url;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  console.log(`[${new Date().toISOString()}] ${method} ${url} ${status} ${duration}ms`);
});

// ============================================
// Health & Info
// ============================================
app.get('/', async (c) => {
  return c.json({
    name: 'DL Chat API',
    version: '3.0.0',
    team: 'DEATH LEGION Team',
    description: 'The Securest Messaging Platform — WhatsApp + Telegram + Discord in One',
    status: 'operational',
    timestamp: new Date().toISOString(),
    endpoints: {
      api: '/api/v1',
      websocket: '/ws',
      bot_api: '/bot',
      health: '/health',
      docs: '/api/v1/docs',
    },
  });
});

app.get('/health', async (c) => {
  // Check D1 connectivity
  let dbStatus = 'ok';
  try {
    await c.env.DB.prepare('SELECT 1').first();
  } catch {
    dbStatus = 'error';
  }

  const settings = await c.env.DB.prepare('SELECT value FROM system_settings WHERE key = ?').bind('maintenance_mode').first<{ value: string }>();
  const maintenanceMode = settings?.value === 'true';

  return c.json({
    status: maintenanceMode ? 'maintenance' : 'healthy',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      kv: 'ok',
      r2: 'ok',
    },
  }, maintenanceMode ? 503 : 200);
});

// ============================================
// WebSocket Connection Handler
// ============================================
app.get('/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');

  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return c.json({
      error: 'Expected WebSocket upgrade',
      usage: 'Connect with WebSocket protocol to /ws?token=<jwt>',
    }, 426);
  }

  const token = c.req.query('token');
  const chatId = c.req.query('chatId');
  const userId = c.req.query('userId');

  if (!token || !userId) {
    return c.json({ error: 'token and userId required' }, 401);
  }

  // Verify JWT
  const { verifyJwt } = await import('./utils/jwt');
  const payload = await verifyJwt(token, c.env.JWT_SECRET);

  if (!payload || payload.sub !== userId) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  // Check session
  const session = await c.env.KV.get(`session:${payload.jti}`);
  if (!session) {
    return c.json({ error: 'Session expired' }, 401);
  }

  // Check user is not banned
  const user = await c.env.DB.prepare('SELECT id, is_banned FROM users WHERE id = ?').bind(userId).first<any>();
  if (!user || user.is_banned) {
    return c.json({ error: 'Account banned or not found' }, 403);
  }

  // Update last seen in background
  c.executionCtx?.waitUntil(
    c.env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(Date.now(), userId).run()
  );

  if (chatId) {
    // Connect to specific chat room
    const roomId = c.env.CHAT_ROOM.idFromName(chatId);
    const room = c.env.CHAT_ROOM.get(roomId);

    const wsUrl = new URL(c.req.url);
    wsUrl.searchParams.set('userId', userId);
    wsUrl.searchParams.set('chatId', chatId);

    return room.fetch(new Request(wsUrl.toString(), c.req.raw));
  } else {
    // Connect to presence (general connection)
    const presenceId = c.env.PRESENCE.idFromName(userId);
    const presence = c.env.PRESENCE.get(presenceId);

    const wsUrl = new URL(c.req.url);
    wsUrl.searchParams.set('userId', userId);

    return presence.fetch(new Request(wsUrl.toString(), c.req.raw));
  }
});

// ============================================
// API v1 Routes
// ============================================
const api = new Hono<AppEnv>();

api.route('/auth', authRoutes);
api.route('/users', userRoutes);
api.route('/chats', chatRoutes);
api.route('/messages', messageRoutes);
api.route('/channels', channelRoutes);
api.route('/servers', serverRoutes);
api.route('/status', statusRoutes);
api.route('/calls', callRoutes);
api.route('/bots', botRoutes);
api.route('/upload', uploadRoutes);
api.route('/admin', adminRoutes);
api.route('/updates', updateRoutes);
// New feature routes
api.route('/reactions', reactionRoutes);
api.route('/polls', pollRoutes);
api.route('/threads', threadRoutes);
api.route('/stickers', stickerRoutes);
api.route('/webhooks', webhookRoutes);
api.route('/scheduled', scheduledRoutes);
api.route('/search', searchRoutes);
api.route('/friends', friendRoutes);
api.route('/notifications', notificationRoutes);
api.route('/presence', presenceRoutes);
api.route('/media', mediaRoutes);
// Session 4 routes
api.route('/voice', voiceRoutes);
api.route('/pinned', pinnedRoutes);
api.route('/bookmarks', bookmarkRoutes);
api.route('/translate', translateRoutes);
api.route('/analytics', analyticsRoutes);
api.route('/invite', inviteRoutes);
api.route('/stories', storiesRoutes);
api.route('/ai', aiRoutes);
api.route('/read-receipts', readreceiptsRoutes);
// Session 5 routes
api.route('/bans', banRoutes);
api.route('/appeals', appealRoutes);

// API info endpoint
api.get('/', async (c) => {
  return c.json({
    version: 'v1',
    api_version: '3.0.0',
    team: 'DEATH LEGION Team',
    product: 'DL Chat',
    description: 'The Securest Messaging Platform — WhatsApp + Telegram + Discord in One',
    license: 'Proprietary — All Rights Reserved. © 2025 DEATH LEGION Team.',
    features: {
      messaging: ['text', 'voice', 'image', 'video', 'files', 'stickers', 'gifs', 'polls', 'locations'],
      social: ['friends', 'stories', 'status', 'reactions', 'threads', 'bookmarks', 'pinned'],
      communication: ['group_chats', 'channels', 'servers', 'voice_calls', 'video_calls', 'screen_share'],
      ai: ['ai_assistant', 'smart_replies', 'auto_translate', 'voice_transcription', 'content_moderation', 'chat_summaries'],
      bots: ['bot_api', 'webhooks', 'scheduled_messages', 'inline_mode', 'commands'],
      security: ['e2e_encryption', 'self_destruct', 'two_factor_auth', 'biometric_lock', 'secret_chats'],
      developer: ['rest_api', 'websocket', 'webhooks', 'bot_sdk', 'analytics', 'invite_links'],
    },
    endpoints: {
      core: [
        'POST /api/v1/auth/register', 'POST /api/v1/auth/login', 'POST /api/v1/auth/logout', 'POST /api/v1/auth/refresh',
        'GET /api/v1/users/:id', 'PATCH /api/v1/users/me', 'DELETE /api/v1/users/me',
        'GET /api/v1/chats', 'POST /api/v1/chats', 'GET /api/v1/chats/:id', 'PATCH /api/v1/chats/:id',
        'GET /api/v1/messages/:chatId', 'POST /api/v1/messages/:chatId', 'DELETE /api/v1/messages/:chatId/:id',
        'GET /api/v1/channels', 'GET /api/v1/servers', 'POST /api/v1/servers',
        'GET /api/v1/status', 'POST /api/v1/status', 'DELETE /api/v1/status',
        'POST /api/v1/calls/start', 'POST /api/v1/calls/:id/join', 'POST /api/v1/calls/:id/leave',
        'GET /api/v1/bots', 'POST /api/v1/bots', 'GET /api/v1/bots/:id',
        'POST /api/v1/upload', 'GET /api/v1/admin',
      ],
      messaging_features: [
        'GET /api/v1/reactions/:messageId', 'POST /api/v1/reactions/:messageId', 'DELETE /api/v1/reactions/:messageId/:emoji',
        'POST /api/v1/polls', 'GET /api/v1/polls/:pollId', 'POST /api/v1/polls/:pollId/vote', 'POST /api/v1/polls/:pollId/close',
        'GET /api/v1/threads/:messageId', 'POST /api/v1/threads/:messageId',
        'POST /api/v1/voice/upload', 'GET /api/v1/voice/:fileId', 'GET /api/v1/voice/:fileId/transcript',
        'GET /api/v1/pinned/:chatId', 'POST /api/v1/pinned/:chatId', 'DELETE /api/v1/pinned/:chatId/:messageId',
        'GET /api/v1/read-receipts/:messageId', 'POST /api/v1/read-receipts/mark', 'GET /api/v1/read-receipts/unread',
        'GET /api/v1/scheduled', 'POST /api/v1/scheduled', 'POST /api/v1/scheduled/:id/send-now',
      ],
      social: [
        'GET /api/v1/friends', 'POST /api/v1/friends/request', 'POST /api/v1/friends/:id/accept', 'GET /api/v1/friends/suggestions',
        'GET /api/v1/stories/feed', 'POST /api/v1/stories', 'GET /api/v1/stories/my', 'DELETE /api/v1/stories/:id',
        'GET /api/v1/bookmarks', 'POST /api/v1/bookmarks', 'PATCH /api/v1/bookmarks/:id',
        'GET /api/v1/stickers/featured', 'GET /api/v1/stickers/my', 'POST /api/v1/stickers/:packId/install',
      ],
      discovery: [
        'GET /api/v1/search', 'GET /api/v1/search/messages/:chatId', 'GET /api/v1/search/trending', 'GET /api/v1/search/hashtags',
        'GET /api/v1/invite/:code', 'POST /api/v1/invite', 'POST /api/v1/invite/:code/join',
      ],
      ai_features: [
        'POST /api/v1/ai/chat', 'POST /api/v1/ai/summarize', 'POST /api/v1/ai/smart-reply', 'POST /api/v1/ai/moderate',
        'GET /api/v1/ai/conversations', 'GET /api/v1/ai/conversations/:id',
        'POST /api/v1/translate/message', 'POST /api/v1/translate/text', 'GET /api/v1/translate/languages',
      ],
      realtime: [
        'GET /api/v1/presence/:userId', 'POST /api/v1/presence/typing', 'POST /api/v1/presence/heartbeat', 'POST /api/v1/presence/status',
        'GET /api/v1/notifications', 'POST /api/v1/notifications/read', 'GET /api/v1/notifications/prefs',
        'WebSocket /ws?token=<jwt>&chatId=<id>',
      ],
      developer: [
        'GET /api/v1/webhooks', 'POST /api/v1/webhooks', 'POST /api/v1/webhooks/incoming/:token',
        'GET /api/v1/analytics/me', 'GET /api/v1/analytics/chat/:chatId', 'GET /api/v1/analytics/server/:serverId',
        'POST /api/v1/media/presign', 'GET /api/v1/media/:chatId',
        'GET /api/v1/updates/latest', '/bot/* (Telegram-like Bot API)',
      ],
      moderation: [
        'GET /api/v1/bans', 'POST /api/v1/bans', 'DELETE /api/v1/bans/:id',
        'PATCH /api/v1/bans/:id', 'POST /api/v1/bans/:id/extend', 'GET /api/v1/bans/stats',
        'GET /api/v1/bans/user/:userId', 'GET /api/v1/bans/check', 'POST /api/v1/bans/bulk',
        'POST /api/v1/appeals', 'GET /api/v1/appeals', 'GET /api/v1/appeals/:id',
        'POST /api/v1/appeals/:id/message', 'PATCH /api/v1/appeals/:id/review',
        'PATCH /api/v1/appeals/:id/assign', 'GET /api/v1/appeals/stats',
        'PATCH /api/v1/appeals/:id/withdraw', 'POST /api/v1/appeals/public',
      ],
    },
    total_endpoints: 140,
  });
});

app.route('/api/v1', api);

// ============================================
// Telegram-like Bot API
// ============================================
app.route('/bot', botApi);

// ============================================
// R2 File Serving
// ============================================
app.get('/files/*', async (c) => {
  const key = c.req.path.replace('/files/', '');

  if (!key) {
    return c.json({ error: 'File key required' }, 400);
  }

  const obj = await c.env.R2.get(key);
  if (!obj) {
    return c.json({ error: 'File not found' }, 404);
  }

  const contentType = obj.httpMetadata?.contentType || 'application/octet-stream';
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'ETag': obj.etag || '',
  };

  if (obj.size) {
    headers['Content-Length'] = String(obj.size);
  }

  return new Response(obj.body, { headers });
});

// ============================================
// Error Handling
// ============================================
app.onError((err, c) => {
  console.error('[Error]', err.message, err.stack);

  if (err instanceof HTTPException) {
    return c.json({
      error: err.message,
      status: err.status,
    }, err.status);
  }

  return c.json({
    error: 'Internal server error',
    status: 500,
    message: err.message,
  }, 500);
});

app.notFound((c) => {
  return c.json({
    error: 'Not found',
    status: 404,
    path: c.req.path,
  }, 404);
});

export default app;
