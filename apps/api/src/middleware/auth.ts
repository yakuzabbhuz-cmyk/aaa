// ============================================
// DL Chat - Auth Middleware
// ============================================
import { MiddlewareHandler, Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables, AuthUser } from '../types';
import { verifyJwt } from '../utils/jwt';

type AppEnv = { Bindings: Env; Variables: Variables };

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice(7);
  const payload = await verifyJwt(token, c.env.JWT_SECRET);

  if (!payload || payload.type !== 'access') {
    throw new HTTPException(401, { message: 'Invalid or expired token' });
  }

  // Check session in KV
  const sessionKey = `session:${payload.jti}`;
  const sessionData = await c.env.KV.get(sessionKey);
  if (!sessionData) {
    throw new HTTPException(401, { message: 'Session expired or revoked' });
  }

  // Get user from D1
  const user = await c.env.DB.prepare(
    'SELECT id, username, phone, email, display_name, is_verified, is_premium, is_bot, is_banned, two_factor_enabled, public_key FROM users WHERE id = ? AND is_banned = 0'
  ).bind(payload.sub).first<AuthUser>();

  if (!user) {
    throw new HTTPException(401, { message: 'User not found or banned' });
  }

  c.set('user', user);
  c.set('sessionId', payload.jti);
  c.set('jti', payload.jti);

  await next();
};

export const optionalAuthMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyJwt(token, c.env.JWT_SECRET);

    if (payload && payload.type === 'access') {
      const sessionKey = `session:${payload.jti}`;
      const sessionData = await c.env.KV.get(sessionKey);
      if (sessionData) {
        const user = await c.env.DB.prepare(
          'SELECT id, username, phone, email, display_name, is_verified, is_premium, is_bot, is_banned, two_factor_enabled, public_key FROM users WHERE id = ?'
        ).bind(payload.sub).first<AuthUser>();

        if (user && !user.is_banned) {
          c.set('user', user);
          c.set('sessionId', payload.jti);
          c.set('jti', payload.jti);
        }
      }
    }
  }
  await next();
};

export const adminMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const adminRecord = await c.env.DB.prepare(
    'SELECT role, permissions FROM admin_users WHERE user_id = ?'
  ).bind(user.id).first<{ role: string; permissions: string }>();

  if (!adminRecord) {
    throw new HTTPException(403, { message: 'Admin access required' });
  }

  // Attach admin info to context
  c.set('user', { ...user, adminRole: adminRecord.role, adminPermissions: JSON.parse(adminRecord.permissions || '{}') } as any);
  await next();
};

export const botAuthMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const botToken = c.req.header('X-Bot-Token');
  if (!botToken || !botToken.startsWith('dlbot_')) {
    throw new HTTPException(401, { message: 'Invalid bot token' });
  }

  const bot = await c.env.DB.prepare(
    'SELECT id, username, display_name, is_verified, is_premium, is_bot, is_banned FROM users WHERE bot_token = ? AND is_bot = 1 AND is_banned = 0'
  ).bind(botToken).first<AuthUser>();

  if (!bot) {
    throw new HTTPException(401, { message: 'Invalid bot token' });
  }

  c.set('user', bot);
  c.set('sessionId', 'bot');
  c.set('jti', 'bot');
  await next();
};
