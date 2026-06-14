// ============================================
// DL Chat API - Environment & Binding Types
// DEATH LEGION Team
// ============================================

import { ChatRoom } from './durable-objects/ChatRoom';
import { CallRoom } from './durable-objects/CallRoom';
import { Presence } from './durable-objects/Presence';

export interface Env {
  // D1 Database
  DB: D1Database;

  // KV Namespace for sessions and caching
  KV: KVNamespace;

  // R2 Bucket for file storage (optional - enable R2 in Cloudflare Dashboard)
  R2?: R2Bucket;

  // Cloudflare AI (optional)
  AI?: Ai;
  ADMIN_SECRET?: string;

  // Durable Objects
  CHAT_ROOM: DurableObjectNamespace;
  CALL_ROOM: DurableObjectNamespace;
  PRESENCE: DurableObjectNamespace;

  // Environment Variables
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  APP_NAME: string;
  APP_VERSION: string;
  TEAM_NAME: string;
  MAX_FILE_SIZE_IMAGE: string;
  MAX_FILE_SIZE_VIDEO: string;
  MAX_FILE_SIZE_DOC: string;
  OTP_EXPIRY_MINUTES: string;
  SESSION_EXPIRY_DAYS: string;
  REFRESH_TOKEN_EXPIRY_DAYS: string;
  RATE_LIMIT_AUTH: string;
  RATE_LIMIT_API: string;
  // Email provider (Resend.com)
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  // SMS provider (Twilio)
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_PHONE_NUMBER?: string;
}

export interface AuthUser {
  id: string;
  username?: string;
  phone?: string;
  email?: string;
  display_name: string;
  is_verified: boolean;
  is_premium: boolean;
  is_bot: boolean;
  is_banned: boolean;
  two_factor_enabled: boolean;
  public_key?: string;
}

export interface JwtPayload {
  sub: string;     // user id
  iat: number;     // issued at
  exp: number;     // expires at
  jti: string;     // JWT ID (session id)
  type: 'access' | 'refresh';
}

// Context variables passed through Hono middleware
export type Variables = {
  user: AuthUser;
  sessionId: string;
  jti: string;
};

export { ChatRoom, CallRoom, Presence };
