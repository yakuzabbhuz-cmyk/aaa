// ============================================
// DL Chat - AI Features API (Cloudflare Workers AI)
// DEATH LEGION Team
// ============================================

import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';

type AppEnv = { Bindings: Env; Variables: Variables };
const ai = new Hono<AppEnv>();

ai.use('*', authMiddleware);

// POST /ai/chat - AI assistant chat
ai.post('/chat', async (c) => {
  const userId = c.get('userId');
  const { message, conversationId, systemPrompt } = await c.req.json();

  if (!message) return c.json({ error: 'message required' }, 400);
  if (message.length > 2000) return c.json({ error: 'Message too long (max 2000 chars)' }, 400);

  // Get conversation history (last 10 messages)
  let history: Array<{ role: string; content: string }> = [];
  if (conversationId) {
    const convHistory = await c.env.DB.prepare(`
      SELECT role, content FROM ai_conversations
      WHERE conversation_id = ? AND user_id = ?
      ORDER BY created_at DESC LIMIT 10
    `).bind(conversationId, userId).all();
    history = (convHistory.results as any[]).reverse().map(r => ({ role: r.role, content: r.content }));
  }

  const messages = [
    {
      role: 'system',
      content: systemPrompt || `You are DL AI, a helpful assistant built into DL Chat by DEATH LEGION Team. 
You are friendly, concise, and knowledgeable. You can help with writing, coding, analysis, creativity, and general questions.
Current date: ${new Date().toISOString().split('T')[0]}`
    },
    ...history,
    { role: 'user', content: message }
  ];

  let response = '';
  let tokensUsed = 0;

  try {
    if (c.env.AI) {
      const result = await (c.env.AI as any).run('@cf/meta/llama-3.1-8b-instruct', {
        messages,
        max_tokens: 1024,
        temperature: 0.7
      });
      response = result?.response || 'I apologize, I could not generate a response. Please try again.';
      tokensUsed = result?.usage?.total_tokens || 0;
    } else {
      response = 'AI features require Cloudflare Workers AI binding. Please configure the AI binding in your Worker settings.';
    }
  } catch (e) {
    console.error('AI error:', e);
    response = 'AI service temporarily unavailable. Please try again later.';
  }

  // Save to conversation history
  const convId = conversationId || crypto.randomUUID();
  const now = new Date().toISOString();
  
  await c.env.DB.prepare(`
    INSERT INTO ai_conversations (id, conversation_id, user_id, role, content, tokens, created_at)
    VALUES (?, ?, ?, 'user', ?, 0, ?), (?, ?, ?, 'assistant', ?, ?, ?)
  `).bind(
    crypto.randomUUID(), convId, userId, message, now,
    crypto.randomUUID(), convId, userId, response, tokensUsed, now
  ).run().catch(() => {});

  return c.json({
    success: true,
    response,
    conversationId: convId,
    tokensUsed
  });
});

// POST /ai/summarize - Summarize chat/message history
ai.post('/summarize', async (c) => {
  const userId = c.get('userId');
  const { chatId, messageCount = 50, language = 'en' } = await c.req.json();

  if (!chatId) return c.json({ error: 'chatId required' }, 400);

  // Verify access
  const member = await c.env.DB.prepare(
    'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NULL'
  ).bind(chatId, userId).first();
  
  if (!member) return c.json({ error: 'Access denied' }, 403);

  // Get recent messages
  const messages = await c.env.DB.prepare(`
    SELECT m.content, u.username, m.created_at
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.chat_id = ? AND m.type = 'text' AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC
    LIMIT ?
  `).bind(chatId, Math.min(messageCount, 100)).all();

  if (!messages.results.length) {
    return c.json({ error: 'No messages to summarize' }, 404);
  }

  const messageText = (messages.results as any[])
    .reverse()
    .map(m => `${m.username}: ${m.content}`)
    .join('\n');

  let summary = '';
  
  try {
    if (c.env.AI) {
      const result = await (c.env.AI as any).run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are a concise conversation summarizer. Summarize the key points of the conversation in 3-5 bullet points. Be brief and clear.' },
          { role: 'user', content: `Please summarize this conversation:\n\n${messageText}` }
        ],
        max_tokens: 512
      });
      summary = result?.response || 'Could not generate summary.';
    } else {
      summary = `Summary of last ${messages.results.length} messages in chat.`;
    }
  } catch (e) {
    summary = 'Summary generation failed. Please try again.';
  }

  return c.json({
    success: true,
    summary,
    messageCount: messages.results.length,
    chatId
  });
});

