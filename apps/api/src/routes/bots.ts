// ============================================
// DL Chat - Bot API Routes (Telegram-like)
// ============================================
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Env, Variables } from '../types';
import { authMiddleware, botAuthMiddleware } from '../middleware/auth';
import { generateId, generateBotToken } from '../utils/hash';
import { createBotSchema, setBotCommandsSchema } from '../utils/validators';
import { queueBotUpdate, getBotUpdates, acknowledgeUpdates, toBotMessage } from '../services/botApi';
import { botApiRateLimit } from '../middleware/rateLimit';

type AppEnv = { Bindings: Env; Variables: Variables };
const bots = new Hono<AppEnv>();

// Bot management routes (for users creating bots)
const botManagement = new Hono<AppEnv>();
botManagement.use('*', authMiddleware);

// GET /api/v1/bots
botManagement.get('/', async (c) => {
  const user = c.get('user');

  const userBots = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.bot_description, u.created_at,
     (SELECT COUNT(*) FROM bot_server_installs bsi WHERE bsi.bot_id = u.id) as server_install_count
     FROM users u WHERE u.bot_owner_id = ? AND u.is_bot = 1`
  ).bind(user.id).all();

  return c.json({ bots: userBots.results });
});

// POST /api/v1/bots - Create bot (BotFather equivalent)
botManagement.post('/', zValidator('json', createBotSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const now = Date.now();

  // Check username availability
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(body.username).first();
  if (existing) {
    throw new HTTPException(409, { message: 'Username already taken' });
  }

  // Check user's bot limit (max 20 bots per user)
  const botCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users WHERE bot_owner_id = ?').bind(user.id).first<{ count: number }>();
  if ((botCount?.count || 0) >= 20) {
    throw new HTTPException(400, { message: 'Maximum bot limit (20) reached' });
  }

  const botId = generateId();
  const botToken = generateBotToken();
  const clientId = generateId();
  const clientSecret = generateId() + generateId();

  // Create bot user
  await c.env.DB.prepare(
    `INSERT INTO users (id, username, display_name, is_bot, bot_owner_id, bot_token, bot_description, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`
  ).bind(botId, body.username, body.display_name, user.id, botToken, body.bot_description || null, now, now).run();

  // Create bot app record
  const botAppId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO bot_apps (id, bot_id, client_id, client_secret, created_at) VALUES (?, ?, ?, ?, ?)`
  ).bind(botAppId, botId, clientId, clientSecret, now).run();

  return c.json({
    bot: {
      id: botId,
      username: body.username,
      display_name: body.display_name,
      bot_token: botToken,
      client_id: clientId,
      client_secret: clientSecret,
    },
    message: `🤖 Bot @${body.username} created successfully!\n\nUse this token to access the Bot API:\n${botToken}\n\nKeep this token secret!`,
  }, 201);
});

