// ============================================
// DL Chat Bot SDK — Context Filters
// DEATH LEGION Team — Proprietary Software
// ============================================

import { BotContext } from './context';

/** Only pass if message is from a private chat */
export const isPrivate = (ctx: BotContext): boolean =>
  ctx.chat?.type === 'direct';

/** Only pass if message is from a group */
export const isGroup = (ctx: BotContext): boolean =>
  ctx.chat?.type === 'group';

/** Only pass if message is from a channel */
export const isChannel = (ctx: BotContext): boolean =>
  ctx.chat?.type === 'channel';

/** Only pass if sender is a bot */
export const isBot = (ctx: BotContext): boolean =>
  ctx.from?.is_bot === true;

/** Only pass if sender is NOT a bot */
export const isHuman = (ctx: BotContext): boolean =>
  ctx.from?.is_bot === false;

/** Only pass if sender is verified */
export const isVerified = (ctx: BotContext): boolean =>
  ctx.from?.is_verified === true;

/** Only pass if message contains text */
export const hasText = (ctx: BotContext): boolean =>
  !!ctx.text;

/** Only pass if message has a reply */
export const hasReply = (ctx: BotContext): boolean =>
  !!ctx.message?.reply_to;

/** Only pass if message type matches */
export const hasMedia = (type?: string) => (ctx: BotContext): boolean => {
  const msg = ctx.message;
  if (!msg) return false;
  if (type) return msg.message_type === type;
  return ['image', 'video', 'audio', 'voice', 'document', 'sticker', 'gif'].includes(msg.message_type);
};

/** Only pass if user ID is in the list (admin check) */
export const isAdmin = (adminIds: string[]) => (ctx: BotContext): boolean =>
  !!ctx.from?.id && adminIds.includes(ctx.from.id);

/** Only pass if message text starts with a prefix */
export const startsWith = (prefix: string) => (ctx: BotContext): boolean =>
  (ctx.text || '').startsWith(prefix);

/** Only pass if message text ends with a suffix */
export const endsWith = (suffix: string) => (ctx: BotContext): boolean =>
  (ctx.text || '').endsWith(suffix);

/** Only pass if message text matches regex */
export const matches = (pattern: RegExp) => (ctx: BotContext): boolean =>
  pattern.test(ctx.text || '');

/** Combine filters with AND logic */
export const all = (...filters: Array<(ctx: BotContext) => boolean>) =>
  (ctx: BotContext): boolean => filters.every((f) => f(ctx));

/** Combine filters with OR logic */
export const any = (...filters: Array<(ctx: BotContext) => boolean>) =>
  (ctx: BotContext): boolean => filters.some((f) => f(ctx));

/** Negate a filter */
export const not = (filter: (ctx: BotContext) => boolean) =>
  (ctx: BotContext): boolean => !filter(ctx);
