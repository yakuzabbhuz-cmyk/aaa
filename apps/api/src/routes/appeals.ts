import { Hono } from 'hono';
import { verify } from 'hono/jwt';

const appeals = new Hono<{ Bindings: CloudflareBindings }>();

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

// ─── APPEAL STATUS FLOW ───────────────────────────────────────────────────────
// submitted → under_review → approved | rejected | needs_more_info → (user responds) → under_review

// ─── POST /appeals - Submit a ban appeal ─────────────────────────────────────
appeals.post('/', requireAuth, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const {
    ban_id,
    statement,           // User's appeal statement
    additional_info,     // Optional additional context
    evidence_urls = [],  // Screenshots, links etc
    contact_email        // Optional contact for follow-up
  } = body;

  if (!ban_id || !statement) {
    return c.json({ error: 'ban_id and statement are required' }, 400);
  }

  if (statement.length < 50) {
    return c.json({ error: 'Appeal statement must be at least 50 characters' }, 400);
  }

  if (statement.length > 5000) {
    return c.json({ error: 'Appeal statement cannot exceed 5000 characters' }, 400);
  }

  // Verify the ban exists and belongs to this user
  const ban = await c.env.DB.prepare(`
    SELECT b.*, u.username, u.email 
    FROM bans b JOIN users u ON b.user_id = u.id
    WHERE b.id = ? AND b.user_id = ?
  `).bind(ban_id, userId).first();

  if (!ban) {
    return c.json({ error: 'Ban not found or does not belong to your account' }, 404);
  }

  if (!(ban as any).allow_appeal) {
    return c.json({ error: 'This ban does not allow appeals' }, 403);
  }

  // Check if already appealed
  const existingAppeal = await c.env.DB.prepare(`
    SELECT id, status FROM ban_appeals 
    WHERE ban_id = ? AND user_id = ? AND status NOT IN ('rejected', 'withdrawn')
  `).bind(ban_id, userId).first();

  if (existingAppeal) {
    return c.json({
      error: 'You already have an active appeal for this ban',
      appeal_id: (existingAppeal as any).id,
      status: (existingAppeal as any).status
    }, 409);
  }

  // Rate limit: max 3 appeals per 30 days
  const recentAppeals = await c.env.DB.prepare(`
    SELECT COUNT(*) as cnt FROM ban_appeals 
    WHERE user_id = ? AND created_at >= datetime('now', '-30 days')
  `).bind(userId).first();

  if ((recentAppeals as any)?.cnt >= 3) {
    return c.json({ error: 'Too many appeals submitted. Please wait 30 days before submitting another.' }, 429);
  }

  const appealId = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO ban_appeals (
      id, ban_id, user_id, statement, additional_info, 
      evidence_urls, contact_email, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', datetime('now'), datetime('now'))
  `).bind(
    appealId, ban_id, userId, statement,
    additional_info || null,
    JSON.stringify(evidence_urls),
    contact_email || null
  ).run();

  // Notify admins of new appeal
  await c.env.DB.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, data, created_at)
    SELECT ?, id, 'appeal_submitted', 'New Ban Appeal', ?, ?, datetime('now')
    FROM users WHERE role IN ('admin', 'super_admin', 'moderator')
    LIMIT 10
  `).bind(
    crypto.randomUUID(),
    `${(ban as any).username} submitted a ban appeal`,
    JSON.stringify({ appeal_id: appealId, ban_id, user_id: userId })
  ).run().catch(() => {});

  return c.json({
    success: true,
    appeal_id: appealId,
    message: 'Your appeal has been submitted and will be reviewed within 72 hours',
    status: 'submitted',
    estimated_review_time: '24-72 hours',
    tips: [
      'Be honest and respectful in your appeal',
      'Provide any relevant evidence or context',
      'Appeals are reviewed by our moderation team',
      'You will be notified of the decision via notification'
    ]
  }, 201);
});

