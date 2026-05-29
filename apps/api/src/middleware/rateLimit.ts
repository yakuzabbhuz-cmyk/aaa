// ============================================
// DL Chat - Rate Limiting Middleware
// ============================================
import { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, Variables } from '../types';

type AppEnv = { Bindings: Env; Variables: Variables };

function getClientId(c: any): string {
  const user = c.get('user');
  if (user) return `user:${user.id}`;

  const ip = c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0].trim() ||
    'unknown';
  return `ip:${ip}`;
}

export function createRateLimiter(
  maxRequests: number,
  windowSeconds: number = 60,
  prefix: string = 'rl'
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const clientId = getClientId(c);
    const key = `${prefix}:${clientId}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;

    const current = await c.env.KV.get(key);
    const count = current ? parseInt(current) + 1 : 1;

    if (count > maxRequests) {
      c.header('X-RateLimit-Limit', String(maxRequests));
      c.header('X-RateLimit-Remaining', '0');
      c.header('Retry-After', String(windowSeconds));
      throw new HTTPException(429, {
        message: `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowSeconds} seconds.`,
      });
    }

    await c.env.KV.put(key, String(count), { expirationTtl: windowSeconds * 2 });

    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(maxRequests - count));

    await next();
  };
}

export const authRateLimit = createRateLimiter(60, 60, 'rl:auth');
export const apiRateLimit = createRateLimiter(1000, 60, 'rl:api');
export const uploadRateLimit = createRateLimiter(30, 60, 'rl:upload');
export const botApiRateLimit = createRateLimiter(3000, 60, 'rl:bot');