// POST /ai/smart-reply - Suggest smart replies
ai.post('/smart-reply', async (c) => {
  const userId = c.get('userId');
  const { messageId, count = 3 } = await c.req.json();

  if (!messageId) return c.json({ error: 'messageId required' }, 400);

  const message = await c.env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(messageId).first();
  if (!message) return c.json({ error: 'Message not found' }, 404);

  let suggestions: string[] = [];
  
  try {
    if (c.env.AI) {
      const result = await (c.env.AI as any).run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: `Generate ${count} short, natural reply suggestions for a chat message. Each reply should be on a new line, starting with "- ". Keep each under 10 words. Be conversational.` },
          { role: 'user', content: `Message: "${message.content}"\n\nGenerate ${count} quick reply suggestions:` }
        ],
        max_tokens: 128
      });
      const raw = result?.response || '';
      suggestions = raw.split('\n')
        .filter((l: string) => l.trim().startsWith('-'))
        .map((l: string) => l.replace(/^-\s*/, '').trim())
        .filter((l: string) => l.length > 0)
        .slice(0, count);
    }
    
    if (!suggestions.length) {
      suggestions = ['👍', 'Sounds good!', 'Got it!'].slice(0, count);
    }
  } catch (e) {
    suggestions = ['👍', 'OK!', 'Thanks!'].slice(0, count);
  }

  return c.json({ success: true, suggestions, messageId });
});

// POST /ai/moderate - Content moderation
ai.post('/moderate', async (c) => {
  const userId = c.get('userId');
  const { text } = await c.req.json();

  if (!text) return c.json({ error: 'text required' }, 400);

  let flagged = false;
  let categories: Record<string, boolean> = {};
  let confidence = 0;

  try {
    if (c.env.AI) {
      const result = await (c.env.AI as any).run('@cf/meta/llama-guard-2-8b', {
        messages: [{ role: 'user', content: text }]
      });
      flagged = result?.response?.toLowerCase().includes('unsafe') || false;
      confidence = flagged ? 0.9 : 0.05;
    }
  } catch (e) {
    console.error('Moderation error:', e);
  }

  return c.json({
    success: true,
    flagged,
    categories,
    confidence,
    action: flagged ? 'review' : 'allow'
  });
});

// GET /ai/conversations - Get AI conversation history
ai.get('/conversations', async (c) => {
  const userId = c.get('userId');

  const convos = await c.env.DB.prepare(`
    SELECT conversation_id, 
           MAX(created_at) as last_message,
           COUNT(*) as message_count,
           (SELECT content FROM ai_conversations WHERE conversation_id = c.conversation_id AND role = 'user' ORDER BY created_at ASC LIMIT 1) as first_message
    FROM ai_conversations c
    WHERE user_id = ?
    GROUP BY conversation_id
    ORDER BY last_message DESC
    LIMIT 20
  `).bind(userId).all();

  return c.json({ success: true, conversations: convos.results });
});

// GET /ai/conversations/:id - Get specific conversation
ai.get('/conversations/:id', async (c) => {
  const { id } = c.req.param();
  const userId = c.get('userId');

  const messages = await c.env.DB.prepare(`
    SELECT role, content, tokens, created_at
    FROM ai_conversations
    WHERE conversation_id = ? AND user_id = ?
    ORDER BY created_at ASC
    LIMIT 100
  `).bind(id, userId).all();

  return c.json({ success: true, messages: messages.results });
});

// DELETE /ai/conversations/:id - Delete conversation
ai.delete('/conversations/:id', async (c) => {
  const { id } = c.req.param();
  const userId = c.get('userId');

  await c.env.DB.prepare('DELETE FROM ai_conversations WHERE conversation_id = ? AND user_id = ?').bind(id, userId).run();
  return c.json({ success: true });
});

export default ai;
