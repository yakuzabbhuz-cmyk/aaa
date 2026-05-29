// ============================================
// DL Chat - Message Routes
// ============================================
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { generateId } from '../utils/hash';
import { sendMessageSchema } from '../utils/validators';
import { analyzeMessage, applyModerationAction } from '../services/aiModeration';
import { sendNewMessageNotification } from '../services/notifications';

type AppEnv = { Bindings: Env; Variables: Variables };
const messages = new Hono<AppEnv>();

messages.use('*', authMiddleware);

// Helper: broadcast message to Durable Object
async function broadcastToChat(env: Env, chatId: string, event: Record<string, unknown>): Promise<void> {
  try {
    const id = env.CHAT_ROOM.idFromName(chatId);
    const room = env.CHAT_ROOM.get(id);
    await room.fetch('https://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
  } catch (e) {
    console.error('[Messages] Failed to broadcast:', e);
  }
}

// GET /api/v1/messages/:chatId
messages.get('/:chatId', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('chatId');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const before = c.req.query('before'); // message ID for cursor pagination
  const after = c.req.query('after');

  // Verify membership
  const member = await c.env.DB.prepare(
    'SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ? AND role != ?'
  ).bind(chatId, user.id, 'banned').first();

  const chat = await c.env.DB.prepare('SELECT is_public FROM chats WHERE id = ?').bind(chatId).first<any>();

  if (!member && !chat?.is_public) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  let query: string;
  let params: unknown[];

  if (before) {
    const pivot = await c.env.DB.prepare('SELECT created_at FROM messages WHERE id = ?').bind(before).first<any>();
    query = `SELECT m.*, u.display_name as sender_name, u.avatar_url as sender_avatar, u.username as sender_username,
     u.is_verified as sender_verified, u.is_bot as sender_is_bot
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.chat_id = ? AND m.is_scheduled = 0 AND m.created_at < ?
     ORDER BY m.created_at DESC LIMIT ?`;
    params = [chatId, pivot?.created_at || Date.now(), limit];
  } else if (after) {
    const pivot = await c.env.DB.prepare('SELECT created_at FROM messages WHERE id = ?').bind(after).first<any>();
    query = `SELECT m.*, u.display_name as sender_name, u.avatar_url as sender_avatar, u.username as sender_username,
     u.is_verified as sender_verified, u.is_bot as sender_is_bot
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.chat_id = ? AND m.is_scheduled = 0 AND m.created_at > ?
     ORDER BY m.created_at ASC LIMIT ?`;
    params = [chatId, pivot?.created_at || 0, limit];
  } else {
    query = `SELECT m.*, u.display_name as sender_name, u.avatar_url as sender_avatar, u.username as sender_username,
     u.is_verified as sender_verified, u.is_bot as sender_is_bot
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.chat_id = ? AND m.is_scheduled = 0
     ORDER BY m.created_at DESC LIMIT ?`;
    params = [chatId, limit];
  }

  const result = await c.env.DB.prepare(query).bind(...params).all();
  const messageList = result.results as any[];

  // Fetch reply-to messages
  const replyIds = [...new Set(messageList.filter(m => m.reply_to_id).map(m => m.reply_to_id))];
  const replyMap: Record<string, any> = {};

  if (replyIds.length > 0) {
    const placeholders = replyIds.map(() => '?').join(',');
    const replies = await c.env.DB.prepare(
      `SELECT m.id, m.type, m.content, m.media_url, m.sender_id, u.display_name as sender_name
       FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id IN (${placeholders})`
    ).bind(...replyIds).all();
    replies.results.forEach((r: any) => { replyMap[r.id] = r; });
  }

  // Parse JSON fields and add reply-to
  const parsed = messageList.map(m => ({
    ...m,
    reactions: m.reactions ? JSON.parse(m.reactions) : {},
    mention_ids: m.mention_ids ? JSON.parse(m.mention_ids) : [],
    edit_history: m.edit_history ? JSON.parse(m.edit_history) : [],
    inline_keyboard: m.inline_keyboard ? JSON.parse(m.inline_keyboard) : null,
    reply_to: m.reply_to_id ? replyMap[m.reply_to_id] : null,
  }));

  return c.json({
    messages: before ? parsed : parsed.reverse(),
    has_more: messageList.length === limit,
  });
});

