// ============================================
// DL Chat - OTP Service
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

  // Store OTP in KV with expiry
  const otpKey = `otp:${type}:${target}`;
  await env.KV.put(otpKey, JSON.stringify({ code, expiresAt }), {
    expirationTtl: OTP_EXPIRY_MINUTES * 60,
  });

  // In production, integrate with SMS/email provider
  // For now, we return the code in development
  // TODO: Integrate with Twilio/AWS SNS for SMS, SendGrid/Resend for email
  console.log(`[OTP] ${type} OTP for ${target}: ${code}`);

  // In production, uncomment the appropriate provider:
  // if (target.includes('@')) {
  //   await sendEmailOtp(target, code, type);
  // } else {
  //   await sendSmsOtp(target, code, type);
  // }

  return { success: true, code }; // Remove `code` from response in production
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

  // Mark as used (delete)
  await env.KV.delete(otpKey);
  return true;
}

async function sendEmailOtp(email: string, code: string, type: string): Promise<void> {
  // Integration point for email provider (Resend, SendGrid, etc.)
  // Example with Resend:
  // await fetch('https://api.resend.com/emails', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${env.RESEND_API_KEY}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     from: 'DL Chat <noreply@dlchat.app>',
  //     to: email,
  //     subject: `Your DL Chat verification code: ${code}`,
  //     html: `<p>Your ${type} code is: <strong>${code}</strong></p><p>Expires in 10 minutes.</p>`,
  //   }),
  // });
}

async function sendSmsOtp(phone: string, code: string, type: string): Promise<void> {
  // Integration point for SMS provider (Twilio, etc.)
  // Example with Twilio:
  // await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
  //     'Content-Type': 'application/x-www-form-urlencoded',
  //   },
  //   body: new URLSearchParams({
  //     To: phone,
  //     From: env.TWILIO_PHONE_NUMBER,
  //     Body: `Your DL Chat ${type} code is ${code}. Expires in 10 minutes.`,
  //   }),
  // });
}
