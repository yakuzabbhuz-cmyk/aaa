// ============================================
// DL Chat - Invite Links API
// DEATH LEGION Team
// ============================================

import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';

type AppEnv = { Bindings: Env; Variables: Variables };
const invite = new Hono<AppEnv>();

invite.use('*', authMiddleware);

function generateInviteCode(length = 10): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// GET /invite - List all invite links for a chat/server
invite.get('/', async (c) => {
  const userId = c.get('userId');
  const { chatId, serverId } = c.req.query();

  if (!chatId && !serverId) return c.json({ error: 'chatId or serverId required' }, 400);

  const links = await c.env.DB.prepare(`
    SELECT il.*, u.username as created_by_username,
           COUNT(ij.id) as uses_count
    FROM invite_links il
    JOIN users u ON il.created_by = u.id
    LEFT JOIN invite_joins ij ON il.code = ij.invite_code
    WHERE il.${chatId ? 'chat_id' : 'server_id'} = ? AND il.revoked_at IS NULL
    GROUP BY il.id
    ORDER BY il.created_at DESC
  `).bind(chatId || serverId).all();

  return c.json({ success: true, links: links.results });
});

// POST /invite - Create invite link
invite.post('/', async (c) => {
  const userId = c.get('userId');
  const { chatId, serverId, maxUses = 0, expiresIn = 0, label } = await c.req.json();

  if (!chatId && !serverId) return c.json({ error: 'chatId or serverId required' }, 400);

  // Check admin permissions
  if (chatId) {
    const member = await c.env.DB.prepare(
      'SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NULL'
    ).bind(chatId, userId).first();
    if (!member) return c.json({ error: 'Not a member' }, 403);
  } else {
    const member = await c.env.DB.prepare(
      'SELECT role FROM server_members WHERE server_id = ? AND user_id = ? AND left_at IS NULL'
    ).bind(serverId, userId).first();
    if (!member) return c.json({ error: 'Not a member' }, 403);
  }

  const code = generateInviteCode();
  const now = new Date().toISOString();
  const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

  await c.env.DB.prepare(`
    INSERT INTO invite_links (id, code, chat_id, server_id, created_by, max_uses, expires_at, label, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), code,
    chatId || null, serverId || null,
    userId, maxUses, expiresAt, label || null, now
  ).run();

  const inviteUrl = `https://dl-chat-download.pages.dev/join/${code}`;

  return c.json({
    success: true,
    code,
    url: inviteUrl,
    maxUses,
    expiresAt,
    label
  }, 201);
});

// GET /invite/:code - Get invite link info (public - no auth)
invite.get('/:code', async (c) => {
  const { code } = c.req.param();

  const link = await c.env.DB.prepare(`
    SELECT il.*, 
           u.username as created_by_username,
           ch.name as chat_name, ch.type as chat_type, ch.description as chat_description,
           sv.name as server_name, sv.description as server_description, sv.icon_url as server_icon,
           COUNT(ij.id) as uses_count
    FROM invite_links il
    JOIN users u ON il.created_by = u.id
    LEFT JOIN chats ch ON il.chat_id = ch.id
    LEFT JOIN servers sv ON il.server_id = sv.id
    LEFT JOIN invite_joins ij ON il.code = ij.invite_code
    WHERE il.code = ? AND il.revoked_at IS NULL
    GROUP BY il.id
  `).bind(code).first();

  if (!link) return c.json({ error: 'Invalid or expired invite link' }, 404);

  // Check expiry
  if (link.expires_at && new Date(link.expires_at as string) < new Date()) {
    return c.json({ error: 'Invite link has expired' }, 410);
  }

  // Check max uses
  if ((link.max_uses as number) > 0 && (link.uses_count as number) >= (link.max_uses as number)) {
    return c.json({ error: 'Invite link has reached maximum uses' }, 410);
  }

  return c.json({
    success: true,
    code,
    createdBy: { username: link.created_by_username },
    target: link.chat_id ? {
      type: 'chat',
      id: link.chat_id,
      name: link.chat_name,
      chatType: link.chat_type,
      description: link.chat_description
    } : {
      type: 'server',
      id: link.server_id,
      name: link.server_name,
      description: link.server_description,
      iconUrl: link.server_icon
    },
    usesCount: link.uses_count,
    maxUses: link.max_uses,
    expiresAt: link.expires_at
  });
});

// POST /invite/:code/join - Join via invite link
invite.post('/:code/join', async (c) => {
  const { code } = c.req.param();
  const userId = c.get('userId');

  const link = await c.env.DB.prepare(`
    SELECT il.*, COUNT(ij.id) as uses_count
    FROM invite_links il
    LEFT JOIN invite_joins ij ON il.code = ij.invite_code
    WHERE il.code = ? AND il.revoked_at IS NULL
    GROUP BY il.id
  `).bind(code).first();

  if (!link) return c.json({ error: 'Invalid invite' }, 404);
  if (link.expires_at && new Date(link.expires_at as string) < new Date()) return c.json({ error: 'Expired' }, 410);
  if ((link.max_uses as number) > 0 && (link.uses_count as number) >= (link.max_uses as number)) return c.json({ error: 'Max uses reached' }, 410);

  const now = new Date().toISOString();

  if (link.chat_id) {
    // Check not already member
    const existing = await c.env.DB.prepare(
      'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NULL'
    ).bind(link.chat_id, userId).first();
    
    if (!existing) {
      await c.env.DB.prepare(
        'INSERT INTO chat_members (id, chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), link.chat_id, userId, 'member', now).run();
    }
  } else if (link.server_id) {
    const existing = await c.env.DB.prepare(
      'SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ? AND left_at IS NULL'
    ).bind(link.server_id, userId).first();
    
    if (!existing) {
      await c.env.DB.prepare(
        'INSERT INTO server_members (id, server_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), link.server_id, userId, 'member', now).run();
    }
  }

  // Record the join
  await c.env.DB.prepare(
    'INSERT INTO invite_joins (id, invite_code, user_id, joined_at) VALUES (?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), code, userId, now).run();

  return c.json({
    success: true,
    joined: true,
    targetType: link.chat_id ? 'chat' : 'server',
    targetId: link.chat_id || link.server_id
  });
});

// DELETE /invite/:code - Revoke invite link
invite.delete('/:code', async (c) => {
  const { code } = c.req.param();
  const userId = c.get('userId');

  const link = await c.env.DB.prepare(
    'SELECT * FROM invite_links WHERE code = ? AND created_by = ?'
  ).bind(code, userId).first();
  
  if (!link) return c.json({ error: 'Not found or not authorized' }, 404);

  await c.env.DB.prepare(
    'UPDATE invite_links SET revoked_at = ? WHERE code = ?'
  ).bind(new Date().toISOString(), code).run();

  return c.json({ success: true });
});

export default invite;
