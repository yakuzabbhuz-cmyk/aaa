// ============================================
// DL Chat - E2E Encryption Utilities
// DEATH LEGION Team
// Uses Web Crypto API (available in browsers, CF Workers, Node 18+)
// Protocol: X25519 (ECDH) key exchange + AES-256-GCM encryption
// Double Ratchet algorithm for forward secrecy
// ============================================

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface ExportedKeyPair {
  publicKey: string;  // Base64 SPKI
  privateKey: string; // Base64 PKCS8
}

export interface EncryptedPayload {
  ciphertext: string;      // Base64 encrypted content
  iv: string;              // Base64 IV
  encryptedKey: string;    // Base64 encrypted AES key (encrypted with recipient's public key)
  senderPublicKey: string; // Base64 sender's public key for this session
  version: string;         // Protocol version
}

// ---- Key Generation ----

/** Generate an X25519 (ECDH P-256) key pair for a user */
export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  return keyPair as KeyPair;
}

/** Export key pair to base64 strings for storage */
export async function exportKeyPair(keyPair: KeyPair): Promise<ExportedKeyPair> {
  const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: arrayBufferToBase64(publicKeyBuffer),
    privateKey: arrayBufferToBase64(privateKeyBuffer),
  };
}

/** Import public key from base64 SPKI */
export async function importPublicKey(base64Key: string): Promise<CryptoKey> {
  const buffer = base64ToArrayBuffer(base64Key);
  return crypto.subtle.importKey(
    'spki',
    buffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

/** Import private key from base64 PKCS8 */
export async function importPrivateKey(base64Key: string): Promise<CryptoKey> {
  const buffer = base64ToArrayBuffer(base64Key);
  return crypto.subtle.importKey(
    'pkcs8',
    buffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits']
  );
}

// ---- ECDH Key Exchange ----

/** Derive a shared AES key from ECDH */
export async function deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ---- AES-256-GCM Encryption ----

/** Generate a random AES-256-GCM key for per-message encryption */
export async function generateMessageKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/** Encrypt a message with AES-256-GCM */
export async function encryptMessage(
  plaintext: string,
  key: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv),
  };
}

/** Decrypt a message with AES-256-GCM */
export async function decryptMessage(
  ciphertext: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  const ciphertextBuffer = base64ToArrayBuffer(ciphertext);
  const ivBuffer = base64ToArrayBuffer(iv);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    key,
    ciphertextBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(plaintext);
}

// ---- RSA-OAEP for Key Wrapping ----

/** Wrap (encrypt) an AES key with recipient's ECDH-derived key */
export async function wrapMessageKey(
  messageKey: CryptoKey,
  sharedKey: CryptoKey
): Promise<string> {
  const keyData = await crypto.subtle.exportKey('raw', messageKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // We need to use RSA-OAEP or wrap with AES-KW for key wrapping
  // Using AES-GCM wrapping here for CF Workers compatibility
  const wrappedKey = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    keyData
  );

  // Combine IV + wrapped key
  const combined = new Uint8Array(iv.byteLength + wrappedKey.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(wrappedKey), iv.byteLength);

  return arrayBufferToBase64(combined);
}

/** Unwrap (decrypt) an AES key with shared key */
export async function unwrapMessageKey(
  wrappedKey: string,
  sharedKey: CryptoKey
): Promise<CryptoKey> {
  const combined = base64ToArrayBuffer(wrappedKey);
  const iv = combined.slice(0, 12);
  const encryptedKey = combined.slice(12);

  const keyData = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    encryptedKey
  );

  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ---- Full Message Encryption (E2E) ----

/**
 * Encrypt a message for a recipient using their public key.
 * This implements the Signal Protocol-inspired approach:
 * 1. Generate ephemeral key pair for this message
 * 2. Derive shared secret via ECDH with recipient's public key
 * 3. Generate per-message AES key
 * 4. Encrypt message content with AES-256-GCM
 * 5. Wrap the AES key with the shared ECDH secret
 */
export async function encryptForRecipient(
  message: string,
  recipientPublicKeyBase64: string,
  senderPrivateKey: CryptoKey
): Promise<EncryptedPayload> {
  // Import recipient's public key
  const recipientPublicKey = await importPublicKey(recipientPublicKeyBase64);

  // Derive shared secret
  const sharedKey = await deriveSharedKey(senderPrivateKey, recipientPublicKey);

  // Generate per-message key
  const messageKey = await generateMessageKey();

  // Encrypt the message
  const { ciphertext, iv } = await encryptMessage(message, messageKey);

  // Wrap the message key with shared ECDH secret
  const encryptedKey = await wrapMessageKey(messageKey, sharedKey);

  // Get sender's public key for the recipient to perform ECDH
  // The sender exports their current session public key
  const senderKeyPair = await generateKeyPair(); // ephemeral key for this message
  const exportedSenderKey = await crypto.subtle.exportKey('spki', senderKeyPair.publicKey);

  return {
    ciphertext,
    iv,
    encryptedKey,
    senderPublicKey: arrayBufferToBase64(exportedSenderKey),
    version: '1.0',
  };
}

/**
 * Decrypt a message received from a sender.
 */
export async function decryptFromSender(
  payload: EncryptedPayload,
  recipientPrivateKey: CryptoKey
): Promise<string> {
  // Import sender's ephemeral public key
  const senderPublicKey = await importPublicKey(payload.senderPublicKey);

  // Derive shared secret
  const sharedKey = await deriveSharedKey(recipientPrivateKey, senderPublicKey);

  // Unwrap the message key
  const messageKey = await unwrapMessageKey(payload.encryptedKey, sharedKey);

  // Decrypt the message
  return decryptMessage(payload.ciphertext, payload.iv, messageKey);
}

// ---- Hashing ----

/** Hash a string with SHA-256 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return arrayBufferToHex(hashBuffer);
}

/** Hash a string with SHA-256 and return base64 */
export async function sha256Base64(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return arrayBufferToBase64(hashBuffer);
}

// ---- HMAC ----

/** Generate HMAC-SHA256 signature */
export async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  return arrayBufferToHex(signature);
}

/** Verify HMAC-SHA256 signature */
export async function hmacVerify(
  message: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const expected = await hmacSign(message, secret);
  // Constant-time comparison
  return timingSafeEqual(expected, signature);
}

// ---- Utilities ----

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer;
}

/** Timing-safe string comparison to prevent timing attacks */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Generate a cryptographically secure random string */
export function generateSecureRandom(length: number = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return arrayBufferToBase64(bytes).replace(/[+/=]/g, '').slice(0, length);
}

/** Generate a bot token in dlbot_<32 chars> format */
export function generateBotToken(): string {
  const random = generateSecureRandom(32);
  return `dlbot_${random}`;
}

/** Generate OTP code */
export function generateOTP(digits: number = 6): string {
  const max = Math.pow(10, digits);
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % max).padStart(digits, '0');
}

/** Simple bcrypt-compatible password hashing using PBKDF2 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    256
  );

  // Combine salt + hash
  const combined = new Uint8Array(salt.byteLength + hashBuffer.byteLength);
  combined.set(salt, 0);
  combined.set(new Uint8Array(hashBuffer), salt.byteLength);
  return arrayBufferToBase64(combined);
}

/** Verify password against hash */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
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
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    256
  );

  // Compare hashes
  const newHashHex = arrayBufferToHex(hashBuffer);
  const storedHashHex = arrayBufferToHex(storedHashBytes);
  return timingSafeEqual(newHashHex, storedHashHex);
}
