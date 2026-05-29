// ============================================
// DL Chat - File Upload Routes (R2 Storage)
// ============================================
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { uploadRateLimit } from '../middleware/rateLimit';
import { generateId } from '../utils/hash';

type AppEnv = { Bindings: Env; Variables: Variables };
const upload = new Hono<AppEnv>();

upload.use('*', authMiddleware);
upload.use('*', uploadRateLimit);

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
]);

const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4', 'video/webm', 'video/mov', 'video/avi', 'video/mkv',
]);

const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/m4a', 'audio/aac',
]);

const ALLOWED_DOC_TYPES = new Set([
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'application/zip', 'application/x-zip-compressed',
  'application/x-rar-compressed', 'application/octet-stream',
]);

const MAX_FILE_SIZE_IMAGE = 16 * 1024 * 1024;     // 16 MB
const MAX_FILE_SIZE_VIDEO = 2 * 1024 * 1024 * 1024; // 2 GB
const MAX_FILE_SIZE_DOC = 2 * 1024 * 1024 * 1024;   // 2 GB

function getFileCategory(mimeType: string): 'image' | 'video' | 'audio' | 'document' | null {
  if (ALLOWED_IMAGE_TYPES.has(mimeType)) return 'image';
  if (ALLOWED_VIDEO_TYPES.has(mimeType)) return 'video';
  if (ALLOWED_AUDIO_TYPES.has(mimeType)) return 'audio';
  if (ALLOWED_DOC_TYPES.has(mimeType)) return 'document';
  return null;
}

function getMaxFileSize(category: string): number {
  switch (category) {
    case 'image': return MAX_FILE_SIZE_IMAGE;
    case 'video': return MAX_FILE_SIZE_VIDEO;
    case 'audio': return MAX_FILE_SIZE_DOC;
    case 'document': return MAX_FILE_SIZE_DOC;
    default: return MAX_FILE_SIZE_IMAGE;
  }
}

// POST /api/v1/upload
upload.post('/', async (c) => {
  const user = c.get('user');

  const contentType = c.req.header('Content-Type') || '';

  // Handle multipart form upload
  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      throw new HTTPException(400, { message: 'No file provided' });
    }

    const mimeType = file.type || 'application/octet-stream';
    const category = getFileCategory(mimeType);

    if (!category) {
      throw new HTTPException(400, { message: `File type ${mimeType} is not allowed` });
    }

    const maxSize = getMaxFileSize(category);
    if (file.size > maxSize) {
      const maxMB = Math.round(maxSize / (1024 * 1024));
      throw new HTTPException(413, { message: `File too large. Maximum size: ${maxMB}MB` });
    }

    const ext = file.name.split('.').pop() || 'bin';
    const key = `${category}s/${user.id}/${generateId()}.${ext}`;

    const buffer = await file.arrayBuffer();
    await c.env.R2.put(key, buffer, {
      httpMetadata: {
        contentType: mimeType,
        contentDisposition: `attachment; filename="${encodeURIComponent(file.name)}"`,
      },
      customMetadata: {
        uploadedBy: user.id,
        originalName: file.name,
        category,
      },
    });

    const publicUrl = `https://files.dlchat.app/${key}`;

    return c.json({
      key,
      url: publicUrl,
      size: file.size,
      mime_type: mimeType,
      category,
      original_name: file.name,
    }, 201);
  }

  // Handle raw binary upload (with Content-Type header)
  const rawMimeType = contentType.split(';')[0].trim();
  const category = getFileCategory(rawMimeType);

  if (!category) {
    throw new HTTPException(400, { message: `File type ${rawMimeType} is not allowed` });
  }

  const body = await c.req.arrayBuffer();
  const maxSize = getMaxFileSize(category);

  if (body.byteLength > maxSize) {
    const maxMB = Math.round(maxSize / (1024 * 1024));
    throw new HTTPException(413, { message: `File too large. Maximum size: ${maxMB}MB` });
  }

  const ext = rawMimeType.split('/')[1] || 'bin';
  const key = `${category}s/${user.id}/${generateId()}.${ext}`;

  await c.env.R2.put(key, body, {
    httpMetadata: { contentType: rawMimeType },
    customMetadata: { uploadedBy: user.id, category },
  });

  const publicUrl = `https://files.dlchat.app/${key}`;

  return c.json({
    key,
    url: publicUrl,
    size: body.byteLength,
    mime_type: rawMimeType,
    category,
  }, 201);
});

// GET /api/v1/upload/:key - Get file info
upload.get('/:key{.+}', async (c) => {
  const key = c.req.param('key');

  const obj = await c.env.R2.head(key);
  if (!obj) {
    throw new HTTPException(404, { message: 'File not found' });
  }

  return c.json({
    key,
    url: `https://files.dlchat.app/${key}`,
    size: obj.size,
    mime_type: obj.httpMetadata?.contentType,
    uploaded_at: obj.uploaded.getTime(),
  });
});

// DELETE /api/v1/upload/:key
upload.delete('/:key{.+}', async (c) => {
  const user = c.get('user');
  const key = c.req.param('key');

  const obj = await c.env.R2.head(key);
  if (!obj) {
    throw new HTTPException(404, { message: 'File not found' });
  }

  // Check ownership
  const uploadedBy = obj.customMetadata?.uploadedBy;
  if (uploadedBy && uploadedBy !== user.id) {
    throw new HTTPException(403, { message: 'Not authorized to delete this file' });
  }

  await c.env.R2.delete(key);
  return c.json({ success: true });
});

// Serve uploaded files (R2 proxy)
upload.get('/serve/:key{.+}', async (c) => {
  const key = c.req.param('key');

  const obj = await c.env.R2.get(key);
  if (!obj) {
    throw new HTTPException(404, { message: 'File not found' });
  }

  const contentType = obj.httpMetadata?.contentType || 'application/octet-stream';

  return new Response(obj.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000',
      'Content-Length': String(obj.size),
    },
  });
});

export default upload;
