// ============================================
// DL Chat - Media & File Management API
// DEATH LEGION Team — Proprietary Software
// ============================================
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { generateId } from '../utils/hash';

type AppEnv = { Bindings: Env; Variables: Variables };
const media = new Hono<AppEnv>();
media.use('*', authMiddleware);

// Max file sizes
const MAX_SIZES: Record<string, number> = {
  image: 50 * 1024 * 1024,    // 50MB
  video: 2048 * 1024 * 1024,  // 2GB
  audio: 512 * 1024 * 1024,   // 512MB
  document: 2048 * 1024 * 1024, // 2GB
  sticker: 10 * 1024 * 1024,  // 10MB
};

// MIME type mapping
const ALLOWED_TYPES: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/heic'],
  video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-matroska'],
  audio: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac', 'audio/opus'],
  document: [
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'application/zip', 'application/x-zip-compressed',
    'application/json', 'application/xml',
  ],
  sticker: ['image/webp', 'image/gif', 'video/webm'],
};

function getMediaType(mime: string): string {
  for (const [type, mimes] of Object.entries(ALLOWED_TYPES)) {
    if (mimes.includes(mime)) return type;
  }
  return 'document';
}

// POST /api/v1/media/presign — get pre-signed upload URL
media.post('/presign', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const { file_name, file_size, content_type, chat_id } = body;

  if (!file_name || !file_size || !content_type) {
    throw new HTTPException(400, { message: 'file_name, file_size, and content_type required' });
  }

  const mediaType = getMediaType(content_type);
  const maxSize = MAX_SIZES[mediaType] || MAX_SIZES.document;

  if (file_size > maxSize) {
    throw new HTTPException(400, { message: `File too large. Max size: ${Math.round(maxSize / 1024 / 1024)}MB` });
  }

  const fileId = generateId();
  const ext = file_name.split('.').pop()?.toLowerCase() || 'bin';
  const key = `uploads/${user.id}/${fileId}.${ext}`;
  const now = Date.now();

  // Record pending upload in DB
  await c.env.DB.prepare(
    `INSERT INTO media_uploads (id, user_id, chat_id, file_key, file_name, file_size, content_type,
     media_type, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).bind(fileId, user.id, chat_id ?? null, key, file_name, file_size, content_type, mediaType, now).run();

  // Create pre-signed URL using R2 (if available)
  let uploadUrl: string;
  let publicUrl: string;

  try {
    if (c.env.R2) {
      // Generate R2 pre-signed upload URL
      const expiry = 3600; // 1 hour
      uploadUrl = `https://dl-chat-api.death-legion-dlchat.workers.dev/api/v1/media/upload/${fileId}?token=${user.id}`;
      publicUrl = `https://dl-chat-api.death-legion-dlchat.workers.dev/files/${key}`;
    } else {
      // Fallback: direct upload via API
      uploadUrl = `https://dl-chat-api.death-legion-dlchat.workers.dev/api/v1/media/upload/${fileId}`;
      publicUrl = `https://dl-chat-api.death-legion-dlchat.workers.dev/files/${key}`;
    }
  } catch {
    uploadUrl = `https://dl-chat-api.death-legion-dlchat.workers.dev/api/v1/media/upload/${fileId}`;
    publicUrl = `https://dl-chat-api.death-legion-dlchat.workers.dev/files/${key}`;
  }

  return c.json({
    file_id: fileId,
    upload_url: uploadUrl,
    public_url: publicUrl,
    file_key: key,
    expires_in: 3600,
    max_size: maxSize,
    media_type: mediaType,
  }, 201);
});

