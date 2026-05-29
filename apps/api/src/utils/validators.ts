// ============================================
// DL Chat - Zod Validators
// ============================================
import { z } from 'zod';

export const phoneSchema = z.string()
  .min(7).max(20)
  .regex(/^\+?[0-9]{7,20}$/, 'Invalid phone number');

export const emailSchema = z.string().email('Invalid email address');

export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long');

export const usernameSchema = z.string()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores');

export const registerSchema = z.object({
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  display_name: z.string().min(1).max(100),
  country_code: z.string().optional(),
}).refine(data => data.phone || data.email, {
  message: 'Either phone or email is required',
});

export const verifyOtpSchema = z.object({
  target: z.string().min(1),
  code: z.string().length(6),
  type: z.enum(['register', 'login', '2fa']),
  device_info: z.object({
    platform: z.string(),
    os: z.string(),
    os_version: z.string().optional(),
    app_version: z.string(),
    device_name: z.string(),
    device_id: z.string().optional(),
  }).optional(),
});

export const loginSchema = z.object({
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  device_info: z.object({
    platform: z.string(),
    os: z.string(),
    os_version: z.string().optional(),
    app_version: z.string(),
    device_name: z.string(),
    device_id: z.string().optional(),
  }).optional(),
});

export const updateProfileSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  username: usernameSchema.optional(),
  bio: z.string().max(500).optional(),
  status: z.string().max(200).optional(),
  language: z.string().optional(),
  notification_sound: z.string().optional(),
  custom_theme: z.string().optional(),
});

export const privacySchema = z.object({
  privacy_last_seen: z.enum(['everyone', 'contacts', 'nobody']).optional(),
  privacy_profile_photo: z.enum(['everyone', 'contacts', 'nobody']).optional(),
  privacy_about: z.enum(['everyone', 'contacts', 'nobody']).optional(),
  privacy_status: z.enum(['everyone', 'contacts', 'nobody']).optional(),
  privacy_read_receipts: z.boolean().optional(),
  privacy_groups: z.enum(['everyone', 'contacts', 'nobody']).optional(),
});

export const sendMessageSchema = z.object({
  type: z.enum(['text', 'image', 'video', 'audio', 'voice', 'document', 'location', 'contact', 'sticker', 'gif', 'poll']),
  content: z.string().max(65536).optional(),
  media_url: z.string().url().optional(),
  media_mime_type: z.string().optional(),
  media_size: z.number().optional(),
  media_duration: z.number().optional(),
  media_width: z.number().optional(),
  media_height: z.number().optional(),
  reply_to_id: z.string().optional(),
  thread_id: z.string().optional(),
  mention_ids: z.array(z.string()).optional(),
  is_silent: z.boolean().optional(),
  is_scheduled: z.boolean().optional(),
  scheduled_at: z.number().optional(),
  is_view_once: z.boolean().optional(),
  inline_keyboard: z.array(z.array(z.object({
    text: z.string(),
    callback_data: z.string().optional(),
    url: z.string().optional(),
  }))).optional(),
  poll: z.object({
    question: z.string().min(1).max(500),
    options: z.array(z.string().min(1).max(200)).min(2).max(10),
    is_anonymous: z.boolean().optional(),
    is_quiz: z.boolean().optional(),
    correct_option_index: z.number().optional(),
    explanation: z.string().max(500).optional(),
    multiple_answers: z.boolean().optional(),
    time_limit_seconds: z.number().optional(),
    expires_at: z.number().optional(),
  }).optional(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    address: z.string().optional(),
  }).optional(),
  contact: z.object({
    name: z.string().min(1).max(100),
    phone: z.string().min(7).max(20),
    user_id: z.string().optional(),
  }).optional(),
});

export const createGroupSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  member_ids: z.array(z.string()).optional(),
  avatar_url: z.string().url().optional(),
});

export const createChannelSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  is_public: z.boolean().optional(),
  avatar_url: z.string().url().optional(),
});

export const createServerSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  is_public: z.boolean().optional(),
  icon_url: z.string().url().optional(),
});

export const createBotSchema = z.object({
  display_name: z.string().min(1).max(100),
  username: usernameSchema,
  description: z.string().max(500).optional(),
  bot_description: z.string().max(500).optional(),
});

export const paginationSchema = z.object({
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).optional(),
  offset: z.string().transform(Number).pipe(z.number().min(0)).optional(),
  before: z.string().optional(),
  after: z.string().optional(),
  cursor: z.string().optional(),
});

export const banAppealSchema = z.object({
  message: z.string().min(10).max(2000),
});

export const reportSchema = z.object({
  type: z.enum(['spam', 'harassment', 'illegal', 'misinformation', 'other']),
  reported_user_id: z.string().optional(),
  reported_message_id: z.string().optional(),
  reported_chat_id: z.string().optional(),
  description: z.string().max(2000).optional(),
});

export const roleSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  is_hoist: z.boolean().optional(),
  is_mentionable: z.boolean().optional(),
  permissions: z.object({
    view_channels: z.boolean().optional(),
    send_messages: z.boolean().optional(),
    send_media: z.boolean().optional(),
    manage_messages: z.boolean().optional(),
    manage_channels: z.boolean().optional(),
    manage_roles: z.boolean().optional(),
    manage_server: z.boolean().optional(),
    kick_members: z.boolean().optional(),
    ban_members: z.boolean().optional(),
    mention_everyone: z.boolean().optional(),
    administrator: z.boolean().optional(),
  }).optional(),
});

export const setBotCommandsSchema = z.object({
  commands: z.array(z.object({
    command: z.string().min(1).max(32).regex(/^[a-z0-9_]+$/),
    description: z.string().min(1).max(256),
    scope: z.enum(['all', 'private', 'group', 'channel']).optional(),
  })),
});

export const webhookSchema = z.object({
  name: z.string().min(1).max(80),
  avatar_url: z.string().url().optional(),
});

export const scheduleMessageSchema = z.object({
  ...sendMessageSchema.shape,
  scheduled_at: z.number().min(Date.now() / 1000 + 60),
});