// ─── GET /appeals - Get user's own appeals ────────────────────────────────────
appeals.get('/', requireAuth, async (c) => {
  const userId = c.get('userId');
  const { page = '1', limit = '20' } = c.req.query();
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 50);
  const offset = (pageNum - 1) * limitNum;

  const [userAppeals, total] = await Promise.all([
    c.env.DB.prepare(`
      SELECT a.*, b.ban_type, b.reason as ban_reason, b.created_at as ban_date,
             b.expires_at, b.is_active as ban_active,
             r.username as reviewer_username, r.display_name as reviewer_display_name
      FROM ban_appeals a
      LEFT JOIN bans b ON a.ban_id = b.id
      LEFT JOIN users r ON a.reviewed_by = r.id
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(userId, limitNum, offset).all(),
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM ban_appeals WHERE user_id = ?').bind(userId).first()
  ]);

  return c.json({
    appeals: userAppeals.results,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: (total as any)?.cnt || 0
    }
  });
});

// ─── GET /appeals/:id - Get specific appeal ───────────────────────────────────
appeals.get('/:id', requireAuth, async (c) => {
  const userId = c.get('userId');
  const userRole = c.get('userRole');
  const appealId = c.req.param('id');

  const appeal = await c.env.DB.prepare(`
    SELECT a.*, 
           b.ban_type, b.reason as ban_reason, b.created_at as ban_date,
           b.expires_at, b.is_active as ban_active, b.internal_notes,
           u.username, u.display_name, u.avatar_url,
           r.username as reviewer_username, r.display_name as reviewer_display_name, r.avatar_url as reviewer_avatar
    FROM ban_appeals a
    LEFT JOIN bans b ON a.ban_id = b.id
    LEFT JOIN users u ON a.user_id = u.id
    LEFT JOIN users r ON a.reviewed_by = r.id
    WHERE a.id = ?
  `).bind(appealId).first();

  if (!appeal) return c.json({ error: 'Appeal not found' }, 404);

  // Users can only view their own appeals; admins can view all
  if ((appeal as any).user_id !== userId && !['admin', 'moderator', 'super_admin'].includes(userRole)) {
    return c.json({ error: 'Access denied' }, 403);
  }

  // Hide internal notes from regular users
  if (!['admin', 'moderator', 'super_admin'].includes(userRole)) {
    delete (appeal as any).internal_notes;
  }

  // Get appeal messages/comments
  const messages = await c.env.DB.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar_url, u.role
    FROM appeal_messages m
    LEFT JOIN users u ON m.sender_id = u.id
    WHERE m.appeal_id = ?
    ORDER BY m.created_at ASC
  `).bind(appealId).all();

  return c.json({ appeal, messages: messages.results });
});

// ─── POST /appeals/:id/message - Add message to appeal ───────────────────────
appeals.post('/:id/message', requireAuth, async (c) => {
  const userId = c.get('userId');
  const userRole = c.get('userRole');
  const appealId = c.req.param('id');
  const { message, attachment_urls = [] } = await c.req.json();

  if (!message || message.trim().length < 5) {
    return c.json({ error: 'Message must be at least 5 characters' }, 400);
  }

  const appeal = await c.env.DB.prepare(
    'SELECT * FROM ban_appeals WHERE id = ?'
  ).bind(appealId).first();

  if (!appeal) return c.json({ error: 'Appeal not found' }, 404);
  if ((appeal as any).user_id !== userId && !['admin', 'moderator', 'super_admin'].includes(userRole)) {
    return c.json({ error: 'Access denied' }, 403);
  }
  if (['approved', 'rejected', 'withdrawn'].includes((appeal as any).status) && !['admin', 'moderator', 'super_admin'].includes(userRole)) {
    return c.json({ error: 'Cannot message on a closed appeal' }, 403);
  }

  const msgId = crypto.randomUUID();
  const isAdmin = ['admin', 'moderator', 'super_admin'].includes(userRole);

  await c.env.DB.prepare(`
    INSERT INTO appeal_messages (id, appeal_id, sender_id, message, is_admin_message, attachment_urls, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(msgId, appealId, userId, message.trim(), isAdmin ? 1 : 0, JSON.stringify(attachment_urls)).run();

  // If user responded to "needs_more_info", move back to under_review
  if ((appeal as any).status === 'needs_more_info' && !isAdmin) {
    await c.env.DB.prepare(
      `UPDATE ban_appeals SET status = 'under_review', updated_at = datetime('now') WHERE id = ?`
    ).bind(appealId).run();
  }

  // Notify the other party
  const recipientId = isAdmin ? (appeal as any).user_id : null; // notify user
  if (recipientId) {
    await c.env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, data, created_at)
      VALUES (?, ?, 'appeal_message', 'Appeal Update', 'You have a new message on your ban appeal', ?, datetime('now'))
    `).bind(
      crypto.randomUUID(), recipientId,
      JSON.stringify({ appeal_id: appealId })
    ).run().catch(() => {});
  }

  return c.json({ success: true, message_id: msgId });
});

