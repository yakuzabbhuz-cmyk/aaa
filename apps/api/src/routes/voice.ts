// ============================================
// DL Chat - Voice Messages API
// DEATH LEGION Team
// ============================================

import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';

type AppEnv = { Bindings: Env; Variables: Variables };
const voice = new Hono<AppEnv>();

voice.use('*', authMiddleware);

// POST /voice/upload - Upload voice message
voice.post('/upload', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const { chatId, duration, waveform, fileSize, mimeType } = body;

  if (!chatId || !duration) {
    return c.json({ error: 'chatId and duration required' }, 400);
  }

  const fileId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Store voice message metadata
  await c.env.DB.prepare(`
    INSERT INTO voice_messages (id, chat_id, sender_id, duration, waveform, file_size, mime_type, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).bind(fileId, chatId, userId, duration, JSON.stringify(waveform || []), fileSize || 0, mimeType || 'audio/ogg', now).run();

  // Generate presigned upload URL (simulated - in production use R2)
  const uploadUrl = `https://dl-chat-api.death-legion-dlchat.workers.dev/api/v1/voice/data/${fileId}`;

  return c.json({
    success: true,
    fileId,
    uploadUrl,
    expiresIn: 3600,
    message: 'Upload voice data to uploadUrl'
  }, 201);
});

// GET /voice/:fileId - Get voice message info
voice.get('/:fileId', async (c) => {
  const { fileId } = c.req.param();
  
  const msg = await c.env.DB.prepare(
    'SELECT * FROM voice_messages WHERE id = ?'
  ).bind(fileId).first();
  
  if (!msg) return c.json({ error: 'Voice message not found' }, 404);
  
  return c.json({
    success: true,
    voice: {
      ...msg,
      waveform: JSON.parse((msg.waveform as string) || '[]')
    }
  });
});

// GET /voice/:fileId/transcript - AI transcription
voice.get('/:fileId/transcript', async (c) => {
  const { fileId } = c.req.param();
  const userId = c.get('userId');
  
  const msg = await c.env.DB.prepare(
    'SELECT * FROM voice_messages WHERE id = ?'
  ).bind(fileId).first();
  
  if (!msg) return c.json({ error: 'Voice message not found' }, 404);
  
  // Check if transcript already exists
  if (msg.transcript) {
    return c.json({ success: true, transcript: msg.transcript, cached: true });
  }

  // In production, call AI transcription service
  const mockTranscript = '[Transcription available in production with AI service]';
  
  await c.env.DB.prepare(
    'UPDATE voice_messages SET transcript = ? WHERE id = ?'
  ).bind(mockTranscript, fileId).run();
  
  return c.json({ success: true, transcript: mockTranscript, cached: false });
});

// DELETE /voice/:fileId - Delete voice message
voice.delete('/:fileId', async (c) => {
  const { fileId } = c.req.param();
  const userId = c.get('userId');
  
  const msg = await c.env.DB.prepare(
    'SELECT * FROM voice_messages WHERE id = ? AND sender_id = ?'
  ).bind(fileId, userId).first();
  
  if (!msg) return c.json({ error: 'Not found or not authorized' }, 404);
  
  await c.env.DB.prepare('DELETE FROM voice_messages WHERE id = ?').bind(fileId).run();
  
  return c.json({ success: true });
});

export default voice;
