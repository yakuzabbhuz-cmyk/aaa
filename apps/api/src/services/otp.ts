// ============================================
// DL Chat - OTP Service
// Real email via Resend.com, SMS via Twilio
// ============================================
import type { Env } from '../types';
import { generateOTP } from '../utils/hash';

const OTP_EXPIRY_MINUTES = 10;

export async function sendOtp(
  env: Env,
  target: string,
  type: 'register' | 'login' | '2fa'
): Promise<{ success: boolean; code?: string }> {
  const code = generateOTP(6);
  const expiresAt = Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000;

  const otpKey = `otp:${type}:${target}`;
  await env.KV.put(otpKey, JSON.stringify({ code, expiresAt }), {
    expirationTtl: OTP_EXPIRY_MINUTES * 60,
  });

  const isEmail = target.includes('@');

  if (isEmail && env.RESEND_API_KEY) {
    try {
      await sendEmailOtp(env, target, code, type);
      return { success: true }; // Don't return code when real email is sent
    } catch (e) {
      console.error('[OTP] Resend email failed, falling back to debug code:', e);
      return { success: true, code }; // Fallback: return code if email fails
    }
  } else if (!isEmail && env.TWILIO_ACCOUNT_SID) {
    try {
      await sendSmsOtp(env, target, code, type);
      return { success: true };
    } catch (e) {
      console.error('[OTP] Twilio SMS failed, falling back to debug code:', e);
      return { success: true, code };
    }
  } else {
    // Development fallback — log to console, return code
    console.log(`[OTP DEV] ${type} OTP for ${target}: ${code}`);
    return { success: true, code };
  }
}

export async function verifyOtp(
  env: Env,
  target: string,
  code: string,
  type: 'register' | 'login' | '2fa'
): Promise<boolean> {
  const otpKey = `otp:${type}:${target}`;
  const stored = await env.KV.get(otpKey);

  if (!stored) return false;

  const { code: storedCode, expiresAt } = JSON.parse(stored);

  if (Date.now() > expiresAt) {
    await env.KV.delete(otpKey);
    return false;
  }

  if (storedCode !== code) return false;

  // Mark as used (delete from KV)
  await env.KV.delete(otpKey);
  return true;
}

async function sendEmailOtp(env: Env, email: string, code: string, type: string): Promise<void> {
  const typeLabels: Record<string, string> = {
    register: 'Registration',
    login: 'Login',
    '2fa': 'Two-Factor Authentication',
  };

  const fromEmail = env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `DL Chat <${fromEmail}>`,
      to: email,
      subject: `[${code}] Your DL Chat ${typeLabels[type] || 'Verification'} Code`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0d0d0d; color: #ffffff; padding: 40px; border-radius: 16px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <div style="width: 72px; height: 72px; background: #6c63ff; border-radius: 20px; display: inline-flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; color: white; line-height: 72px; text-align: center;">DL</div>
            <h1 style="color: #ffffff; margin-top: 16px; font-size: 24px; margin-bottom: 4px;">DL Chat</h1>
            <p style="color: #888; font-size: 13px; margin: 0;">By DEATH LEGION Team</p>
          </div>
          <h2 style="color: #6c63ff; text-align: center; font-size: 18px; margin-bottom: 8px;">${typeLabels[type] || 'Verification'} Code</h2>
          <p style="color: #aaa; text-align: center; font-size: 14px; margin-bottom: 24px;">Use the code below to complete your ${(typeLabels[type] || 'verification').toLowerCase()}.</p>
          <div style="background: #1a1a1a; border: 2px solid #6c63ff; border-radius: 12px; padding: 24px; text-align: center; margin: 0 0 24px;">
            <span style="font-size: 48px; font-weight: 900; letter-spacing: 12px; color: #6c63ff; font-family: monospace;">${code}</span>
          </div>
          <p style="color: #888; text-align: center; font-size: 14px; margin-bottom: 8px;">⏱ This code expires in <strong style="color:#fff">10 minutes</strong>.</p>
          <p style="color: #555; text-align: center; font-size: 13px;">Do not share this code with anyone. DL Chat staff will never ask for it.</p>
          <hr style="border: none; border-top: 1px solid #222; margin: 32px 0;" />
          <p style="color: #444; text-align: center; font-size: 12px;">If you didn't request this code, you can safely ignore this email. — DEATH LEGION Team</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const err = await response.json() as any;
    console.error('[OTP] Resend error:', err);
    throw new Error(`Failed to send email: ${err.message || response.status}`);
  }
}

async function sendSmsOtp(env: Env, phone: string, code: string, type: string): Promise<void> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) {
    console.log(`[OTP DEV SMS] ${type} OTP for ${phone}: ${code}`);
    return;
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: phone,
        From: env.TWILIO_PHONE_NUMBER,
        Body: `Your DL Chat ${type} code is ${code}. Valid for 10 minutes. Do not share it.`,
      }).toString(),
    }
  );

  if (!response.ok) {
    const err = await response.json() as any;
    console.error('[OTP] Twilio error:', err);
    throw new Error(`Failed to send SMS: ${err.message || response.status}`);
  }
}
