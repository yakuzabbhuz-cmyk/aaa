// ============================================
// DL Chat - Polls & Voting API Routes
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
const polls = new Hono<AppEnv>();
polls.use('*', authMiddleware);

const createPollSchema = z.object({
  chat_id: z.string(),
  question: z.string().min(1).max(300),
  options: z.array(z.string().min(1).max(100)).min(2).max(10),
  is_anonymous: z.boolean().default(false),
  is_multiple_choice: z.boolean().default(false),
  is_quiz: z.boolean().default(false),
  correct_option: z.number().optional(),
  explanation: z.string().max(500).optional(),
  close_at: z.number().optional(), // unix ms timestamp
});

const voteSchema = z.object({
  option_indices: z.array(z.number().int().min(0)).min(1).max(10),
});

// POST /api/v1/polls — create a poll
polls.post('/', zValidator('json', createPollSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');

  // Verify chat membership
  const member = await c.env.DB.prepare(
    'SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(body.chat_id, user.id).first<any>();

  if (!member) throw new HTTPException(403, { message: 'Not a chat member' });

  if (body.is_quiz && body.correct_option === undefined) {
    throw new HTTPException(400, { message: 'Quiz polls require a correct_option' });
  }

  const pollId = generateId();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO polls (id, chat_id, creator_id, question, options_json, is_anonymous,
     is_multiple_choice, is_quiz, correct_option, explanation, close_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    pollId, body.chat_id, user.id, body.question,
    JSON.stringify(body.options.map((text, i) => ({ index: i, text, votes: 0 }))),
    body.is_anonymous ? 1 : 0,
    body.is_multiple_choice ? 1 : 0,
    body.is_quiz ? 1 : 0,
    body.correct_option ?? null,
    body.explanation ?? null,
    body.close_at ?? null,
    now
  ).run();

  // Create a message in the chat for the poll
  const messageId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO messages (id, chat_id, sender_id, message_type, content, metadata, created_at)
     VALUES (?, ?, ?, 'poll', ?, ?, ?)`
  ).bind(
    messageId, body.chat_id, user.id,
    `📊 Poll: ${body.question}`,
    JSON.stringify({ poll_id: pollId }),
    now
  ).run();

  // Broadcast to chat room
  try {
    const roomId = c.env.CHAT_ROOM.idFromName(body.chat_id);
    const room = c.env.CHAT_ROOM.get(roomId);
    await room.fetch('https://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'new_message', message_id: messageId, chat_id: body.chat_id }),
    });
  } catch {}

  return c.json({
    id: pollId,
    message_id: messageId,
    question: body.question,
    options: body.options.map((text, i) => ({ index: i, text, votes: 0 })),
    is_anonymous: body.is_anonymous,
    is_multiple_choice: body.is_multiple_choice,
    is_quiz: body.is_quiz,
    total_voters: 0,
    created_at: now,
  }, 201);
});

// GET /api/v1/polls/:pollId — get poll details + results
polls.get('/:pollId', async (c) => {
  const { pollId } = c.req.param();
  const user = c.get('user');

  const poll = await c.env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(pollId).first<any>();
  if (!poll) throw new HTTPException(404, { message: 'Poll not found' });

  // Verify access
  const member = await c.env.DB.prepare(
    'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(poll.chat_id, user.id).first();
  if (!member) throw new HTTPException(403, { message: 'Access denied' });

  const options = JSON.parse(poll.options_json || '[]');

  // Get vote counts per option
  const votes = await c.env.DB.prepare(
    'SELECT option_index, COUNT(*) as count FROM poll_votes WHERE poll_id = ? GROUP BY option_index'
  ).bind(pollId).all();

  const voteMap: Record<number, number> = {};
  (votes.results || []).forEach((v: any) => { voteMap[v.option_index] = v.count; });

  // Get total voters
  const total = await c.env.DB.prepare(
    'SELECT COUNT(DISTINCT user_id) as cnt FROM poll_votes WHERE poll_id = ?'
  ).bind(pollId).first<{ cnt: number }>();

  // Get user's own votes
  const myVotes = await c.env.DB.prepare(
    'SELECT option_index FROM poll_votes WHERE poll_id = ? AND user_id = ?'
  ).bind(pollId, user.id).all();

  const myVoteIndices = (myVotes.results || []).map((v: any) => v.option_index);
  const totalVoters = total?.cnt || 0;

  const pollOptions = options.map((opt: any) => ({
    index: opt.index,
    text: opt.text,
    votes: voteMap[opt.index] || 0,
    percentage: totalVoters > 0 ? Math.round(((voteMap[opt.index] || 0) / totalVoters) * 100) : 0,
    voted_by_me: myVoteIndices.includes(opt.index),
  }));

  const now = Date.now();
  const isClosed = poll.close_at && poll.close_at < now;

  return c.json({
    id: poll.id,
    question: poll.question,
    options: pollOptions,
    is_anonymous: !!poll.is_anonymous,
    is_multiple_choice: !!poll.is_multiple_choice,
    is_quiz: !!poll.is_quiz,
    correct_option: isClosed ? poll.correct_option : null,
    explanation: isClosed ? poll.explanation : null,
    total_voters: totalVoters,
    my_votes: myVoteIndices,
    is_closed: !!isClosed,
    close_at: poll.close_at,
    created_at: poll.created_at,
  });
});

// POST /api/v1/polls/:pollId/vote — vote on a poll
polls.post('/:pollId/vote', zValidator('json', voteSchema), async (c) => {
  const { pollId } = c.req.param();
  const user = c.get('user');
  const { option_indices } = c.req.valid('json');

  const poll = await c.env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(pollId).first<any>();
  if (!poll) throw new HTTPException(404, { message: 'Poll not found' });

  // Verify access
  const member = await c.env.DB.prepare(
    'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(poll.chat_id, user.id).first();
  if (!member) throw new HTTPException(403, { message: 'Access denied' });

  // Check if closed
  if (poll.close_at && poll.close_at < Date.now()) {
    throw new HTTPException(400, { message: 'Poll is closed' });
  }

  // Validate options
  const options = JSON.parse(poll.options_json || '[]');
  const validIndices = options.map((o: any) => o.index);
  if (!option_indices.every((i: number) => validIndices.includes(i))) {
    throw new HTTPException(400, { message: 'Invalid option index' });
  }

  if (!poll.is_multiple_choice && option_indices.length > 1) {
    throw new HTTPException(400, { message: 'This poll does not allow multiple choices' });
  }

  // Remove existing votes and re-vote
  await c.env.DB.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?').bind(pollId, user.id).run();

  const now = Date.now();
  const stmts = option_indices.map((idx: number) =>
    c.env.DB.prepare(
      'INSERT INTO poll_votes (id, poll_id, user_id, option_index, voted_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(generateId(), pollId, user.id, idx, now)
  );

  await c.env.DB.batch(stmts);

  // Broadcast updated poll to chat
  try {
    const roomId = c.env.CHAT_ROOM.idFromName(poll.chat_id);
    const room = c.env.CHAT_ROOM.get(roomId);
    await room.fetch('https://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'poll_vote', poll_id: pollId, voter_id: user.id }),
    });
  } catch {}

  return c.json({ success: true, voted_options: option_indices });
});

// POST /api/v1/polls/:pollId/close — close a poll (creator only)
polls.post('/:pollId/close', async (c) => {
  const { pollId } = c.req.param();
  const user = c.get('user');

  const poll = await c.env.DB.prepare('SELECT * FROM polls WHERE id = ?').bind(pollId).first<any>();
  if (!poll) throw new HTTPException(404, { message: 'Poll not found' });
  if (poll.creator_id !== user.id) throw new HTTPException(403, { message: 'Only creator can close poll' });

  await c.env.DB.prepare('UPDATE polls SET close_at = ? WHERE id = ?').bind(Date.now(), pollId).run();

  return c.json({ success: true, closed_at: Date.now() });
});

export default polls;
