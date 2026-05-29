import { Hono } from 'hono';
import { verify } from 'hono/jwt';

const bans = new Hono<{ Bindings: CloudflareBindings }>();

// ─── Auth Middleware ──────────────────────────────────────────────────────────
async function requireAuth(c: any, next: any) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  try {
    const token = authHeader.slice(7);
    const payload = await verify(token, c.env.JWT_SECRET);
    c.set('userId', payload.sub as string);
    c.set('userRole', payload.role as string);
    return await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
}

async function requireAdmin(c: any, next: any) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  try {
    const token = authHeader.slice(7);
    const payload = await verify(token, c.env.JWT_SECRET);
    c.set('userId', payload.sub as string);
    c.set('userRole', payload.role as string);
    const role = payload.role as string;
    if (!['admin', 'moderator', 'super_admin'].includes(role)) {
      return c.json({ error: 'Admin access required' }, 403);
    }
    return await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
}

// ─── BAN TYPES ────────────────────────────────────────────────────────────────
// Tier 1: Warning (no restriction)
// Tier 2: Mute (can read but not send messages)
// Tier 3: Partial Ban (restricted from certain channels/servers)
// Tier 4: Full Ban (completely banned from platform)
// Tier 5: IP Ban (banned by IP address)

// ─── GET /bans - List all active bans (admin) ─────────────────────────────────
bans.get('/', requireAdmin, async (c) => {
  const userId = c.get('userId');
  const { page = '1', limit = '50', type, status = 'active', search } = c.req.query();
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 100);
  const offset = (pageNum - 1) * limitNum;

  let query = `
    SELECT b.*, 
           u.username as banned_username, u.display_name as banned_display_name, u.avatar_url as banned_avatar,
           a.username as admin_username, a.display_name as admin_display_name
    FROM bans b
    LEFT JOIN users u ON b.user_id = u.id
    LEFT JOIN users a ON b.banned_by = a.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (status === 'active') {
    query += ` AND b.is_active = 1 AND (b.expires_at IS NULL OR b.expires_at > datetime('now'))`;
  } else if (status === 'expired') {
    query += ` AND (b.is_active = 0 OR (b.expires_at IS NOT NULL AND b.expires_at <= datetime('now')))`;
  } else if (status === 'all') {
    // no filter
  }

  if (type) {
    query += ` AND b.ban_type = ?`;
    params.push(type);
  }

  if (search) {
    query += ` AND (u.username LIKE ? OR u.display_name LIKE ? OR b.reason LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ` ORDER BY b.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limitNum, offset);

  const [bansResult, countResult] = await Promise.all([
    c.env.DB.prepare(query).bind(...params).all(),
    c.env.DB.prepare(`
      SELECT COUNT(*) as total FROM bans b
      LEFT JOIN users u ON b.user_id = u.id
      WHERE b.is_active = 1 AND (b.expires_at IS NULL OR b.expires_at > datetime('now'))
    `).first()
  ]);

  return c.json({
    bans: bansResult.results,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: (countResult as any)?.total || 0,
      pages: Math.ceil(((countResult as any)?.total || 0) / limitNum)
    }
  });
});

// ─── GET /bans/user/:userId - Get bans for a specific user ───────────────────
bans.get('/user/:userId', requireAdmin, async (c) => {
  const targetUserId = c.req.param('userId');

  const [activeBans, banHistory] = await Promise.all([
    c.env.DB.prepare(`
      SELECT b.*, a.username as admin_username
      FROM bans b
      LEFT JOIN users a ON b.banned_by = a.id
      WHERE b.user_id = ? AND b.is_active = 1 
        AND (b.expires_at IS NULL OR b.expires_at > datetime('now'))
      ORDER BY b.created_at DESC
    `).bind(targetUserId).all(),
    c.env.DB.prepare(`
      SELECT b.*, a.username as admin_username,
             ua.username as unbanned_by_username
      FROM bans b
      LEFT JOIN users a ON b.banned_by = a.id
      LEFT JOIN users ua ON b.unbanned_by = ua.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
      LIMIT 50
    `).bind(targetUserId).all()
  ]);

  const user = await c.env.DB.prepare(
    'SELECT id, username, display_name, avatar_url, created_at, ban_count FROM users WHERE id = ?'
  ).bind(targetUserId).first();

  return c.json({
    user,
    active_bans: activeBans.results,
    ban_history: banHistory.results
  });
});

// ─── GET /bans/check - Check if current user is banned ───────────────────────
bans.get('/check', requireAuth, async (c) => {
  const userId = c.get('userId');
  const { context_type, context_id } = c.req.query(); // server, channel, global

  // Check global ban first
  const globalBan = await c.env.DB.prepare(`
    SELECT * FROM bans 
    WHERE user_id = ? AND ban_type IN ('full', 'ip') AND is_active = 1
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    ORDER BY ban_type DESC LIMIT 1
  `).bind(userId).first();

  if (globalBan) {
    return c.json({
      is_banned: true,
      ban_type: 'global',
      ban: globalBan,
      can_appeal: (globalBan as any).allow_appeal
    });
  }

  // Check mute
  const mute = await c.env.DB.prepare(`
    SELECT * FROM bans 
    WHERE user_id = ? AND ban_type = 'mute' AND is_active = 1
      AND (context_type = ? OR context_type = 'global')
      AND (context_id = ? OR context_type = 'global')
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    LIMIT 1
  `).bind(userId, context_type || 'global', context_id || '').first();

  if (mute) {
    return c.json({
      is_banned: false,
      is_muted: true,
      ban_type: 'mute',
      ban: mute,
      can_appeal: (mute as any).allow_appeal
    });
  }

  // Check server/channel ban
  if (context_type && context_id) {
    const contextBan = await c.env.DB.prepare(`
      SELECT * FROM bans 
      WHERE user_id = ? AND ban_type = 'partial' AND is_active = 1
        AND context_type = ? AND context_id = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      LIMIT 1
    `).bind(userId, context_type, context_id).first();

    if (contextBan) {
      return c.json({
        is_banned: true,
        ban_type: 'partial',
        ban: contextBan,
        can_appeal: (contextBan as any).allow_appeal
      });
    }
  }

  return c.json({ is_banned: false, is_muted: false });
});

// ─── POST /bans - Issue a new ban ─────────────────────────────────────────────
bans.post('/', requireAdmin, async (c) => {
  const adminId = c.get('userId');
  const adminRole = c.get('userRole');
  const body = await c.req.json();

  const {
    user_id,
    ban_type = 'full',       // warning, mute, partial, full, ip
    reason,
    duration_hours,           // null = permanent
    context_type,             // global, server, channel
    context_id,               // server/channel ID for partial bans
    ip_address,               // for IP bans
    internal_notes,
    allow_appeal = true,
    notify_user = true,
    evidence_urls = []
  } = body;

  if (!user_id || !reason) {
    return c.json({ error: 'user_id and reason are required' }, 400);
  }

  // Super admin check for permanent full bans
  if (ban_type === 'full' && !duration_hours && adminRole !== 'super_admin' && adminRole !== 'admin') {
    return c.json({ error: 'Only admins can issue permanent bans' }, 403);
  }

  // Check if target is an admin (can't ban admins)
  const targetUser = await c.env.DB.prepare(
    'SELECT id, username, role FROM users WHERE id = ?'
  ).bind(user_id).first();

  if (!targetUser) return c.json({ error: 'User not found' }, 404);
  if (['admin', 'super_admin'].includes((targetUser as any).role) && adminRole !== 'super_admin') {
    return c.json({ error: 'Cannot ban admin users' }, 403);
  }

  const banId = crypto.randomUUID();
  const expiresAt = duration_hours
    ? new Date(Date.now() + duration_hours * 3600000).toISOString()
    : null;

  // If this is a full ban, deactivate any existing partial/mute bans
  if (ban_type === 'full') {
    await c.env.DB.prepare(
      `UPDATE bans SET is_active = 0, updated_at = datetime('now') WHERE user_id = ? AND is_active = 1`
    ).bind(user_id).run();
  }

  await c.env.DB.prepare(`
    INSERT INTO bans (
      id, user_id, banned_by, ban_type, reason, internal_notes,
      context_type, context_id, ip_address, expires_at, 
      allow_appeal, is_active, evidence_urls, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
  `).bind(
    banId, user_id, adminId, ban_type, reason, internal_notes || null,
    context_type || 'global', context_id || null, ip_address || null,
    expiresAt, allow_appeal ? 1 : 0,
    JSON.stringify(evidence_urls)
  ).run();

  // Increment ban count on user
  await c.env.DB.prepare(
    `UPDATE users SET ban_count = COALESCE(ban_count, 0) + 1, 
     is_banned = CASE WHEN ? IN ('full', 'ip') THEN 1 ELSE is_banned END,
     updated_at = datetime('now') WHERE id = ?`
  ).bind(ban_type, user_id).run();

  // Log admin action
  await c.env.DB.prepare(`
    INSERT INTO admin_audit_log (id, admin_id, action, target_type, target_id, details, created_at)
    VALUES (?, ?, 'ban_user', 'user', ?, ?, datetime('now'))
  `).bind(
    crypto.randomUUID(), adminId, user_id,
    JSON.stringify({ ban_type, reason, duration_hours, ban_id: banId })
  ).run().catch(() => {}); // audit log is optional

  // Notify user if enabled
  if (notify_user && ban_type !== 'warning') {
    const notifMsg = duration_hours
      ? `Your account has been ${ban_type === 'mute' ? 'muted' : 'banned'} for ${duration_hours} hours. Reason: ${reason}`
      : `Your account has been permanently ${ban_type === 'mute' ? 'muted' : 'banned'}. Reason: ${reason}`;

    await c.env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, data, created_at)
      VALUES (?, ?, 'ban', ?, ?, ?, datetime('now'))
    `).bind(
      crypto.randomUUID(), user_id,
      `Account ${ban_type === 'mute' ? 'Muted' : 'Banned'}`,
      notifMsg,
      JSON.stringify({ ban_id: banId, allow_appeal, appeal_url: 'https://dl-chat-download.pages.dev/appeal' })
    ).run().catch(() => {});
  }

  return c.json({
    success: true,
    ban_id: banId,
    message: `User ${(targetUser as any).username} has been ${ban_type === 'warning' ? 'warned' : ban_type === 'mute' ? 'muted' : 'banned'}`,
    expires_at: expiresAt,
    allow_appeal
  }, 201);
});

