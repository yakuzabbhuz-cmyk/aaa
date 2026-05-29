// ============================================
// DL Chat - Password Hashing & Crypto Utils
// ============================================

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    passwordKey,
    256
  );

  const combined = new Uint8Array(salt.byteLength + hashBuffer.byteLength);
  combined.set(salt, 0);
  combined.set(new Uint8Array(hashBuffer), salt.byteLength);

  return arrayBufferToBase64(combined);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const combined = base64ToArrayBuffer(storedHash);
    const salt = combined.slice(0, 16);
    const storedHashBytes = combined.slice(16);

    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const hashBuffer = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      passwordKey,
      256
    );

    return timingSafeEqual(new Uint8Array(hashBuffer), new Uint8Array(storedHashBytes));
  } catch {
    return false;
  }
}

export function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export function generateOTP(digits: number = 6): string {
  const max = Math.pow(10, digits);
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % max).padStart(digits, '0');
}

export function generateBotToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const random = arrayBufferToBase64(bytes).replace(/[+/=]/g, '').slice(0, 32);
  return `dlbot_${random}`;
}

export function generateInviteCode(length: number = 10): string {
  const charset = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map(b => charset[b % charset.length])
    .join('');
}

export async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return arrayBufferToHex(sig);
}

export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return arrayBufferToHex(hashBuffer);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}
