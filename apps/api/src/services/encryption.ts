// ============================================
// DL Chat - E2E Encryption Key Management
// ============================================
import type { Env } from '../types';

export async function storePublicKey(
  env: Env,
  userId: string,
  publicKey: string
): Promise<void> {
  await env.DB.prepare(
    'UPDATE users SET public_key = ?, updated_at = ? WHERE id = ?'
  ).bind(publicKey, Date.now(), userId).run();

  // Cache in KV for fast lookup
  await env.KV.put(`pubkey:${userId}`, publicKey, {
    expirationTtl: 7 * 24 * 60 * 60, // 7 days
  });
}

export async function getPublicKey(
  env: Env,
  userId: string
): Promise<string | null> {
  // Try KV cache first
  const cached = await env.KV.get(`pubkey:${userId}`);
  if (cached) return cached;

  // Fall back to DB
  const user = await env.DB.prepare(
    'SELECT public_key FROM users WHERE id = ?'
  ).bind(userId).first<{ public_key: string }>();

  if (user?.public_key) {
    await env.KV.put(`pubkey:${userId}`, user.public_key, {
      expirationTtl: 7 * 24 * 60 * 60,
    });
    return user.public_key;
  }

  return null;
}

export async function getPublicKeys(
  env: Env,
  userIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  // Batch KV lookups
  const kvResults = await Promise.all(
    userIds.map(id => env.KV.get(`pubkey:${id}`).then(key => ({ id, key })))
  );

  const missingIds: string[] = [];
  for (const { id, key } of kvResults) {
    if (key) {
      result.set(id, key);
    } else {
      missingIds.push(id);
    }
  }

  if (missingIds.length > 0) {
    // Batch DB query for missing keys
    const placeholders = missingIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(
      `SELECT id, public_key FROM users WHERE id IN (${placeholders}) AND public_key IS NOT NULL`
    ).bind(...missingIds).all<{ id: string; public_key: string }>();

    for (const row of rows.results) {
      result.set(row.id, row.public_key);
      await env.KV.put(`pubkey:${row.id}`, row.public_key, {
        expirationTtl: 7 * 24 * 60 * 60,
      });
    }
  }

  return result;
}