// ─── PATCH /appeals/:id/withdraw - Withdraw appeal ───────────────────────────
appeals.patch('/:id/withdraw', requireAuth, async (c) => {
  const userId = c.get('userId');
  const appealId = c.req.param('id');

  const appeal = await c.env.DB.prepare(
    'SELECT * FROM ban_appeals WHERE id = ? AND user_id = ?'
  ).bind(appealId, userId).first();

  if (!appeal) return c.json({ error: 'Appeal not found' }, 404);
  if (['approved', 'rejected', 'withdrawn'].includes((appeal as any).status)) {
    return c.json({ error: 'This appeal is already closed' }, 400);
  }

  await c.env.DB.prepare(`
    UPDATE ban_appeals SET status = 'withdrawn', updated_at = datetime('now') WHERE id = ?
  `).bind(appealId).run();

  return c.json({ success: true, message: 'Appeal withdrawn' });
});

// ─── PATCH /appeals/:id/review - Admin review an appeal ──────────────────────
appeals.patch('/:id/review', requireAdmin, async (c) => {
  const adminId = c.get('userId');
  const appealId = c.req.param('id');
  const body = await c.req.json();

  const {
    decision,           // approved, rejected, needs_more_info
    admin_response,     // Public response to user
    internal_notes,     // Private admin notes
    modify_ban          // If approved: { action: 'remove' | 'reduce', duration_hours? }
  } = body;

  if (!['approved', 'rejected', 'needs_more_info'].includes(decision)) {
    return c.json({ error: 'decision must be: approved, rejected, needs_more_info' }, 400);
  }
  if (!admin_response || admin_response.length < 20) {
    return c.json({ error: 'admin_response must be at least 20 characters' }, 400);
  }

  const appeal = await c.env.DB.prepare(`
    SELECT a.*, b.user_id as banned_user_id, b.ban_type
    FROM ban_appeals a LEFT JOIN bans b ON a.ban_id = b.id
    WHERE a.id = ?
  `).bind(appealId).first();

  if (!appeal) return c.json({ error: 'Appeal not found' }, 404);
  if (!['submitted', 'under_review', 'needs_more_info'].includes((appeal as any).status)) {
    return c.json({ error: 'This appeal is already closed' }, 400);
  }

  // Update appeal status
  await c.env.DB.prepare(`
    UPDATE ban_appeals SET 
      status = ?,
      admin_response = ?,
      internal_notes = COALESCE(?, internal_notes),
      reviewed_by = ?,
      reviewed_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(decision, admin_response, internal_notes || null, adminId, appealId).run();

  let banModified = false;

  // If approved, optionally modify the ban
  if (decision === 'approved' && modify_ban) {
    if (modify_ban.action === 'remove') {
      await c.env.DB.prepare(`
        UPDATE bans SET is_active = 0, unbanned_by = ?, unban_reason = 'Appeal approved', 
        unbanned_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).bind(adminId, (appeal as any).ban_id).run();

      await c.env.DB.prepare(
        `UPDATE users SET is_banned = 0, updated_at = datetime('now') WHERE id = ?`
      ).bind((appeal as any).banned_user_id).run();

      banModified = true;
    } else if (modify_ban.action === 'reduce' && modify_ban.duration_hours) {
      const newExpiry = new Date(Date.now() + modify_ban.duration_hours * 3600000).toISOString();
      await c.env.DB.prepare(`
        UPDATE bans SET expires_at = ?, updated_at = datetime('now') WHERE id = ?
      `).bind(newExpiry, (appeal as any).ban_id).run();
      banModified = true;
    }
  }

  // Notify the user
  const notifTitle = decision === 'approved' ? 'Appeal Approved!' :
                     decision === 'rejected' ? 'Appeal Decision' :
                     'More Information Needed';
  const notifBody = decision === 'approved'
    ? (banModified ? 'Your ban appeal was approved. Your account restrictions have been lifted.' : 'Your appeal was approved.')
    : decision === 'rejected'
    ? 'Your appeal has been reviewed and the ban will remain in place.'
    : 'Our team needs more information about your appeal. Please respond with additional details.';

  await c.env.DB.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, data, created_at)
    VALUES (?, ?, 'appeal_decision', ?, ?, ?, datetime('now'))
  `).bind(
    crypto.randomUUID(),
    (appeal as any).banned_user_id,
    notifTitle, notifBody,
    JSON.stringify({
      appeal_id: appealId,
      decision,
      admin_response,
      ban_modified: banModified
    })
  ).run().catch(() => {});

  // Log admin action
  await c.env.DB.prepare(`
    INSERT INTO admin_audit_log (id, admin_id, action, target_type, target_id, details, created_at)
    VALUES (?, ?, 'review_appeal', 'appeal', ?, ?, datetime('now'))
  `).bind(
    crypto.randomUUID(), adminId, appealId,
    JSON.stringify({ decision, ban_id: (appeal as any).ban_id, ban_modified: banModified })
  ).run().catch(() => {});

  return c.json({
    success: true,
    decision,
    message: `Appeal ${decision === 'needs_more_info' ? 'requires more information' : decision}`,
    ban_modified: banModified
  });
});

// ─── GET /appeals/admin/list - Admin list all appeals ────────────────────────
appeals.get('/admin/list', requireAdmin, async (c) => {
  const { page = '1', limit = '50', status = 'submitted', priority } = c.req.query();
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 100);
  const offset = (pageNum - 1) * limitNum;

  let query = `
    SELECT a.*, 
           u.username, u.display_name, u.avatar_url, u.ban_count,
           b.ban_type, b.reason as ban_reason, b.created_at as ban_date, b.expires_at,
           r.username as reviewer_username
    FROM ban_appeals a
    LEFT JOIN users u ON a.user_id = u.id
    LEFT JOIN bans b ON a.ban_id = b.id
    LEFT JOIN users r ON a.reviewed_by = r.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (status !== 'all') {
    query += ` AND a.status = ?`;
    params.push(status);
  }

  // Priority: users with multiple bans or permanent bans get higher priority
  query += ` ORDER BY 
    CASE WHEN b.expires_at IS NULL AND b.ban_type = 'full' THEN 0 ELSE 1 END ASC,
    u.ban_count DESC,
    a.created_at ASC
    LIMIT ? OFFSET ?`;
  params.push(limitNum, offset);

  const [allAppeals, counts] = await Promise.all([
    c.env.DB.prepare(query).bind(...params).all(),
    c.env.DB.prepare(`
      SELECT 
        SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'under_review' THEN 1 ELSE 0 END) as in_review,
        SUM(CASE WHEN status = 'needs_more_info' THEN 1 ELSE 0 END) as needs_info,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        COUNT(*) as total
      FROM ban_appeals
    `).first()
  ]);

  return c.json({
    appeals: allAppeals.results,
    counts,
    pagination: {
      page: pageNum,
      limit: limitNum
    }
  });
});

