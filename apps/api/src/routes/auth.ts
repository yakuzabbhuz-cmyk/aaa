// ============================================
// DL Chat - Auth Routes
// ============================================
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Env, Variables } from '../types';
import { generateId } from '../utils/hash';
import { createAccessToken, createRefreshToken, verifyJwt, generateSessionId } from '../utils/jwt';
import { registerSchema, verifyOtpSchema, loginSchema } from '../utils/validators';
import { sendOtp, verifyOtp } from '../services/otp';
import { authMiddleware } from '../middleware/auth';
import { authRateLimit } from '../middleware/rateLimit';

type AppEnv = { Bindings: Env; Variables: Variables };
const auth = new Hono<AppEnv>();

// POST /api/v1/auth/register
auth.post('/register', authRateLimit, zValidator('json', registerSchema), async (c) => {
  const body = c.req.valid('json');
  const now = Date.now();

  // Check if user already exists
  if (body.phone) {
    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE phone = ?').bind(body.phone).first();
    if (existing) {
      throw new HTTPException(409, { message: 'Phone number already registered' });
    }
  }
  if (body.email) {
    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(body.email).first();
    if (existing) {
      throw new HTTPException(409, { message: 'Email already registered' });
    }
  }

  const target = body.phone || body.email!;

  // Check if OTP was recently sent (rate limit)
  const recentOtp = await c.env.KV.get(`otp:register:${target}`);

  // Send OTP
  const result = await sendOtp(c.env, target, 'register');

  // Store pending registration data
  await c.env.KV.put(`pending_register:${target}`, JSON.stringify({
    phone: body.phone,
    email: body.email,
    display_name: body.display_name,
    country_code: body.country_code,
  }), { expirationTtl: 15 * 60 });

  return c.json({
    success: true,
    message: `OTP sent to ${target}`,
    expires_in: 600,
    // Remove in production:
    debug_code: result.code,
  });
});

