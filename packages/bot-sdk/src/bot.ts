// ============================================
// DL Chat Bot SDK — Main Bot Class
// DEATH LEGION Team — Proprietary Software
// ============================================

import { BotConfig, Update, BotInfo, BotCommand, SendMessageOptions, Message, InlineResult } from './types';
import { BotContext } from './context';
import { Composer } from './composer';

const DEFAULT_API = 'https://dl-chat-api.death-legion-dlchat.workers.dev';

export class DLChatBot extends Composer {
  private token: string;
  private apiUrl: string;
  private config: BotConfig;
  private pollingActive = false;
  private updateOffset = 0;
  private botInfo?: BotInfo;

  constructor(tokenOrConfig: string | BotConfig) {
    super();
    if (typeof tokenOrConfig === 'string') {
      this.token = tokenOrConfig;
      this.config = { token: tokenOrConfig };
    } else {
      this.token = tokenOrConfig.token;
      this.config = tokenOrConfig;
    }
    this.apiUrl = this.config.apiUrl || DEFAULT_API;
  }

  // ——— API Client ——————————————————————————————

  async api<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const url = `${this.apiUrl}/bot${this.token}/${method}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ description: res.statusText })) as any;
      throw new Error(`[DLChatBot] API Error ${res.status}: ${err.description || 'Unknown error'}`);
    }

    const data = await res.json() as any;
    if (!data.ok) {
      throw new Error(`[DLChatBot] API Error: ${data.description || JSON.stringify(data)}`);
    }

    return data.result;
  }

  // ——— Bot Info ————————————————————————————————

  async getMe(): Promise<BotInfo> {
    const info = await this.api<BotInfo>('getMe');
    this.botInfo = info;
    return info;
  }

  // ——— Sending Messages ————————————————————————

  async sendMessage(chatId: string, text: string, opts?: SendMessageOptions): Promise<Message> {
    return this.api('sendMessage', { chat_id: chatId, text, ...opts });
  }

  async sendPhoto(chatId: string, photo: string, caption?: string, opts?: SendMessageOptions): Promise<Message> {
    return this.api('sendPhoto', { chat_id: chatId, photo, caption, ...opts });
  }

  async sendVideo(chatId: string, video: string, caption?: string, opts?: SendMessageOptions): Promise<Message> {
    return this.api('sendVideo', { chat_id: chatId, video, caption, ...opts });
  }

  async sendAudio(chatId: string, audio: string, caption?: string, opts?: SendMessageOptions): Promise<Message> {
    return this.api('sendAudio', { chat_id: chatId, audio, caption, ...opts });
  }

  async sendDocument(chatId: string, document: string, caption?: string, opts?: SendMessageOptions): Promise<Message> {
    return this.api('sendDocument', { chat_id: chatId, document, caption, ...opts });
  }

  async sendVoice(chatId: string, voice: string, caption?: string, opts?: SendMessageOptions): Promise<Message> {
    return this.api('sendVoice', { chat_id: chatId, voice, caption, ...opts });
  }

  async sendSticker(chatId: string, stickerId: string, opts?: SendMessageOptions): Promise<Message> {
    return this.api('sendSticker', { chat_id: chatId, sticker: stickerId, ...opts });
  }

  async sendPoll(
    chatId: string,
    question: string,
    options: string[],
    opts?: {
      is_anonymous?: boolean;
      is_multiple_choice?: boolean;
      is_quiz?: boolean;
      correct_option?: number;
      explanation?: string;
      close_at?: number;
    }
  ): Promise<Message> {
    return this.api('sendPoll', { chat_id: chatId, question, options, ...opts });
  }

  async sendLocation(chatId: string, lat: number, lon: number, opts?: SendMessageOptions): Promise<Message> {
    return this.api('sendLocation', { chat_id: chatId, latitude: lat, longitude: lon, ...opts });
  }

  async forwardMessage(chatId: string, fromChatId: string, messageId: string): Promise<Message> {
    return this.api('forwardMessage', { chat_id: chatId, from_chat_id: fromChatId, message_id: messageId });
  }

  async copyMessage(chatId: string, fromChatId: string, messageId: string, opts?: Partial<SendMessageOptions>): Promise<{ id: string }> {
    return this.api('copyMessage', { chat_id: chatId, from_chat_id: fromChatId, message_id: messageId, ...opts });
  }

  // ——— Message Management ——————————————————————

  async editMessageText(chatId: string, messageId: string, text: string, opts?: Partial<SendMessageOptions>): Promise<Message> {
    return this.api('editMessageText', { chat_id: chatId, message_id: messageId, text, ...opts });
  }

  async editMessageCaption(chatId: string, messageId: string, caption: string): Promise<Message> {
    return this.api('editMessageCaption', { chat_id: chatId, message_id: messageId, caption });
  }

  async editMessageReplyMarkup(chatId: string, messageId: string, replyMarkup: any): Promise<Message> {
    return this.api('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: replyMarkup });
  }

  async deleteMessage(chatId: string, messageId: string): Promise<boolean> {
    return this.api('deleteMessage', { chat_id: chatId, message_id: messageId });
  }

  async pinMessage(chatId: string, messageId: string, disableNotification = false): Promise<boolean> {
    return this.api('pinMessage', { chat_id: chatId, message_id: messageId, disable_notification: disableNotification });
  }

  async unpinMessage(chatId: string, messageId?: string): Promise<boolean> {
    return this.api('unpinMessage', { chat_id: chatId, message_id: messageId });
  }

  // ——— Reactions ———————————————————————————————

  async addReaction(chatId: string, messageId: string, emoji: string): Promise<boolean> {
    return this.api('setMessageReaction', { chat_id: chatId, message_id: messageId, reaction: emoji });
  }

  // ——— Chat Management —————————————————————————

  async getChat(chatId: string): Promise<any> {
    return this.api('getChat', { chat_id: chatId });
  }

  async getChatMember(chatId: string, userId: string): Promise<any> {
    return this.api('getChatMember', { chat_id: chatId, user_id: userId });
  }

  async getChatAdministrators(chatId: string): Promise<any[]> {
    return this.api('getChatAdministrators', { chat_id: chatId });
  }

  async getChatMemberCount(chatId: string): Promise<number> {
    return this.api('getChatMemberCount', { chat_id: chatId });
  }

  async banMember(chatId: string, userId: string, reason?: string): Promise<boolean> {
    return this.api('banChatMember', { chat_id: chatId, user_id: userId, reason });
  }

  async unbanMember(chatId: string, userId: string): Promise<boolean> {
    return this.api('unbanChatMember', { chat_id: chatId, user_id: userId });
  }

  async restrictMember(chatId: string, userId: string, permissions: Record<string, boolean>, until?: number): Promise<boolean> {
    return this.api('restrictChatMember', { chat_id: chatId, user_id: userId, permissions, until_date: until });
  }

  async promoteMember(chatId: string, userId: string, rights: Record<string, boolean>): Promise<boolean> {
    return this.api('promoteChatMember', { chat_id: chatId, user_id: userId, ...rights });
  }

  async leaveChat(chatId: string): Promise<boolean> {
    return this.api('leaveChat', { chat_id: chatId });
  }

  // ——— Callback Queries ————————————————————————

  async answerCallbackQuery(callbackQueryId: string, text?: string, opts?: { show_alert?: boolean; url?: string; cache_time?: number }): Promise<boolean> {
    return this.api('answerCallbackQuery', { callback_query_id: callbackQueryId, text, ...opts });
  }

  // ——— Inline Queries ——————————————————————————

  async answerInlineQuery(inlineQueryId: string, results: InlineResult[], opts?: { cache_time?: number; is_personal?: boolean; next_offset?: string }): Promise<boolean> {
    return this.api('answerInlineQuery', { inline_query_id: inlineQueryId, results, ...opts });
  }

  // ——— Commands —————————————————————————————————

  async setMyCommands(commands: BotCommand[], scope?: string): Promise<boolean> {
    return this.api('setMyCommands', { commands, scope });
  }

  async getMyCommands(scope?: string): Promise<BotCommand[]> {
    return this.api('getMyCommands', { scope });
  }

  async deleteMyCommands(scope?: string): Promise<boolean> {
    return this.api('deleteMyCommands', { scope });
  }

  // ——— Typing Indicator ————————————————————————

  async sendTyping(chatId: string, action = 'typing'): Promise<boolean> {
    return this.api('sendChatAction', { chat_id: chatId, action });
  }

  // ——— Updates ——————————————————————————————————

  async getUpdates(offset?: number, limit = 100, timeout = 30, allowedUpdates?: string[]): Promise<Update[]> {
    return this.api('getUpdates', {
      offset: offset ?? this.updateOffset,
      limit,
      timeout,
      allowed_updates: allowedUpdates,
    });
  }

  // ——— Polling —————————————————————————————————

  async start(): Promise<void> {
    await this.getMe();
    console.log(`[DLChatBot] Starting bot @${this.botInfo?.username}...`);

    if (this.config.webhook) {
      await this.startWebhook();
    } else {
      await this.startPolling();
    }
  }

  async stop(): Promise<void> {
    this.pollingActive = false;
    console.log('[DLChatBot] Stopped.');
  }

  private async startPolling(): Promise<void> {
    this.pollingActive = true;
    const interval = this.config.polling?.interval ?? 1000;
    const timeout = this.config.polling?.timeout ?? 30;
    const limit = this.config.polling?.limit ?? 100;

    console.log('[DLChatBot] Polling started.');

    while (this.pollingActive) {
      try {
        const updates = await this.getUpdates(this.updateOffset, limit, timeout);

        for (const update of updates) {
          this.updateOffset = parseInt(update.update_id) + 1;
          await this.handleUpdate(update).catch((err) => {
            console.error('[DLChatBot] Update handler error:', err);
          });
        }
      } catch (err: any) {
        if (this.pollingActive) {
          console.error('[DLChatBot] Polling error:', err.message);
          await new Promise((r) => setTimeout(r, 5000)); // retry after 5s
        }
      }

      if (this.pollingActive) {
        await new Promise((r) => setTimeout(r, interval));
      }
    }
  }

  private async startWebhook(): Promise<void> {
    // Webhook mode: set webhook URL and return (handled by server)
    const webhookConfig = this.config.webhook!;
    await this.api('setWebhook', {
      url: webhookConfig.url,
      secret_token: webhookConfig.secret,
    });
    console.log(`[DLChatBot] Webhook set to ${webhookConfig.url}`);
  }

  // Process a single update
  async handleUpdate(update: Update): Promise<void> {
    const ctx = new BotContext(update, this);
    await this.middleware(ctx, async () => {});
  }

  // Called by webhook handlers
  async processWebhookUpdate(body: unknown): Promise<void> {
    const update = body as Update;
    await this.handleUpdate(update);
  }
}
