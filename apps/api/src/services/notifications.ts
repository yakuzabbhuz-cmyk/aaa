// ============================================
// DL Chat - Push Notification Service
// ============================================
import type { Env } from '../types';

interface PushNotification {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
  sound?: string;
}

interface PushToken {
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId: string;
}

export async function sendPushNotification(
  env: Env,
  notification: PushNotification
): Promise<void> {
  // Get user's push tokens from KV
  const tokensKey = `push_tokens:${notification.userId}`;
  const tokensJson = await env.KV.get(tokensKey);
  if (!tokensJson) return;

  const tokens: PushToken[] = JSON.parse(tokensJson);
  if (tokens.length === 0) return;

  // Get user's notification settings
  const notifSettings = await env.KV.get(`notif_settings:${notification.userId}`);
  const settings = notifSettings ? JSON.parse(notifSettings) : { enabled: true };

  if (!settings.enabled) return;

  // Send to each device
  for (const token of tokens) {
    if (token.platform === 'android') {
      await sendFcmNotification(token.token, notification);
    } else if (token.platform === 'ios') {
      await sendApnsNotification(token.token, notification);
    } else if (token.platform === 'web') {
      await sendWebPushNotification(token.token, notification);
    }
  }
}

export async function registerPushToken(
  env: Env,
  userId: string,
  token: string,
  platform: 'ios' | 'android' | 'web',
  deviceId: string
): Promise<void> {
  const tokensKey = `push_tokens:${userId}`;
  const tokensJson = await env.KV.get(tokensKey);
  const tokens: PushToken[] = tokensJson ? JSON.parse(tokensJson) : [];

  // Remove existing token for this device
  const filteredTokens = tokens.filter(t => t.deviceId !== deviceId);

  // Add new token
  filteredTokens.push({ token, platform, deviceId });

  await env.KV.put(tokensKey, JSON.stringify(filteredTokens), {
    expirationTtl: 90 * 24 * 60 * 60, // 90 days
  });
}

export async function unregisterPushToken(
  env: Env,
  userId: string,
  deviceId: string
): Promise<void> {
  const tokensKey = `push_tokens:${userId}`;
  const tokensJson = await env.KV.get(tokensKey);
  if (!tokensJson) return;

  const tokens: PushToken[] = JSON.parse(tokensJson);
  const filtered = tokens.filter(t => t.deviceId !== deviceId);
  await env.KV.put(tokensKey, JSON.stringify(filtered));
}

export async function sendNewMessageNotification(
  env: Env,
  recipientId: string,
  senderName: string,
  chatName: string | null,
  messagePreview: string,
  chatId: string,
  messageId: string
): Promise<void> {
  const title = chatName ? `${senderName} in ${chatName}` : senderName;
  await sendPushNotification(env, {
    userId: recipientId,
    title,
    body: messagePreview,
    data: {
      type: 'new_message',
      chatId,
      messageId,
    },
    sound: 'default',
  });
}

export async function sendCallNotification(
  env: Env,
  recipientId: string,
  callerName: string,
  callType: string,
  callId: string
): Promise<void> {
  await sendPushNotification(env, {
    userId: recipientId,
    title: `Incoming ${callType} call`,
    body: `${callerName} is calling...`,
    data: {
      type: 'incoming_call',
      callId,
      callType,
    },
    sound: 'ringtone',
  });
}

async function sendFcmNotification(
  token: string,
  notification: PushNotification
): Promise<void> {
  // FCM integration - requires FIREBASE_SERVER_KEY in env
  // await fetch('https://fcm.googleapis.com/fcm/send', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `key=${env.FIREBASE_SERVER_KEY}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     to: token,
  //     notification: { title: notification.title, body: notification.body, sound: notification.sound || 'default' },
  //     data: notification.data || {},
  //   }),
  // });
  console.log(`[FCM] Notification to ${token}: ${notification.title}`);
}

async function sendApnsNotification(
  token: string,
  notification: PushNotification
): Promise<void> {
  // APNS integration via HTTP/2 push
  console.log(`[APNS] Notification to ${token}: ${notification.title}`);
}

async function sendWebPushNotification(
  token: string,
  notification: PushNotification
): Promise<void> {
  // Web Push Protocol
  console.log(`[WebPush] Notification to ${token}: ${notification.title}`);
}