// POST /api/v1/media/upload/:fileId — direct file upload
media.post('/upload/:fileId', async (c) => {
  const { fileId } = c.req.param();
  const user = c.get('user');

  const upload = await c.env.DB.prepare(
    'SELECT * FROM media_uploads WHERE id = ? AND user_id = ? AND status = ?'
  ).bind(fileId, user.id, 'pending').first<any>();

  if (!upload) throw new HTTPException(404, { message: 'Upload not found or already completed' });

  const contentType = c.req.header('Content-Type') || upload.content_type;
  const body = await c.req.arrayBuffer();

  if (body.byteLength === 0) {
    throw new HTTPException(400, { message: 'Empty file' });
  }

  if (body.byteLength > upload.file_size * 1.1) { // 10% tolerance
    throw new HTTPException(400, { message: 'File size mismatch' });
  }

  if (!c.env.R2) {
    throw new HTTPException(503, { message: 'Storage not configured. Please enable R2 in Cloudflare dashboard.' });
  }

  await c.env.R2.put(upload.file_key, body, {
    httpMetadata: { contentType },
    customMetadata: {
      user_id: user.id,
      file_name: upload.file_name,
      upload_id: fileId,
    },
  });

  const now = Date.now();
  await c.env.DB.prepare(
    'UPDATE media_uploads SET status = ?, completed_at = ? WHERE id = ?'
  ).bind('completed', now, fileId).run();

  return c.json({
    file_id: fileId,
    file_key: upload.file_key,
    public_url: `https://dl-chat-api.death-legion-dlchat.workers.dev/files/${upload.file_key}`,
    file_name: upload.file_name,
    file_size: body.byteLength,
    content_type: contentType,
    media_type: upload.media_type,
    uploaded_at: now,
  });
});

// GET /api/v1/media/:chatId — list media in a chat
media.get('/:chatId', async (c) => {
  const { chatId } = c.req.param();
  const user = c.get('user');
  const mediaType = c.req.query('type'); // image|video|audio|document
  const limit = Math.min(parseInt(c.req.query('limit') || '30'), 100);
  const offset = parseInt(c.req.query('offset') || '0');

  // Verify access
  const member = await c.env.DB.prepare(
    'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?'
  ).bind(chatId, user.id).first();
  if (!member) throw new HTTPException(403, { message: 'Access denied' });

  let query = `SELECT m.id, m.file_url, m.file_name, m.file_size, m.message_type as media_type,
   m.created_at, m.sender_id, u.display_name as sender_name, u.avatar_url as sender_avatar
   FROM messages m JOIN users u ON u.id = m.sender_id
   WHERE m.chat_id = ? AND m.message_type IN ('image', 'video', 'audio', 'document', 'voice', 'sticker')
   AND m.is_deleted = 0`;
  const params: unknown[] = [chatId];

  if (mediaType) { query += ' AND m.message_type = ?'; params.push(mediaType); }
  query += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({ media: rows.results || [], has_more: (rows.results?.length || 0) === limit });
});

// DELETE /api/v1/media/:fileId — delete uploaded file
media.delete('/:fileId', async (c) => {
  const { fileId } = c.req.param();
  const user = c.get('user');

  const upload = await c.env.DB.prepare(
    'SELECT * FROM media_uploads WHERE id = ? AND user_id = ?'
  ).bind(fileId, user.id).first<any>();

  if (!upload) throw new HTTPException(404, { message: 'File not found' });

  // Delete from R2
  try {
    if (c.env.R2 && upload.file_key) {
      await c.env.R2.delete(upload.file_key);
    }
  } catch {}

  await c.env.DB.prepare('DELETE FROM media_uploads WHERE id = ?').bind(fileId).run();

  return c.json({ success: true });
});

// GET /api/v1/media/storage/usage — get user's storage usage
media.get('/storage/usage', async (c) => {
  const user = c.get('user');

  const usage = await c.env.DB.prepare(
    `SELECT media_type, COUNT(*) as count, SUM(file_size) as total_size
     FROM media_uploads WHERE user_id = ? AND status = 'completed'
     GROUP BY media_type`
  ).bind(user.id).all();

  const totalSize = (usage.results || []).reduce((acc: number, r: any) => acc + (r.total_size || 0), 0);
  const storageLimit = 15 * 1024 * 1024 * 1024; // 15GB default

  return c.json({
    usage: usage.results || [],
    total_used: totalSize,
    total_limit: storageLimit,
    usage_percent: Math.round((totalSize / storageLimit) * 100),
    by_type: Object.fromEntries(
      (usage.results || []).map((r: any) => [r.media_type, { count: r.count, size: r.total_size || 0 }])
    ),
  });
});

export default media;
