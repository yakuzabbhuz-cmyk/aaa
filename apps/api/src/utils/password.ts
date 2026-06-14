// ============================================
// DL Chat - Password Hashing (PBKDF2)
// Uses Web Crypto API — available in Cloudflare Workers
// ============================================

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey('raw', data, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
    key,
    256
  );

  const hashArray = Array.from(new Uint8Array(bits));
  const saltArray = Array.from(salt);
  return (
    saltArray.map(b => b.toString(16).padStart(2, '0')).join('') +
    ':' +
    hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  );
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [saltHex, hashHex] = stored.split(':');
    if (!saltHex || !hashHex) return false;

    const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const encoder = new TextEncoder();
    const data = encoder.encode(password);

    const key = await crypto.subtle.importKey('raw', data, 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
      key,
      256
    );

    const hashArray = Array.from(new Uint8Array(bits));
    const newHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return newHash === hashHex;
  } catch {
    return false;
  }
}