// ─── PATCH /appeals/:id/assign - Assign appeal to moderator ──────────────────
appeals.patch('/:id/assign', requireAdmin, async (c) => {
  const adminId = c.get('userId');
  const appealId = c.req.param('id');
  const { moderator_id } = await c.req.json();

  await c.env.DB.prepare(`
    UPDATE ban_appeals SET 
      assigned_to = ?,
      status = 'under_review',
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(moderator_id || adminId, appealId).run();

  return c.json({ success: true, message: 'Appeal assigned' });
});

// ─── GET /appeals/stats - Appeal statistics ───────────────────────────────────
appeals.get('/stats', requireAdmin, async (c) => {
  const stats = await c.env.DB.prepare(`
    SELECT 
      COUNT(*) as total_appeals,
      SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'under_review' THEN 1 ELSE 0 END) as in_review,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN status = 'withdrawn' THEN 1 ELSE 0 END) as withdrawn,
      SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as this_week,
      SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) as this_month,
      ROUND(AVG(CASE WHEN reviewed_at IS NOT NULL 
        THEN (julianday(reviewed_at) - julianday(created_at)) * 24 
        ELSE NULL END), 1) as avg_review_hours
    FROM ban_appeals
  `).first();

  const approvalRate = await c.env.DB.prepare(`
    SELECT 
      ROUND(100.0 * SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) / 
        NULLIF(SUM(CASE WHEN status IN ('approved', 'rejected') THEN 1 ELSE 0 END), 0), 1) as approval_rate
    FROM ban_appeals
  `).first();

  return c.json({ ...stats, ...(approvalRate as any) });
});

// ─── Public appeal submission (no auth needed for banned users) ───────────────
appeals.post('/public', async (c) => {
  const body = await c.req.json();
  // Accept both 'email' and 'contact_email' field names
  const email = body.contact_email || body.email;
  const { username, ban_id, statement, additional_info, evidence_urls = [] } = body;

  if (!username || !email || !statement) {
    return c.json({ error: 'username, contact_email, and statement are required' }, 400);
  }

  if (statement.length < 50) {
    return c.json({ error: 'Statement must be at least 50 characters' }, 400);
  }

  const appealId = crypto.randomUUID();

  // Try to find user account — if not found, still accept the appeal (staff will investigate)
  const user = await c.env.DB.prepare(
    'SELECT id, username, is_banned FROM users WHERE username = ?'
  ).bind(username.toLowerCase()).first().catch(() => null);

  if (user) {
    // User found — try to find active ban
    const targetBan = ban_id
      ? await c.env.DB.prepare('SELECT * FROM bans WHERE id = ? AND user_id = ? AND is_active = 1').bind(ban_id, (user as any).id).first().catch(() => null)
      : await c.env.DB.prepare('SELECT * FROM bans WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1').bind((user as any).id).first().catch(() => null);

    if (targetBan) {
      // Check for duplicate active appeal
      const existing = await c.env.DB.prepare(
        `SELECT id, status FROM ban_appeals WHERE ban_id = ? AND user_id = ? AND status NOT IN ('rejected','withdrawn')`
      ).bind((targetBan as any).id, (user as any).id).first().catch(() => null);

      if (existing) {
        return c.json({
          success: false,
          error: 'You already have an active appeal',
          appeal_id: (existing as any).id,
          status: (existing as any).status
        }, 409);
      }

      // Store appeal linked to ban
      await c.env.DB.prepare(`
        INSERT INTO ban_appeals (
          id, ban_id, user_id, statement, additional_info, evidence_urls,
          contact_email, status, is_public_appeal, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', 1, datetime('now'), datetime('now'))
      `).bind(
        appealId, (targetBan as any).id, (user as any).id,
        statement, additional_info || null, JSON.stringify(evidence_urls), email
      ).run();

      return c.json({
        success: true,
        appeal: { id: appealId, status: 'submitted' },
        message: 'Appeal submitted. Our team will review it within 48 hours.',
        status: 'submitted'
      }, 201);
    }
  }

  // No verified ban found — store as unverified public appeal for staff review
  // Use sentinel placeholder for ban_id since column is NOT NULL
  const sentinelBanId = 'public-' + appealId;
  await c.env.DB.prepare(`
    INSERT INTO ban_appeals (
      id, ban_id, user_id, statement, additional_info, evidence_urls,
      contact_email, status, is_public_appeal, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', 1, datetime('now'), datetime('now'))
  `).bind(
    appealId, sentinelBanId, username,
    statement, additional_info || null, JSON.stringify(evidence_urls), email
  ).run();

  return c.json({
    success: true,
    appeal: { id: appealId, status: 'submitted' },
    message: 'Appeal submitted for review. Our team will contact you at the provided email within 72 hours.',
    status: 'submitted',
    note: 'Account verification pending'
  }, 201);
});

export default appeals;