// POST /api/v1/auth/verify-otp
auth.post('/verify-otp', authRateLimit, zValidator('json', verifyOtpSchema), async (c) => {
  const body = c.req.valid('json');
  const now = Date.now();

  // Verify OTP
  const isValid = await verifyOtp(c.env, body.target, body.code, body.type);
  if (!isValid) {
    throw new HTTPException(400, { message: 'Invalid or expired OTP code' });
  }

  let userId: string;
  let isNewUser = false;

  if (body.type === 'register') {
    // Get pending registration data
    const pendingData = await c.env.KV.get(`pending_register:${body.target}`);
    if (!pendingData) {
      throw new HTTPException(400, { message: 'Registration session expired. Please start again.' });
    }

    const { phone, email, display_name, country_code } = JSON.parse(pendingData);

    userId = generateId();
    isNewUser = true;

    await c.env.DB.prepare(
      `INSERT INTO users (id, phone, email, display_name, created_at, updated_at, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(userId, phone || null, email || null, display_name, now, now, now).run();

    await c.env.KV.delete(`pending_register:${body.target}`);

  } else if (body.type === 'login') {
    // Find user by phone or email
    const isEmail = body.target.includes('@');
    const user = isEmail
      ? await c.env.DB.prepare('SELECT id, is_banned, ban_reason FROM users WHERE email = ?').bind(body.target).first<any>()
      : await c.env.DB.prepare('SELECT id, is_banned, ban_reason FROM users WHERE phone = ?').bind(body.target).first<any>();

    if (!user) {
      throw new HTTPException(404, { message: 'User not found' });
    }
    if (user.is_banned) {
      throw new HTTPException(403, { message: `Account banned: ${user.ban_reason}` });
    }
    userId = user.id;

  } else {
    throw new HTTPException(400, { message: 'Invalid OTP type' });
  }

  // Create session
  const sessionId = generateSessionId();
  const expiryDays = parseInt(c.env.SESSION_EXPIRY_DAYS || '30');
  const refreshExpiryDays = parseInt(c.env.REFRESH_TOKEN_EXPIRY_DAYS || '90');

  const accessToken = await createAccessToken(userId, sessionId, c.env.JWT_SECRET, expiryDays);
  const refreshToken = await createRefreshToken(userId, sessionId + '_refresh', c.env.JWT_SECRET, refreshExpiryDays);

  const sessionExpiresAt = now + expiryDays * 24 * 60 * 60 * 1000;

  // Store session in DB
  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token, refresh_token, device_info, ip_address, created_at, expires_at, refresh_expires_at, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(
    sessionId, userId, accessToken, refreshToken,
    body.device_info ? JSON.stringify(body.device_info) : null,
    c.req.header('CF-Connecting-IP') || null,
    now, sessionExpiresAt,
    now + refreshExpiryDays * 24 * 60 * 60 * 1000
  ).run();

  // Store session in KV for fast auth checks
  await c.env.KV.put(`session:${sessionId}`, JSON.stringify({ userId, isActive: true }), {
    expirationTtl: expiryDays * 24 * 60 * 60,
  });

  // Update last seen
  await c.env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(now, userId).run();

  const user = await c.env.DB.prepare(
    `SELECT id, username, phone, email, display_name, bio, avatar_url, status, is_verified, is_premium,
     is_bot, created_at, updated_at, last_seen, privacy_last_seen, privacy_profile_photo, privacy_about,
     privacy_status, privacy_read_receipts, privacy_groups, language, notification_sound, two_factor_enabled, public_key
     FROM users WHERE id = ?`
  ).bind(userId).first();

  return c.json({
    success: true,
    is_new_user: isNewUser,
    user,
    token: accessToken,
    refresh_token: refreshToken,
    expires_at: sessionExpiresAt,
  }, isNewUser ? 201 : 200);
});

// POST /api/v1/auth/login
auth.post('/login', authRateLimit, zValidator('json', loginSchema), async (c) => {
  const body = c.req.valid('json');
  const target = body.phone || body.email;

  if (!target) {
    throw new HTTPException(400, { message: 'Phone or email required' });
  }

  // Check user exists
  const isEmail = target.includes('@');
  const user = isEmail
    ? await c.env.DB.prepare('SELECT id, is_banned, ban_reason, two_factor_enabled FROM users WHERE email = ?').bind(target).first<any>()
    : await c.env.DB.prepare('SELECT id, is_banned, ban_reason, two_factor_enabled FROM users WHERE phone = ?').bind(target).first<any>();

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }
  if (user.is_banned) {
    throw new HTTPException(403, { message: `Account banned: ${user.ban_reason}` });
  }

  // Send OTP for login
  const result = await sendOtp(c.env, target, 'login');

  return c.json({
    success: true,
    message: `OTP sent to ${target}`,
    requires_2fa: user.two_factor_enabled === 1,
    expires_in: 600,
    debug_code: result.code, // Remove in production
  });
});

// POST /api/v1/auth/logout
auth.post('/logout', authMiddleware, async (c) => {
  const sessionId = c.get('sessionId');

  // Remove session from KV
  await c.env.KV.delete(`session:${sessionId}`);

  // Deactivate session in DB
  await c.env.DB.prepare('UPDATE sessions SET is_active = 0 WHERE id = ?').bind(sessionId).run();

  return c.json({ success: true, message: 'Logged out successfully' });
});

// POST /api/v1/auth/refresh
auth.post('/refresh', async (c) => {
  const body = await c.req.json<{ refresh_token: string }>();
  if (!body.refresh_token) {
    throw new HTTPException(400, { message: 'refresh_token required' });
  }

  const payload = await verifyJwt(body.refresh_token, c.env.JWT_SECRET);
  if (!payload || payload.type !== 'refresh') {
    throw new HTTPException(401, { message: 'Invalid or expired refresh token' });
  }

  // Check session exists
  const session = await c.env.DB.prepare(
    'SELECT id, user_id, is_active FROM sessions WHERE refresh_token = ? AND is_active = 1'
  ).bind(body.refresh_token).first<any>();

  if (!session) {
    throw new HTTPException(401, { message: 'Session not found or revoked' });
  }

  const now = Date.now();
  const expiryDays = parseInt(c.env.SESSION_EXPIRY_DAYS || '30');

  // Create new access token
  const newAccessToken = await createAccessToken(session.user_id, session.id, c.env.JWT_SECRET, expiryDays);
  const newExpiresAt = now + expiryDays * 24 * 60 * 60 * 1000;

  // Update session
  await c.env.DB.prepare('UPDATE sessions SET token = ?, expires_at = ? WHERE id = ?')
    .bind(newAccessToken, newExpiresAt, session.id).run();

  // Refresh KV session
  await c.env.KV.put(`session:${session.id}`, JSON.stringify({ userId: session.user_id, isActive: true }), {
    expirationTtl: expiryDays * 24 * 60 * 60,
  });

  return c.json({
    token: newAccessToken,
    expires_at: newExpiresAt,
  });
});

// GET /api/v1/auth/sessions
auth.get('/sessions', authMiddleware, async (c) => {
  const user = c.get('user');

  const sessions = await c.env.DB.prepare(
    `SELECT id, device_info, ip_address, created_at, expires_at, is_active 
     FROM sessions WHERE user_id = ? AND is_active = 1 AND expires_at > ?
     ORDER BY created_at DESC`
  ).bind(user.id, Date.now()).all();

  return c.json({
    sessions: sessions.results.map(s => ({
      ...s,
      device_info: s.device_info ? JSON.parse(s.device_info as string) : null,
      is_current: s.id === c.get('sessionId'),
    }))
  });
});

// DELETE /api/v1/auth/sessions/:id
auth.delete('/sessions/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');

  const session = await c.env.DB.prepare(
    'SELECT id FROM sessions WHERE id = ? AND user_id = ?'
  ).bind(sessionId, user.id).first();

  if (!session) {
    throw new HTTPException(404, { message: 'Session not found' });
  }

  await c.env.KV.delete(`session:${sessionId}`);
  await c.env.DB.prepare('UPDATE sessions SET is_active = 0 WHERE id = ?').bind(sessionId).run();

  return c.json({ success: true });
});

// POST /api/v1/auth/passkey/register
auth.post('/passkey/register', authMiddleware, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ credential: Record<string, unknown> }>();

  if (!body.credential) {
    throw new HTTPException(400, { message: 'credential required' });
  }

  await c.env.DB.prepare('UPDATE users SET passkey_credential = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(body.credential), Date.now(), user.id).run();

  return c.json({ success: true, message: 'Passkey registered' });
});

// POST /api/v1/auth/passkey/login
auth.post('/passkey/login', authRateLimit, async (c) => {
  const body = await c.req.json<{ credential: Record<string, unknown>; user_id: string }>();

  if (!body.credential || !body.user_id) {
    throw new HTTPException(400, { message: 'credential and user_id required' });
  }

  const user = await c.env.DB.prepare(
    'SELECT id, passkey_credential, is_banned, ban_reason FROM users WHERE id = ?'
  ).bind(body.user_id).first<any>();

  if (!user || !user.passkey_credential) {
    throw new HTTPException(404, { message: 'Passkey not registered for this user' });
  }

  if (user.is_banned) {
    throw new HTTPException(403, { message: `Account banned: ${user.ban_reason}` });
  }

  // TODO: Verify passkey credential against stored credential
  // This requires WebAuthn verification library

  const now = Date.now();
  const sessionId = generateSessionId();
  const expiryDays = parseInt(c.env.SESSION_EXPIRY_DAYS || '30');
  const accessToken = await createAccessToken(user.id, sessionId, c.env.JWT_SECRET, expiryDays);
  const refreshToken = await createRefreshToken(user.id, sessionId, c.env.JWT_SECRET, 90);

  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token, refresh_token, created_at, expires_at, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`
  ).bind(sessionId, user.id, accessToken, refreshToken, now, now + expiryDays * 24 * 60 * 60 * 1000).run();

  await c.env.KV.put(`session:${sessionId}`, JSON.stringify({ userId: user.id, isActive: true }), {
    expirationTtl: expiryDays * 24 * 60 * 60,
  });

  const fullUser = await c.env.DB.prepare(
    `SELECT id, username, phone, email, display_name, bio, avatar_url, status, is_verified, is_premium,
     is_bot, created_at, updated_at, last_seen FROM users WHERE id = ?`
  ).bind(user.id).first();

  return c.json({
    user: fullUser,
    token: accessToken,
    refresh_token: refreshToken,
    expires_at: now + expiryDays * 24 * 60 * 60 * 1000,
  });
});

export default auth;
