// ============================================
// DL Chat - Call Routes (WebRTC Signaling)
// ============================================
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { generateId } from '../utils/hash';
import { sendCallNotification } from '../services/notifications';

type AppEnv = { Bindings: Env; Variables: Variables };
const calls = new Hono<AppEnv>();

calls.use('*', authMiddleware);

// POST /api/v1/calls/initiate
calls.post('/initiate', zValidator('json', z.object({
  chat_id: z.string().optional(),
  type: z.enum(['voice', 'video', 'group_voice', 'group_video']),
  participant_ids: z.array(z.string()).optional(),
})), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const now = Date.now();

  const callId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO calls (id, chat_id, initiator_id, type, status, encryption_key, created_at)
     VALUES (?, ?, ?, ?, 'ringing', ?, ?)`
  ).bind(callId, body.chat_id || null, user.id, body.type, generateId(), now).run();

  // Add initiator as participant
  await c.env.DB.prepare(
    'INSERT INTO call_participants (call_id, user_id, joined_at) VALUES (?, ?, ?)'
  ).bind(callId, user.id, now).run();

  // Get chat members to notify
  let memberIds: string[] = body.participant_ids || [];

  if (body.chat_id && memberIds.length === 0) {
    const members = await c.env.DB.prepare(
      'SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ? AND role != ?'
    ).bind(body.chat_id, user.id, 'banned').all<{ user_id: string }>();
    memberIds = members.results.map(m => m.user_id);
  }

  // Get initiator's name
  const initiator = await c.env.DB.prepare('SELECT display_name FROM users WHERE id = ?').bind(user.id).first<any>();

  // Notify participants via Durable Object (CallRoom)
  const callRoomId = c.env.CALL_ROOM.idFromName(callId);
  const callRoom = c.env.CALL_ROOM.get(callRoomId);

  // Send notifications to all participants
  const callData = {
    id: callId,
    type: body.type,
    initiator_id: user.id,
    initiator_name: initiator?.display_name,
    chat_id: body.chat_id,
    created_at: now,
  };

  // Notify via Presence DO
  for (const memberId of memberIds) {
    const presenceId = c.env.PRESENCE.idFromName(memberId);
    const presence = c.env.PRESENCE.get(presenceId);
    await presence.fetch('https://internal/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'call_incoming', call: callData }),
    }).catch(console.error);

    // Push notification
    c.executionCtx?.waitUntil(
      sendCallNotification(c.env, memberId, initiator?.display_name || 'Unknown', body.type, callId)
    );
  }

  return c.json({ call: callData }, 201);
});

// POST /api/v1/calls/:id/answer
calls.post('/:id/answer', async (c) => {
  const user = c.get('user');
  const callId = c.req.param('id');
  const now = Date.now();

  const call = await c.env.DB.prepare(
    'SELECT id, status, type FROM calls WHERE id = ?'
  ).bind(callId).first<any>();

  if (!call) {
    throw new HTTPException(404, { message: 'Call not found' });
  }

  if (call.status !== 'ringing') {
    throw new HTTPException(400, { message: 'Call is no longer ringing' });
  }

  await c.env.DB.prepare(
    `UPDATE calls SET status = 'active', started_at = ? WHERE id = ?`
  ).bind(now, callId).run();

  await c.env.DB.prepare(
    'INSERT OR REPLACE INTO call_participants (call_id, user_id, joined_at) VALUES (?, ?, ?)'
  ).bind(callId, user.id, now).run();

  return c.json({ success: true, call_id: callId, status: 'active' });
});

// POST /api/v1/calls/:id/reject
calls.post('/:id/reject', async (c) => {
  const user = c.get('user');
  const callId = c.req.param('id');

  const call = await c.env.DB.prepare('SELECT id, initiator_id FROM calls WHERE id = ?').bind(callId).first<any>();
  if (!call) {
    throw new HTTPException(404, { message: 'Call not found' });
  }

  await c.env.DB.prepare(`UPDATE calls SET status = 'declined' WHERE id = ?`).bind(callId).run();

  // Notify initiator via their Presence DO
  const presenceId = c.env.PRESENCE.idFromName(call.initiator_id);
  const presence = c.env.PRESENCE.get(presenceId);
  await presence.fetch('https://internal/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'call_rejected', callId, rejectedBy: user.id }),
  }).catch(console.error);

  return c.json({ success: true });
});

// POST /api/v1/calls/:id/end
calls.post('/:id/end', async (c) => {
  const user = c.get('user');
  const callId = c.req.param('id');
  const now = Date.now();

  const call = await c.env.DB.prepare('SELECT id, started_at, chat_id FROM calls WHERE id = ?').bind(callId).first<any>();
  if (!call) {
    throw new HTTPException(404, { message: 'Call not found' });
  }

  const duration = call.started_at ? Math.floor((now - call.started_at) / 1000) : 0;

  await c.env.DB.prepare(
    `UPDATE calls SET status = 'ended', ended_at = ?, duration_seconds = ? WHERE id = ?`
  ).bind(now, duration, callId).run();

  await c.env.DB.prepare('UPDATE call_participants SET left_at = ? WHERE call_id = ? AND user_id = ?')
    .bind(now, callId, user.id).run();

  // Notify call room
  try {
    const callRoomId = c.env.CALL_ROOM.idFromName(callId);
    const callRoom = c.env.CALL_ROOM.get(callRoomId);
    await callRoom.fetch('https://internal/end', { method: 'POST' });
  } catch (e) {
    console.error('[Calls] Failed to notify call room:', e);
  }

  return c.json({ success: true, duration_seconds: duration });
});

// POST /api/v1/calls/:id/signal - WebRTC signaling
calls.post('/:id/signal', zValidator('json', z.object({
  signal: z.object({
    type: z.enum(['offer', 'answer', 'ice-candidate']),
    sdp: z.string().optional(),
    candidate: z.unknown().optional(),
    targetUserId: z.string().optional(),
  }),
})), async (c) => {
  const user = c.get('user');
  const callId = c.req.param('id');
  const { signal } = c.req.valid('json');

  // Forward signal through CallRoom Durable Object
  try {
    const callRoomId = c.env.CALL_ROOM.idFromName(callId);
    const callRoom = c.env.CALL_ROOM.get(callRoomId);
    await callRoom.fetch('https://internal/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal, fromUserId: user.id }),
    });
  } catch (e) {
    console.error('[Calls] Failed to forward signal:', e);
  }

  return c.json({ success: true });
});

export default calls;
