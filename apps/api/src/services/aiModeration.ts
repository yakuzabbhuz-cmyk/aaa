// ============================================
// DL Chat - AI Moderation Service
// DEATH LEGION Team
// Uses Cloudflare Workers AI for content moderation
// Ban Review Cycle: 6 hours
// ============================================
import type { Env } from '../types';
import { generateId } from '../utils/hash';

export type ViolationType =
  | 'spam'
  | 'harassment'
  | 'explicit_content'
  | 'threats'
  | 'hate_speech'
  | 'misinformation'
  | 'illegal_content'
  | 'phishing'
  | 'self_harm';

export interface ModerationResult {
  shouldBan: boolean;
  shouldDelete: boolean;
  shouldFlag: boolean;
  confidence: number;
  violationType?: ViolationType;
  action: 'none' | 'warn' | 'delete' | 'ban' | 'shadow_ban';
}

export interface AppealResult {
  approved: boolean;
  confidence: number;
  reason: string;
}

/**
 * Analyze a message for policy violations using Cloudflare AI
 */
export async function analyzeMessage(
  env: Env,
  messageId: string,
  userId: string,
  content: string
): Promise<ModerationResult> {
  try {
    // Use Cloudflare AI for text classification
    const prompt = `You are a content moderator for DL Chat, a messaging platform. 
Analyze this message for policy violations. Respond in JSON only.
Message: "${content.slice(0, 500)}"

Respond with:
{
  "is_violation": boolean,
  "violation_type": "spam|harassment|explicit_content|threats|hate_speech|misinformation|illegal_content|phishing|self_harm|none",
  "confidence": 0.0-1.0,
  "severity": "low|medium|high|critical"
}`;

    let confidence = 0;
    let violationType: ViolationType | undefined;
    let isViolation = false;

    try {
      const response = await env.AI.run('@cf/meta/llama-3-8b-instruct' as any, {
        messages: [
          { role: 'system', content: 'You are a content moderation AI. Always respond in valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
      } as any);

      const responseText = (response as any).response || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        confidence = result.confidence || 0;
        violationType = result.violation_type !== 'none' ? result.violation_type : undefined;
        isViolation = result.is_violation === true;
      }
    } catch (aiError) {
      console.error('[AI Moderation] AI call failed, using heuristics', aiError);
      // Fallback: simple heuristic checks
      const lowerContent = content.toLowerCase();
      const spamIndicators = ['buy now', 'click here', 'free money', 'winner', 'congratulations', 'prize'];
      const harassmentIndicators = ['kill yourself', 'kys', 'die', 'threat'];

      for (const indicator of spamIndicators) {
        if (lowerContent.includes(indicator)) {
          isViolation = true;
          confidence = 0.6;
          violationType = 'spam';
          break;
        }
      }

      for (const indicator of harassmentIndicators) {
        if (lowerContent.includes(indicator)) {
          isViolation = true;
          confidence = 0.85;
          violationType = 'harassment';
          break;
        }
      }
    }

    // Determine action based on confidence
    let action: ModerationResult['action'] = 'none';
    let shouldBan = false;
    let shouldDelete = false;
    let shouldFlag = false;

    if (isViolation) {
      if (confidence >= 0.95) {
        action = 'ban';
        shouldBan = true;
        shouldDelete = true;
      } else if (confidence >= 0.85) {
        action = 'delete';
        shouldDelete = true;
      } else if (confidence >= 0.70) {
        action = 'warn';
        shouldFlag = true;
      }
    }

    // Log moderation result
    if (isViolation || confidence > 0.5) {
      await logModerationAction(env, messageId, userId, violationType, confidence, action);
    }

    return {
      shouldBan,
      shouldDelete,
      shouldFlag,
      confidence,
      violationType,
      action,
    };
  } catch (error) {
    console.error('[AI Moderation] Error analyzing message:', error);
    return {
      shouldBan: false,
      shouldDelete: false,
      shouldFlag: false,
      confidence: 0,
      action: 'none',
    };
  }
}

/**
 * Apply moderation action based on result
 */
export async function applyModerationAction(
  env: Env,
  result: ModerationResult,
  messageId: string,
  userId: string,
  chatId: string
): Promise<void> {
  const now = Date.now();

  if (result.shouldDelete) {
    // Delete the message
    await env.DB.prepare(
      'UPDATE messages SET is_deleted = 1, deleted_for_everyone = 1, deleted_at = ? WHERE id = ?'
    ).bind(now, messageId).run();
  }

  if (result.shouldBan) {
    // Check previous bans for escalation
    const previousBans = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM bans WHERE user_id = ?'
    ).bind(userId).first<{ count: number }>();

    const banCount = previousBans?.count || 0;
    let banDurationHours = 24; // Initial 24-hour ban

    // Escalation: 24h -> 72h -> 7d -> 30d -> permanent
    if (banCount >= 4) banDurationHours = 0; // permanent
    else if (banCount >= 3) banDurationHours = 30 * 24;
    else if (banCount >= 2) banDurationHours = 7 * 24;
    else if (banCount >= 1) banDurationHours = 72;

    const expiresAt = banDurationHours > 0
      ? now + banDurationHours * 60 * 60 * 1000
      : null;

    const nextReviewAt = now + 6 * 60 * 60 * 1000; // 6 hours

    await env.DB.prepare(
      `INSERT INTO bans (id, user_id, ban_type, reason, ai_confidence, ai_violation_type, 
       evidence_message_ids, starts_at, expires_at, is_active, next_review_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).bind(
      generateId(),
      userId,
      banDurationHours === 0 ? 'permanent' : 'temporary',
      `AI detected violation: ${result.violationType}`,
      result.confidence,
      result.violationType || 'unknown',
      JSON.stringify([messageId]),
      now,
      expiresAt,
      nextReviewAt,
      now
    ).run();

    // Mark user as banned
    await env.DB.prepare(
      'UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?'
    ).bind(`AI: ${result.violationType}`, userId).run();
  }
}

/**
 * Review a ban appeal using AI
 */
export async function reviewBanAppeal(
  env: Env,
  banId: string,
  userId: string,
  appealMessage: string,
  violationType: string,
  evidenceMessageIds: string[]
): Promise<AppealResult> {
  try {
    // Get original violation context
    const prompt = `You are reviewing a ban appeal for DL Chat messaging platform.

Violation type: ${violationType}
Appeal message from user: "${appealMessage.slice(0, 500)}"

Should this ban appeal be APPROVED (user unbanned) or DENIED?
Consider: remorse, context, first offense vs repeat, nature of violation.

Respond in JSON:
{
  "approved": boolean,
  "confidence": 0.0-1.0,
  "reason": "brief reason"
}`;

    let approved = false;
    let confidence = 0.5;
    let reason = 'Under review';

    try {
      const response = await env.AI.run('@cf/meta/llama-3-8b-instruct' as any, {
        messages: [
          { role: 'system', content: 'You are a ban appeal reviewer. Respond in valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
      } as any);

      const responseText = (response as any).response || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        approved = result.approved === true;
        confidence = result.confidence || 0.5;
        reason = result.reason || 'AI reviewed';
      }
    } catch (aiError) {
      console.error('[AI Moderation] Appeal review AI failed, using heuristic');
      // Heuristic: if user shows remorse and it's not extreme violation
      const remorse = appealMessage.toLowerCase().includes('sorry') ||
        appealMessage.toLowerCase().includes('apologize') ||
        appealMessage.toLowerCase().includes('mistake');
      const extremeViolation = ['threats', 'illegal_content', 'self_harm'].includes(violationType);

      if (remorse && !extremeViolation) {
        approved = true;
        confidence = 0.6;
        reason = 'User showed remorse';
      } else {
        approved = false;
        confidence = 0.7;
        reason = 'Violation severity or lack of remorse';
      }
    }

    // If confidence < 0.80, schedule 6-hour review
    if (confidence < 0.80) {
      const nextReviewAt = Date.now() + 6 * 60 * 60 * 1000;
      await env.DB.prepare(
        'UPDATE bans SET next_review_at = ?, appeal_status = ? WHERE id = ?'
      ).bind(nextReviewAt, 'pending', banId).run();

      // Schedule KV reminder for re-review
      await env.KV.put(
        `appeal_review:${banId}`,
        JSON.stringify({ banId, userId, violationType }),
        { expirationTtl: 6 * 60 * 60 + 300 } // 6h + 5min buffer
      );

      return { approved: false, confidence, reason: 'Under 6-hour AI review cycle - ' + reason };
    }

    // Apply decision
    await applyAppealDecision(env, banId, userId, approved, reason);

    return { approved, confidence, reason };
  } catch (error) {
    console.error('[AI Moderation] Appeal review error:', error);
    return { approved: false, confidence: 0, reason: 'Review system error' };
  }
}

/**
 * Re-evaluate appeal after 6-hour review cycle
 */
export async function reEvaluateAppeal(
  env: Env,
  banId: string
): Promise<void> {
  const reviewData = await env.KV.get(`appeal_review:${banId}`);
  if (!reviewData) return;

  const { userId, violationType } = JSON.parse(reviewData);

  const ban = await env.DB.prepare(
    'SELECT * FROM bans WHERE id = ?'
  ).bind(banId).first<any>();

  if (!ban || ban.appeal_status !== 'pending') return;

  // Simple re-evaluation: after 6 hours, give benefit of doubt for first-time offenders
  const previousBans = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM bans WHERE user_id = ? AND id != ?'
  ).bind(userId, banId).first<{ count: number }>();

  const isFirstOffense = (previousBans?.count || 0) === 0;
  const isMinorViolation = ['spam', 'misinformation'].includes(violationType);

  const approved = isFirstOffense && isMinorViolation;
  const reason = approved
    ? 'First offense with minor violation - appeal approved after review period'
    : 'Ban upheld after 6-hour review period';

  await applyAppealDecision(env, banId, userId, approved, reason);
  await env.KV.delete(`appeal_review:${banId}`);
}

async function applyAppealDecision(
  env: Env,
  banId: string,
  userId: string,
  approved: boolean,
  reason: string
): Promise<void> {
  const now = Date.now();

  if (approved) {
    // Unban user
    await env.DB.prepare(
      `UPDATE bans SET is_active = 0, appeal_status = 'approved', 
       appeal_reviewed_at = ?, appeal_decision_reason = ? WHERE id = ?`
    ).bind(now, reason, banId).run();

    await env.DB.prepare(
      'UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?'
    ).bind(userId).run();
  } else {
    await env.DB.prepare(
      `UPDATE bans SET appeal_status = 'denied', 
       appeal_reviewed_at = ?, appeal_decision_reason = ? WHERE id = ?`
    ).bind(now, reason, banId).run();
  }
}

async function logModerationAction(
  env: Env,
  messageId: string,
  userId: string,
  violationType: string | undefined,
  confidence: number,
  action: string
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ai_moderation_logs (id, message_id, user_id, violation_type, confidence, action_taken, model_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    generateId(),
    messageId,
    userId,
    violationType || null,
    confidence,
    action,
    'llama-3-8b-instruct@v1',
    Date.now()
  ).run();
}
