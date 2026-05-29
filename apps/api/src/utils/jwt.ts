// ============================================
// DL Chat - JWT Utilities
// ============================================
import type { JwtPayload } from '../types';

function base64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlDecode(str: string): string {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signJwt(
  payload: Omit<JwtPayload, 'iat'>,
  secret: string
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
  };

  const headerEncoded = base64urlEncode(JSON.stringify(header));
  const payloadEncoded = base64urlEncode(JSON.stringify(fullPayload));
  const signingInput = `${headerEncoded}.${payloadEncoded}`;

  const key = await getHmacKey(secret);
  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));

  const signature = base64urlEncode(
    String.fromCharCode(...new Uint8Array(signatureBuffer))
  );

  return `${signingInput}.${signature}`;
}

export async function verifyJwt(
  token: string,
  secret: string
): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
    const signingInput = `${headerEncoded}.${payloadEncoded}`;

    const key = await getHmacKey(secret);
    const encoder = new TextEncoder();

    // Decode signature
    const signature = Uint8Array.from(
      base64urlDecode(signatureEncoded),
      c => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      encoder.encode(signingInput)
    );

    if (!valid) return null;

    const payload: JwtPayload = JSON.parse(base64urlDecode(payloadEncoded));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return null;

    return payload;
  } catch {
    return null;
  }
}

export function generateSessionId(): string {
  return crypto.randomUUID();
}

export async function createAccessToken(
  userId: string,
  sessionId: string,
  secret: string,
  expiryDays: number = 30
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expiryDays * 24 * 60 * 60;
  return signJwt(
    { sub: userId, exp, jti: sessionId, type: 'access' },
    secret
  );
}

export async function createRefreshToken(
  userId: string,
  sessionId: string,
  secret: string,
  expiryDays: number = 90
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expiryDays * 24 * 60 * 60;
  return signJwt(
    { sub: userId, exp, jti: sessionId, type: 'refresh' },
    secret
  );
}