// POST /api/v1/messages/:chatId - Send message
messages.post('/:chatId', zValidator('json', sendMessageSchema), async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('chatId');
  const body = c.req.valid('json');
  const now = Date.now();

  // Verify membership and permissions
  const member = await c.env.DB.prepare(
    'SELECT role, can_send_messages, can_send_media, can_send_polls FROM chat_members WHERE chat_id = ? AND user_id = ? AND role != ?'
  ).bind(chatId, user.id, 'banned').first<any>();

  const chat = await c.env.DB.prepare('SELECT id, type, slow_mode_seconds, is_announcement_only, server_id FROM chats WHERE id = ? AND is_deleted = 0').bind(chatId).first<any>();

  if (!chat) {
    throw new HTTPException(404, { message: 'Chat not found' });
  }

  if (!member) {
    throw new HTTPException(403, { message: 'Not a member of this chat' });
  }

  if (!member.can_send_messages && !['owner', 'admin', 'moderator'].includes(member.role)) {
    throw new HTTPException(403, { message: 'You cannot send messages in this chat' });
  }

  if (chat.is_announcement_only && !['owner', 'admin'].includes(member.role)) {
    throw new HTTPException(403, { message: 'Only admins can send messages in this channel' });
  }

  // Media permission check
  if (['image', 'video', 'audio', 'voice', 'document', 'gif', 'sticker'].includes(body.type)) {
    if (!member.can_send_media && !['owner', 'admin'].includes(member.role)) {
      throw new HTTPException(403, { message: 'You cannot send media in this chat' });
    }
  }

  // Slow mode check
  if (chat.slow_mode_seconds > 0 && !['owner', 'admin'].includes(member.role)) {
    const lastMessage = await c.env.DB.prepare(
      'SELECT created_at FROM messages WHERE chat_id = ? AND sender_id = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(chatId, user.id).first<any>();

    if (lastMessage && (now - lastMessage.created_at) < chat.slow_mode_seconds * 1000) {
      const remaining = Math.ceil((chat.slow_mode_seconds * 1000 - (now - lastMessage.created_at)) / 1000);
      throw new HTTPException(429, { message: `Slow mode: wait ${remaining} seconds` });
    }
  }

  const messageId = generateId();

  // Handle scheduled messages
  if (body.is_scheduled && body.scheduled_at) {
    await c.env.DB.prepare(
      `INSERT INTO messages (id, chat_id, sender_id, type, content, media_url, media_mime_type, media_size,
       media_duration, media_width, media_height, reply_to_id, thread_id, mention_ids, is_silent,
       is_scheduled, scheduled_at, inline_keyboard, is_view_once, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
    ).bind(
      messageId, chatId, user.id, body.type, body.content || null, body.media_url || null,
      body.media_mime_type || null, body.media_size || null, body.media_duration || null,
      body.media_width || null, body.media_height || null, body.reply_to_id || null,
      body.thread_id || null, JSON.stringify(body.mention_ids || []),
      body.is_silent ? 1 : 0, body.scheduled_at,
      body.inline_keyboard ? JSON.stringify(body.inline_keyboard) : null,
      body.is_view_once ? 1 : 0, now
    ).run();

    return c.json({ message: { id: messageId, is_scheduled: true, scheduled_at: body.scheduled_at } }, 201);
  }

  // Handle disappearing message timer
  const chatInfo = await c.env.DB.prepare('SELECT disappearing_messages_timer FROM chats WHERE id = ?').bind(chatId).first<any>();
  const disappearsAt = chatInfo?.disappearing_messages_timer > 0
    ? now + chatInfo.disappearing_messages_timer * 1000
    : null;

  // Insert message
  await c.env.DB.prepare(
    `INSERT INTO messages (id, chat_id, sender_id, type, content, media_url, media_thumbnail, media_mime_type,
     media_size, media_duration, media_width, media_height, reply_to_id, thread_id, mention_ids,
     is_silent, is_view_once, inline_keyboard, disappears_at, is_encrypted, created_at, server_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).bind(
    messageId, chatId, user.id, body.type, body.content || null, body.media_url || null,
    null, body.media_mime_type || null, body.media_size || null, body.media_duration || null,
    body.media_width || null, body.media_height || null, body.reply_to_id || null,
    body.thread_id || null, JSON.stringify(body.mention_ids || []),
    body.is_silent ? 1 : 0, body.is_view_once ? 1 : 0,
    body.inline_keyboard ? JSON.stringify(body.inline_keyboard) : null,
    disappearsAt, now, chat.server_id || null
  ).run();

  // Handle polls
  if (body.type === 'poll' && body.poll) {
    const pollId = generateId();
    await c.env.DB.prepare(
      `INSERT INTO polls (id, message_id, question, is_anonymous, is_quiz, correct_option_index, explanation,
       multiple_answers, time_limit_seconds, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      pollId, messageId, body.poll.question,
      body.poll.is_anonymous !== false ? 1 : 0,
      body.poll.is_quiz ? 1 : 0,
      body.poll.correct_option_index ?? null,
      body.poll.explanation || null,
      body.poll.multiple_answers ? 1 : 0,
      body.poll.time_limit_seconds || null,
      body.poll.expires_at || null,
      now
    ).run();

    const optionInserts = body.poll.options.map((opt: string, i: number) =>
      c.env.DB.prepare(
        'INSERT INTO poll_options (id, poll_id, text, position) VALUES (?, ?, ?, ?)'
      ).bind(generateId(), pollId, opt, i)
    );
    await c.env.DB.batch(optionInserts);
  }

  // Update chat stats
  await c.env.DB.prepare(
    'UPDATE chats SET last_message_at = ?, total_messages = total_messages + 1, updated_at = ? WHERE id = ?'
  ).bind(now, now, chatId).run();

  // Get full message with sender info
  const fullMessage = await c.env.DB.prepare(
    `SELECT m.*, u.display_name as sender_name, u.avatar_url as sender_avatar, u.username as sender_username,
     u.is_verified as sender_verified, u.is_bot as sender_is_bot
     FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`
  ).bind(messageId).first<any>();

  if (fullMessage) {
    fullMessage.reactions = {};
    fullMessage.mention_ids = body.mention_ids || [];

    // Broadcast via Durable Object
    await broadcastToChat(c.env, chatId, { type: 'new_message', message: fullMessage });

    // AI Moderation (async, don't block response)
    if (body.type === 'text' && body.content) {
      c.executionCtx?.waitUntil(
        analyzeMessage(c.env, messageId, user.id, body.content).then(async (result) => {
          if (result.shouldBan || result.shouldDelete) {
            await applyModerationAction(c.env, result, messageId, user.id, chatId);
            if (result.shouldDelete) {
              await broadcastToChat(c.env, chatId, { type: 'message_deleted', messageId, chatId });
            }
          }
        }).catch(console.error)
      );
    }

    // Send push notifications to other members (async)
    c.executionCtx?.waitUntil(
      (async () => {
        const memberIds = await c.env.DB.prepare(
          `SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ? AND notifications_enabled = 1 AND role != 'banned'`
        ).bind(chatId, user.id).all<{ user_id: string }>();

        const preview = body.content?.slice(0, 100) || `[${body.type}]`;
        await Promise.all(
          memberIds.results.map(m =>
            sendNewMessageNotification(c.env, m.user_id, user.display_name, fullMessage.name || null, preview, chatId, messageId)
          )
        );
      })()
    );
  }

  return c.json({
    message: {
      ...fullMessage,
      reactions: {},
      mention_ids: body.mention_ids || [],
    }
  }, 201);
});

// PUT /api/v1/messages/:chatId/:msgId - Edit message
messages.put('/:chatId/:msgId', zValidator('json', z.object({ content: z.string().min(1).max(65536) })), async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('chatId');
  const msgId = c.req.param('msgId');
  const { content } = c.req.valid('json');
  const now = Date.now();

  const message = await c.env.DB.prepare(
    'SELECT id, sender_id, type, content, edit_history, chat_id FROM messages WHERE id = ? AND chat_id = ? AND is_deleted = 0'
  ).bind(msgId, chatId).first<any>();

  if (!message) {
    throw new HTTPException(404, { message: 'Message not found' });
  }

  if (message.sender_id !== user.id) {
    throw new HTTPException(403, { message: 'Can only edit your own messages' });
  }

  if (message.type !== 'text') {
    throw new HTTPException(400, { message: 'Can only edit text messages' });
  }

  const editHistory = message.edit_history ? JSON.parse(message.edit_history) : [];
  editHistory.push({ content: message.content, edited_at: now });

  await c.env.DB.prepare(
    'UPDATE messages SET content = ?, is_edited = 1, edited_at = ?, edit_history = ? WHERE id = ?'
  ).bind(content, now, JSON.stringify(editHistory), msgId).run();

  const updated = await c.env.DB.prepare(
    `SELECT m.*, u.display_name as sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`
  ).bind(msgId).first();

  await broadcastToChat(c.env, chatId, { type: 'message_edited', message: updated });

  return c.json({ message: updated });
});

// DELETE /api/v1/messages/:chatId/:msgId
messages.delete('/:chatId/:msgId', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('chatId');
  const msgId = c.req.param('msgId');
  const deleteForEveryone = c.req.query('for_everyone') === 'true';
  const now = Date.now();

  const message = await c.env.DB.prepare(
    'SELECT id, sender_id, chat_id FROM messages WHERE id = ? AND chat_id = ? AND is_deleted = 0'
  ).bind(msgId, chatId).first<any>();

  if (!message) {
    throw new HTTPException(404, { message: 'Message not found' });
  }

  const isSender = message.sender_id === user.id;
  const member = await c.env.DB.prepare(
    'SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(chatId, user.id).first<any>();

  const isAdmin = member && ['owner', 'admin', 'moderator'].includes(member.role);

  if (!isSender && !isAdmin) {
    throw new HTTPException(403, { message: 'Not authorized to delete this message' });
  }

  if (deleteForEveryone && (isSender || isAdmin)) {
    await c.env.DB.prepare(
      'UPDATE messages SET is_deleted = 1, deleted_for_everyone = 1, deleted_at = ? WHERE id = ?'
    ).bind(now, msgId).run();
  } else {
    await c.env.DB.prepare(
      'UPDATE messages SET is_deleted = 1, deleted_at = ? WHERE id = ?'
    ).bind(now, msgId).run();
  }

  await broadcastToChat(c.env, chatId, { type: 'message_deleted', messageId: msgId, chatId });

  return c.json({ success: true });
});

// POST /api/v1/messages/:chatId/:msgId/react
messages.post('/:chatId/:msgId/react', zValidator('json', z.object({ emoji: z.string().max(10) })), async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('chatId');
  const msgId = c.req.param('msgId');
  const { emoji } = c.req.valid('json');

  const message = await c.env.DB.prepare(
    'SELECT id, reactions FROM messages WHERE id = ? AND chat_id = ? AND is_deleted = 0'
  ).bind(msgId, chatId).first<any>();

  if (!message) {
    throw new HTTPException(404, { message: 'Message not found' });
  }

  const reactions: Record<string, string[]> = message.reactions ? JSON.parse(message.reactions) : {};

  if (!reactions[emoji]) {
    reactions[emoji] = [];
  }

  const userIndex = reactions[emoji].indexOf(user.id);
  if (userIndex > -1) {
    // Remove reaction (toggle)
    reactions[emoji].splice(userIndex, 1);
    if (reactions[emoji].length === 0) {
      delete reactions[emoji];
    }
  } else {
    reactions[emoji].push(user.id);
  }

  await c.env.DB.prepare('UPDATE messages SET reactions = ? WHERE id = ?')
    .bind(JSON.stringify(reactions), msgId).run();

  await broadcastToChat(c.env, chatId, { type: 'reaction', messageId: msgId, chatId, reactions });

  return c.json({ reactions });
});

// POST /api/v1/messages/:chatId/:msgId/forward
messages.post('/:chatId/:msgId/forward', zValidator('json', z.object({ target_chat_ids: z.array(z.string()).min(1).max(10) })), async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('chatId');
  const msgId = c.req.param('msgId');
  const { target_chat_ids } = c.req.valid('json');
  const now = Date.now();

  const original = await c.env.DB.prepare(
    'SELECT id, type, content, media_url, media_mime_type, media_size, media_duration, media_width, media_height FROM messages WHERE id = ? AND is_deleted = 0'
  ).bind(msgId).first<any>();

  if (!original) {
    throw new HTTPException(404, { message: 'Message not found' });
  }

  const forwardedIds: string[] = [];

  for (const targetChatId of target_chat_ids) {
    const isMember = await c.env.DB.prepare(
      'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ? AND role != ?'
    ).bind(targetChatId, user.id, 'banned').first();

    if (!isMember) continue;

    const newId = generateId();
    await c.env.DB.prepare(
      `INSERT INTO messages (id, chat_id, sender_id, type, content, media_url, media_mime_type, media_size,
       media_duration, media_width, media_height, forwarded_from_id, forwarded_from_chat_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      newId, targetChatId, user.id, original.type, original.content, original.media_url,
      original.media_mime_type, original.media_size, original.media_duration,
      original.media_width, original.media_height, original.id, chatId, now
    ).run();

    await c.env.DB.prepare('UPDATE chats SET last_message_at = ?, total_messages = total_messages + 1 WHERE id = ?')
      .bind(now, targetChatId).run();

    forwardedIds.push(newId);
    await broadcastToChat(c.env, targetChatId, { type: 'new_message', message: { id: newId } });
  }

  return c.json({ success: true, forwarded_to: target_chat_ids.length, message_ids: forwardedIds });
});

// POST /api/v1/messages/:chatId/:msgId/pin
messages.post('/:chatId/:msgId/pin', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('chatId');
  const msgId = c.req.param('msgId');
  const now = Date.now();

  const member = await c.env.DB.prepare(
    'SELECT role, can_pin_messages FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(chatId, user.id).first<any>();

  if (!member || (!member.can_pin_messages && !['owner', 'admin', 'moderator'].includes(member.role))) {
    throw new HTTPException(403, { message: 'Not authorized to pin messages' });
  }

  await c.env.DB.prepare('UPDATE messages SET is_pinned = 1 WHERE id = ? AND chat_id = ?').bind(msgId, chatId).run();

  await c.env.DB.prepare(
    'INSERT OR REPLACE INTO pinned_messages (chat_id, message_id, pinned_by, pinned_at) VALUES (?, ?, ?, ?)'
  ).bind(chatId, msgId, user.id, now).run();

  await broadcastToChat(c.env, chatId, { type: 'message_pinned', messageId: msgId, chatId, pinnedBy: user.id });

  return c.json({ success: true });
});

// POST /api/v1/messages/:chatId/:msgId/star
messages.post('/:chatId/:msgId/star', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('chatId');
  const msgId = c.req.param('msgId');
  const now = Date.now();

  const existing = await c.env.DB.prepare(
    'SELECT 1 FROM starred_messages WHERE user_id = ? AND message_id = ?'
  ).bind(user.id, msgId).first();

  if (existing) {
    await c.env.DB.prepare('DELETE FROM starred_messages WHERE user_id = ? AND message_id = ?').bind(user.id, msgId).run();
    await c.env.DB.prepare('UPDATE messages SET is_starred = 0 WHERE id = ? AND sender_id = ?').bind(msgId, user.id).run();
    return c.json({ starred: false });
  }

  await c.env.DB.prepare('INSERT INTO starred_messages (user_id, message_id, starred_at) VALUES (?, ?, ?)').bind(user.id, msgId, now).run();
  return c.json({ starred: true });
});

// POST /api/v1/messages/:chatId/:msgId/read
messages.post('/:chatId/:msgId/read', async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('chatId');
  const msgId = c.req.param('msgId');
  const now = Date.now();

  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO message_reads (message_id, user_id, read_at) VALUES (?, ?, ?)'
  ).bind(msgId, user.id, now).run();

  await broadcastToChat(c.env, chatId, { type: 'message_read', messageId: msgId, userId: user.id, chatId });

  return c.json({ success: true });
});

// GET /api/v1/messages/starred
messages.get('/starred', async (c) => {
  const user = c.get('user');
  const limit = parseInt(c.req.query('limit') || '30');
  const offset = parseInt(c.req.query('offset') || '0');

  const starred = await c.env.DB.prepare(
    `SELECT m.*, u.display_name as sender_name, u.avatar_url as sender_avatar, sm.starred_at,
     c.name as chat_name, c.type as chat_type
     FROM messages m
     JOIN starred_messages sm ON sm.message_id = m.id AND sm.user_id = ?
     JOIN users u ON u.id = m.sender_id
     JOIN chats c ON c.id = m.chat_id
     WHERE m.is_deleted = 0
     ORDER BY sm.starred_at DESC LIMIT ? OFFSET ?`
  ).bind(user.id, limit, offset).all();

  return c.json({ starred_messages: starred.results });
});

export default messages;