// ─── PATCH /bans/:banId - Update a ban ───────────────────────────────────────
bans.patch('/:banId', requireAdmin, async (c) => {
  const adminId = c.get('userId');
  const banId = c.req.param('banId');
  const body = await c.req.json();
  const { reason, duration_hours, internal_notes, allow_appeal } = body;

  const ban = await c.env.DB.prepare('SELECT * FROM bans WHERE id = ?').bind(banId).first();
  if (!ban) return c.json({ error: 'Ban not found' }, 404);

  const expiresAt = duration_hours !== undefined
    ? (duration_hours === null ? null : new Date(Date.now() + duration_hours * 3600000).toISOString())
    : (ban as any).expires_at;

  await c.env.DB.prepare(`
    UPDATE bans SET 
      reason = COALESCE(?, reason),
      internal_notes = COALESCE(?, internal_notes),
      expires_at = ?,
      allow_appeal = COALESCE(?, allow_appeal),
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(reason || null, internal_notes || null, expiresAt, allow_appeal !== undefined ? (allow_appeal ? 1 : 0) : null, banId).run();

  return c.json({ success: true, message: 'Ban updated' });
});

// ─── DELETE /bans/:banId - Unban user ─────────────────────────────────────────
bans.delete('/:banId', requireAdmin, async (c) => {
  const adminId = c.get('userId');
  const banId = c.req.param('banId');
  const { reason } = await c.req.json().catch(() => ({ reason: 'Manual unban by admin' }));

  const ban = await c.env.DB.prepare('SELECT * FROM bans WHERE id = ?').bind(banId).first();
  if (!ban) return c.json({ error: 'Ban not found' }, 404);

  await c.env.DB.prepare(`
    UPDATE bans SET 
      is_active = 0, 
      unbanned_by = ?,
      unban_reason = ?,
      unbanned_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(adminId, reason, banId).run();

  // Update user ban status
  const remainingBans = await c.env.DB.prepare(`
    SELECT COUNT(*) as cnt FROM bans 
    WHERE user_id = ? AND ban_type IN ('full', 'ip') AND is_active = 1
      AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).bind((ban as any).user_id).first();

  if ((remainingBans as any)?.cnt === 0) {
    await c.env.DB.prepare(
      `UPDATE users SET is_banned = 0, updated_at = datetime('now') WHERE id = ?`
    ).bind((ban as any).user_id).run();
  }

  // Log admin action
  await c.env.DB.prepare(`
    INSERT INTO admin_audit_log (id, admin_id, action, target_type, target_id, details, created_at)
    VALUES (?, ?, 'unban_user', 'user', ?, ?, datetime('now'))
  `).bind(
    crypto.randomUUID(), adminId, (ban as any).user_id,
    JSON.stringify({ ban_id: banId, reason })
  ).run().catch(() => {});

  return c.json({ success: true, message: 'User unbanned successfully' });
});

// ─── POST /bans/:banId/extend - Extend ban duration ──────────────────────────
bans.post('/:banId/extend', requireAdmin, async (c) => {
  const adminId = c.get('userId');
  const banId = c.req.param('banId');
  const { additional_hours, reason } = await c.req.json();

  if (!additional_hours || additional_hours < 1) {
    return c.json({ error: 'additional_hours required (min 1)' }, 400);
  }

  const ban = await c.env.DB.prepare('SELECT * FROM bans WHERE id = ? AND is_active = 1').bind(banId).first();
  if (!ban) return c.json({ error: 'Active ban not found' }, 404);

  const currentExpiry = (ban as any).expires_at ? new Date((ban as any).expires_at) : new Date();
  const newExpiry = new Date(Math.max(currentExpiry.getTime(), Date.now()) + additional_hours * 3600000);

  await c.env.DB.prepare(`
    UPDATE bans SET expires_at = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(newExpiry.toISOString(), banId).run();

  return c.json({
    success: true,
    message: `Ban extended by ${additional_hours} hours`,
    new_expires_at: newExpiry.toISOString()
  });
});

// ─── GET /bans/stats - Ban statistics ─────────────────────────────────────────
bans.get('/stats', requireAdmin, async (c) => {
  const [totals, byType, recentBans, topMods] = await Promise.all([
    c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total_bans,
        SUM(CASE WHEN is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now')) THEN 1 ELSE 0 END) as active_bans,
        SUM(CASE WHEN ban_type = 'full' AND is_active = 1 THEN 1 ELSE 0 END) as full_bans,
        SUM(CASE WHEN ban_type = 'mute' AND is_active = 1 THEN 1 ELSE 0 END) as active_mutes,
        SUM(CASE WHEN ban_type = 'ip' AND is_active = 1 THEN 1 ELSE 0 END) as ip_bans,
        SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as bans_this_week,
        SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) as bans_this_month
      FROM bans
    `).first(),
    c.env.DB.prepare(`
      SELECT ban_type, COUNT(*) as count FROM bans 
      WHERE is_active = 1 GROUP BY ban_type ORDER BY count DESC
    `).all(),
    c.env.DB.prepare(`
      SELECT b.*, u.username, a.username as admin_username
      FROM bans b
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN users a ON b.banned_by = a.id
      ORDER BY b.created_at DESC LIMIT 10
    `).all(),
    c.env.DB.prepare(`
      SELECT a.username, a.display_name, COUNT(*) as bans_issued
      FROM bans b JOIN users a ON b.banned_by = a.id
      WHERE b.created_at >= datetime('now', '-30 days')
      GROUP BY b.banned_by ORDER BY bans_issued DESC LIMIT 10
    `).all()
  ]);

  return c.json({
    totals,
    by_type: byType.results,
    recent_bans: recentBans.results,
    top_moderators: topMods.results
  });
});

// ─── POST /bans/bulk - Bulk ban/unban operations ─────────────────────────────
bans.post('/bulk', requireAdmin, async (c) => {
  const adminId = c.get('userId');
  const adminRole = c.get('userRole');
  const { action, user_ids, reason, ban_type = 'full', duration_hours } = await c.req.json();

  if (!['ban', 'unban', 'mute', 'unmute'].includes(action)) {
    return c.json({ error: 'action must be: ban, unban, mute, unmute' }, 400);
  }
  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return c.json({ error: 'user_ids array required' }, 400);
  }
  if (user_ids.length > 50) {
    return c.json({ error: 'Max 50 users per bulk operation' }, 400);
  }
  if (!reason) return c.json({ error: 'reason required' }, 400);

  const results: any[] = [];

  for (const userId of user_ids) {
    try {
      const user = await c.env.DB.prepare(
        'SELECT id, username, role FROM users WHERE id = ?'
      ).bind(userId).first();

      if (!user) { results.push({ user_id: userId, status: 'not_found' }); continue; }
      if (['admin', 'super_admin'].includes((user as any).role) && adminRole !== 'super_admin') {
        results.push({ user_id: userId, status: 'skipped', reason: 'cannot ban admin' }); continue;
      }

      if (action === 'unban' || action === 'unmute') {
        await c.env.DB.prepare(`
          UPDATE bans SET is_active = 0, unbanned_by = ?, unban_reason = ?, unbanned_at = datetime('now')
          WHERE user_id = ? AND ban_type = ? AND is_active = 1
        `).bind(adminId, reason, userId, action === 'unmute' ? 'mute' : 'full').run();
        results.push({ user_id: userId, username: (user as any).username, status: 'success' });
      } else {
        const banId = crypto.randomUUID();
        const type = action === 'mute' ? 'mute' : ban_type;
        const expiresAt = duration_hours ? new Date(Date.now() + duration_hours * 3600000).toISOString() : null;

        await c.env.DB.prepare(`
          INSERT INTO bans (id, user_id, banned_by, ban_type, reason, context_type, expires_at, allow_appeal, is_active, evidence_urls, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'global', ?, 1, 1, '[]', datetime('now'), datetime('now'))
        `).bind(banId, userId, adminId, type, reason, expiresAt).run();

        results.push({ user_id: userId, username: (user as any).username, status: 'success', ban_id: banId });
      }
    } catch (e: any) {
      results.push({ user_id: userId, status: 'error', error: e.message });
    }
  }

  const successful = results.filter(r => r.status === 'success').length;
  return c.json({ success: true, processed: results.length, successful, results });
});

export default bans;
