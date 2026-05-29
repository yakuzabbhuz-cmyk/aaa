// ============================================
// DL Chat - CORS Middleware
// ============================================
import { MiddlewareHandler } from 'hono';
import type { Env } from '../types';

export const corsMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const origin = c.env.CORS_ORIGIN || '*';
  const requestOrigin = c.req.header('Origin') || '';

  // Allow configured origins
  const allowedOrigin = origin === '*' ? '*' : requestOrigin;

  c.header('Access-Control-Allow-Origin', allowedOrigin);
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Bot-Token, X-DL-Signature');
  c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Access-Control-Max-Age', '86400');

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  await next();
};