// GET /api/v1/bots/:id
botManagement.get('/:id', async (c) => {
  const user = c.get('user');
  const botId = c.req.param('id');

  const bot = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.bot_description, u.created_at, u.bot_token,
     ba.client_id, ba.webhook_url, ba.is_public, ba.install_count
     FROM users u JOIN bot_apps ba ON ba.bot_id = u.id
     WHERE u.id = ? AND u.bot_owner_id = ?`
  ).bind(botId, user.id).first();

  if (!bot) {
    throw new HTTPException(404, { message: 'Bot not found' });
  }

  return c.json({ bot });
});

// PUT /api/v1/bots/:id
botManagement.put('/:id', async (c) => {
  const user = c.get('user');
  const botId = c.req.param('id');
  const body = await c.req.json<{ display_name?: string; bot_description?: string; avatar_url?: string }>();

  const bot = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? AND bot_owner_id = ?').bind(botId, user.id).first();
  if (!bot) {
    throw new HTTPException(404, { message: 'Bot not found' });
  }

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];

  if (body.display_name) { fields.unshift('display_name = ?'); values.unshift(body.display_name); }
  if (body.bot_description !== undefined) { fields.unshift('bot_description = ?'); values.unshift(body.bot_description); }
  if (body.avatar_url !== undefined) { fields.unshift('avatar_url = ?'); values.unshift(body.avatar_url); }

  values.push(botId);
  await c.env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();

  return c.json({ success: true });
});

// DELETE /api/v1/bots/:id
botManagement.delete('/:id', async (c) => {
  const user = c.get('user');
  const botId = c.req.param('id');

  const bot = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? AND bot_owner_id = ?').bind(botId, user.id).first();
  if (!bot) {
    throw new HTTPException(404, { message: 'Bot not found' });
  }

  // Soft delete
  await c.env.DB.prepare('UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?').bind('Bot deleted by owner', botId).run();

  return c.json({ success: true });
});

// POST /api/v1/bots/:id/token/regenerate
botManagement.post('/:id/token/regenerate', async (c) => {
  const user = c.get('user');
  const botId = c.req.param('id');

  const bot = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? AND bot_owner_id = ?').bind(botId, user.id).first();
  if (!bot) {
    throw new HTTPException(404, { message: 'Bot not found' });
  }

  const newToken = generateBotToken();
  await c.env.DB.prepare('UPDATE users SET bot_token = ? WHERE id = ?').bind(newToken, botId).run();

  return c.json({ bot_token: newToken, message: 'Token regenerated. Update your bot code with the new token.' });
});

// GET /api/v1/bots/:id/commands
botManagement.get('/:id/commands', async (c) => {
  const user = c.get('user');
  const botId = c.req.param('id');

  const commands = await c.env.DB.prepare(
    'SELECT * FROM bot_commands WHERE bot_id = ?'
  ).bind(botId).all();

  return c.json({ commands: commands.results.map((cmd: any) => ({ ...cmd, parameters: JSON.parse(cmd.parameters || '[]') })) });
});

// PUT /api/v1/bots/:id/commands
botManagement.put('/:id/commands', zValidator('json', setBotCommandsSchema), async (c) => {
  const user = c.get('user');
  const botId = c.req.param('id');
  const { commands } = c.req.valid('json');

  const bot = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? AND bot_owner_id = ?').bind(botId, user.id).first();
  if (!bot) {
    throw new HTTPException(404, { message: 'Bot not found' });
  }

  // Replace all commands
  await c.env.DB.prepare('DELETE FROM bot_commands WHERE bot_id = ?').bind(botId).run();

  if (commands.length > 0) {
    const inserts = commands.map(cmd =>
      c.env.DB.prepare(
        'INSERT INTO bot_commands (id, bot_id, command, description, scope, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(generateId(), botId, cmd.command, cmd.description, cmd.scope || 'all', Date.now())
    );
    await c.env.DB.batch(inserts);
  }

  return c.json({ success: true, commands_set: commands.length });
});

// POST /api/v1/bots/:id/webhook
botManagement.post('/:id/webhook', zValidator('json', z.object({ url: z.string().url(), secret: z.string().optional() })), async (c) => {
  const user = c.get('user');
  const botId = c.req.param('id');
  const { url, secret } = c.req.valid('json');

  const bot = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? AND bot_owner_id = ?').bind(botId, user.id).first();
  if (!bot) {
    throw new HTTPException(404, { message: 'Bot not found' });
  }

  await c.env.DB.prepare(
    'UPDATE bot_apps SET webhook_url = ?, webhook_secret = ? WHERE bot_id = ?'
  ).bind(url, secret || null, botId).run();

  return c.json({ success: true, webhook_url: url });
});

// GET /api/v1/bots/:id/updates (long polling)
botManagement.get('/:id/updates', async (c) => {
  const user = c.get('user');
  const botId = c.req.param('id');
  const offset = parseInt(c.req.query('offset') || '0');
  const limit = parseInt(c.req.query('limit') || '100');

  const bot = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? AND bot_owner_id = ?').bind(botId, user.id).first();
  if (!bot) {
    throw new HTTPException(404, { message: 'Bot not found' });
  }

  const updates = await getBotUpdates(c.env, botId, offset, limit);

  // Auto-acknowledge
  if (updates.length > 0) {
    const maxId = Math.max(...updates.map(u => u.update_id));
    await acknowledgeUpdates(c.env, botId, maxId);
  }

  return c.json({ ok: true, result: updates });
});

// POST /api/v1/bots/:id/messages - Send message via bot
botManagement.post('/:id/messages', async (c) => {
  const user = c.get('user');
  const botId = c.req.param('id');
  const body = await c.req.json();

  const bot = await c.env.DB.prepare('SELECT id, bot_token FROM users WHERE id = ? AND bot_owner_id = ?').bind(botId, user.id).first<any>();
  if (!bot) {
    throw new HTTPException(404, { message: 'Bot not found' });
  }

  // Forward to bot API
  return c.json({ success: true });
});

// GET /api/v1/bots/:id/stats
botManagement.get('/:id/stats', async (c) => {
  const user = c.get('user');
  const botId = c.req.param('id');

  const stats = await c.env.DB.prepare(
    `SELECT 
      (SELECT COUNT(*) FROM bot_server_installs WHERE bot_id = ?) as server_installs,
      (SELECT COUNT(*) FROM bot_oauth_tokens WHERE bot_id = ?) as authorized_users,
      (SELECT COUNT(*) FROM messages WHERE sender_id = ? AND created_at > ?) as messages_today`
  ).bind(botId, botId, botId, Date.now() - 86400000).first();

  return c.json({ stats });
});

// ============================================
// Telegram-like Bot API (token in X-Bot-Token header)
// ============================================
const botApi = new Hono<AppEnv>();
botApi.use('*', botAuthMiddleware, botApiRateLimit);

// POST /bot/getMe
botApi.post('/getMe', async (c) => {
  const bot = c.get('user');
  const fullBot = await c.env.DB.prepare(
    'SELECT id, username, display_name, avatar_url, is_bot FROM users WHERE id = ?'
  ).bind(bot.id).first<any>();

  return c.json({
    ok: true,
    result: {
      id: fullBot.id,
      is_bot: true,
      first_name: fullBot.display_name,
      username: fullBot.username,
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
    }
  });
});

// POST /bot/sendMessage
botApi.post('/sendMessage', async (c) => {
  const bot = c.get('user');
  const body = await c.req.json<{
    chat_id: string;
    text: string;
    parse_mode?: string;
    reply_to_message_id?: string;
    reply_markup?: unknown;
    disable_notification?: boolean;
  }>();

  if (!body.chat_id || !body.text) {
    return c.json({ ok: false, description: 'chat_id and text required' }, 400);
  }

  // Check if bot is member of chat
  const isMember = await c.env.DB.prepare(
    'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(body.chat_id, bot.id).first();

  if (!isMember) {
    return c.json({ ok: false, description: 'Bot is not a member of this chat' }, 403);
  }

  const now = Date.now();
  const msgId = generateId();

  await c.env.DB.prepare(
    `INSERT INTO messages (id, chat_id, sender_id, type, content, reply_to_id, is_silent, inline_keyboard, created_at)
     VALUES (?, ?, ?, 'text', ?, ?, ?, ?, ?)`
  ).bind(
    msgId, body.chat_id, bot.id, body.text, body.reply_to_message_id || null,
    body.disable_notification ? 1 : 0,
    body.reply_markup ? JSON.stringify(body.reply_markup) : null,
    now
  ).run();

  await c.env.DB.prepare('UPDATE chats SET last_message_at = ?, total_messages = total_messages + 1 WHERE id = ?')
    .bind(now, body.chat_id).run();

  const msg = await c.env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(msgId).first<any>();

  return c.json({
    ok: true,
    result: toBotMessage(msg, { id: body.chat_id, type: 'supergroup' }, { id: bot.id, display_name: (await c.env.DB.prepare('SELECT display_name FROM users WHERE id = ?').bind(bot.id).first<any>())?.display_name, is_bot: 1 }),
  });
});

// POST /bot/sendPhoto
botApi.post('/sendPhoto', async (c) => {
  const bot = c.get('user');
  const body = await c.req.json<{ chat_id: string; photo: string; caption?: string }>();

  if (!body.chat_id || !body.photo) {
    return c.json({ ok: false, description: 'chat_id and photo required' }, 400);
  }

  const now = Date.now();
  const msgId = generateId();

  await c.env.DB.prepare(
    `INSERT INTO messages (id, chat_id, sender_id, type, content, media_url, media_mime_type, created_at)
     VALUES (?, ?, ?, 'image', ?, ?, 'image/jpeg', ?)`
  ).bind(msgId, body.chat_id, bot.id, body.caption || null, body.photo, now).run();

  await c.env.DB.prepare('UPDATE chats SET last_message_at = ? WHERE id = ?').bind(now, body.chat_id).run();

  return c.json({ ok: true, result: { message_id: msgId } });
});

// POST /bot/editMessageText
botApi.post('/editMessageText', async (c) => {
  const bot = c.get('user');
  const body = await c.req.json<{ chat_id: string; message_id: string; text: string }>();

  const now = Date.now();
  await c.env.DB.prepare(
    'UPDATE messages SET content = ?, is_edited = 1, edited_at = ? WHERE id = ? AND sender_id = ? AND chat_id = ?'
  ).bind(body.text, now, body.message_id, bot.id, body.chat_id).run();

  return c.json({ ok: true, result: true });
});

// POST /bot/deleteMessage
botApi.post('/deleteMessage', async (c) => {
  const bot = c.get('user');
  const body = await c.req.json<{ chat_id: string; message_id: string }>();

  await c.env.DB.prepare(
    'UPDATE messages SET is_deleted = 1, deleted_for_everyone = 1, deleted_at = ? WHERE id = ? AND sender_id = ?'
  ).bind(Date.now(), body.message_id, bot.id).run();

  return c.json({ ok: true, result: true });
});

// POST /bot/setWebhook
botApi.post('/setWebhook', async (c) => {
  const bot = c.get('user');
  const body = await c.req.json<{ url: string; secret_token?: string }>();

  if (!body.url) {
    return c.json({ ok: false, description: 'url required' }, 400);
  }

  await c.env.DB.prepare(
    'UPDATE bot_apps SET webhook_url = ?, webhook_secret = ? WHERE bot_id = ?'
  ).bind(body.url, body.secret_token || null, bot.id).run();

  return c.json({ ok: true, description: 'Webhook was set' });
});

// POST /bot/getUpdates
botApi.post('/getUpdates', async (c) => {
  const bot = c.get('user');
  const body = await c.req.json<{ offset?: number; limit?: number }>().catch(() => ({}));

  const updates = await getBotUpdates(c.env, bot.id, body.offset || 0, body.limit || 100);

  if (updates.length > 0) {
    const maxId = Math.max(...updates.map(u => u.update_id));
    await acknowledgeUpdates(c.env, bot.id, maxId);
  }

  return c.json({ ok: true, result: updates });
});

// POST /bot/setMyCommands
botApi.post('/setMyCommands', async (c) => {
  const bot = c.get('user');
  const body = await c.req.json<{ commands: Array<{ command: string; description: string }> }>();

  if (!body.commands) {
    return c.json({ ok: false, description: 'commands required' }, 400);
  }

  await c.env.DB.prepare('DELETE FROM bot_commands WHERE bot_id = ?').bind(bot.id).run();

  const now = Date.now();
  if (body.commands.length > 0) {
    const inserts = body.commands.map(cmd =>
      c.env.DB.prepare(
        'INSERT INTO bot_commands (id, bot_id, command, description, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(generateId(), bot.id, cmd.command, cmd.description, now)
    );
    await c.env.DB.batch(inserts);
  }

  return c.json({ ok: true, result: true });
});

// POST /bot/sendPoll
botApi.post('/sendPoll', async (c) => {
  const bot = c.get('user');
  const body = await c.req.json<{
    chat_id: string;
    question: string;
    options: string[];
    is_anonymous?: boolean;
    type?: string;
    allows_multiple_answers?: boolean;
  }>();

  if (!body.chat_id || !body.question || !body.options?.length) {
    return c.json({ ok: false, description: 'chat_id, question, and options required' }, 400);
  }

  const now = Date.now();
  const msgId = generateId();
  const pollId = generateId();

  await c.env.DB.prepare(
    `INSERT INTO messages (id, chat_id, sender_id, type, content, created_at) VALUES (?, ?, ?, 'poll', ?, ?)`
  ).bind(msgId, body.chat_id, bot.id, body.question, now).run();

  await c.env.DB.prepare(
    `INSERT INTO polls (id, message_id, question, is_anonymous, is_quiz, multiple_answers, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(pollId, msgId, body.question, body.is_anonymous !== false ? 1 : 0, body.type === 'quiz' ? 1 : 0, body.allows_multiple_answers ? 1 : 0, now).run();

  const optInserts = body.options.map((opt, i) =>
    c.env.DB.prepare('INSERT INTO poll_options (id, poll_id, text, position) VALUES (?, ?, ?, ?)').bind(generateId(), pollId, opt, i)
  );
  await c.env.DB.batch(optInserts);

  return c.json({ ok: true, result: { message_id: msgId } });
});

// POST /bot/answerCallbackQuery
botApi.post('/answerCallbackQuery', async (c) => {
  return c.json({ ok: true, result: true });
});

// POST /bot/sendVoice
botApi.post('/sendVoice', async (c) => {
  const bot = c.get('user');
  const body = await c.req.json<{ chat_id: string; voice: string; caption?: string; duration?: number }>();

  if (!body.chat_id || !body.voice) {
    return c.json({ ok: false, description: 'chat_id and voice required' }, 400);
  }

  const now = Date.now();
  const msgId = generateId();

  await c.env.DB.prepare(
    `INSERT INTO messages (id, chat_id, sender_id, type, media_url, media_duration, media_mime_type, content, created_at)
     VALUES (?, ?, ?, 'voice', ?, ?, 'audio/ogg', ?, ?)`
  ).bind(msgId, body.chat_id, bot.id, body.voice, body.duration || null, body.caption || null, now).run();

  return c.json({ ok: true, result: { message_id: msgId } });
});

// POST /bot/sendSticker
botApi.post('/sendSticker', async (c) => {
  const bot = c.get('user');
  const body = await c.req.json<{ chat_id: string; sticker: string }>();

  if (!body.chat_id || !body.sticker) {
    return c.json({ ok: false, description: 'chat_id and sticker required' }, 400);
  }

  const now = Date.now();
  const msgId = generateId();

  await c.env.DB.prepare(
    `INSERT INTO messages (id, chat_id, sender_id, type, media_url, created_at) VALUES (?, ?, ?, 'sticker', ?, ?)`
  ).bind(msgId, body.chat_id, bot.id, body.sticker, now).run();

  return c.json({ ok: true, result: { message_id: msgId } });
});

// POST /bot/sendLocation
botApi.post('/sendLocation', async (c) => {
  const bot = c.get('user');
  const body = await c.req.json<{ chat_id: string; latitude: number; longitude: number }>();

  if (!body.chat_id) {
    return c.json({ ok: false, description: 'chat_id required' }, 400);
  }

  const now = Date.now();
  const msgId = generateId();
  const locationContent = JSON.stringify({ latitude: body.latitude, longitude: body.longitude });

  await c.env.DB.prepare(
    `INSERT INTO messages (id, chat_id, sender_id, type, content, created_at) VALUES (?, ?, ?, 'location', ?, ?)`
  ).bind(msgId, body.chat_id, bot.id, locationContent, now).run();

  return c.json({ ok: true, result: { message_id: msgId } });
});

// POST /bot/sendDocument
botApi.post('/sendDocument', async (c) => {
  const bot = c.get('user');
  const body = await c.req.json<{ chat_id: string; document: string; caption?: string }>();

  const now = Date.now();
  const msgId = generateId();

  await c.env.DB.prepare(
    `INSERT INTO messages (id, chat_id, sender_id, type, media_url, content, created_at) VALUES (?, ?, ?, 'document', ?, ?, ?)`
  ).bind(msgId, body.chat_id, bot.id, body.document, body.caption || null, now).run();

  return c.json({ ok: true, result: { message_id: msgId } });
});

// POST /bot/sendAudio
botApi.post('/sendAudio', async (c) => {
  const bot = c.get('user');
  const body = await c.req.json<{ chat_id: string; audio: string; caption?: string; duration?: number }>();

  const now = Date.now();
  const msgId = generateId();

  await c.env.DB.prepare(
    `INSERT INTO messages (id, chat_id, sender_id, type, media_url, media_duration, content, media_mime_type, created_at)
     VALUES (?, ?, ?, 'audio', ?, ?, ?, 'audio/mpeg', ?)`
  ).bind(msgId, body.chat_id, bot.id, body.audio, body.duration || null, body.caption || null, now).run();

  return c.json({ ok: true, result: { message_id: msgId } });
});

// POST /bot/sendVideo
botApi.post('/sendVideo', async (c) => {
  const bot = c.get('user');
  const body = await c.req.json<{ chat_id: string; video: string; caption?: string; duration?: number; width?: number; height?: number }>();

  const now = Date.now();
  const msgId = generateId();

  await c.env.DB.prepare(
    `INSERT INTO messages (id, chat_id, sender_id, type, media_url, media_duration, media_width, media_height, content, media_mime_type, created_at)
     VALUES (?, ?, ?, 'video', ?, ?, ?, ?, ?, 'video/mp4', ?)`
  ).bind(msgId, body.chat_id, bot.id, body.video, body.duration || null, body.width || null, body.height || null, body.caption || null, now).run();

  return c.json({ ok: true, result: { message_id: msgId } });
});

// Mount routes
bots.route('/', botManagement);

export { botApi };
export default bots;
