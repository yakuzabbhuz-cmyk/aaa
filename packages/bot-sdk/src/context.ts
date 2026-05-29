// ============================================
// DL Chat Bot SDK — Context Class
// DEATH LEGION Team — Proprietary Software
// ============================================

import { Update, Message, User, Chat, CallbackQuery, InlineQuery, SendMessageOptions, Middleware } from './types';

export class BotContext {
  readonly update: Update;
  readonly bot: any; // DLChatBot
  private _state: Record<string, unknown> = {};

  constructor(update: Update, bot: any) {
    this.update = update;
    this.bot = bot;
  }

  // ——— Shorthand Getters ———————————————————————

  get message(): Message | undefined { return this.update.message; }
  get editedMessage(): Message | undefined { return this.update.edited_message; }
  get callbackQuery(): CallbackQuery | undefined { return this.update.callback_query; }
  get inlineQuery(): InlineQuery | undefined { return this.update.inline_query; }

  get from(): User | undefined {
    return (
      this.message?.from ||
      this.callbackQuery?.from ||
      this.inlineQuery?.from
    );
  }

  get chat(): Chat | undefined {
    return this.message?.chat;
  }

  get chatId(): string | undefined {
    return this.chat?.id;
  }

  get userId(): string | undefined {
    return this.from?.id;
  }

  get text(): string | undefined {
    return this.message?.text || this.message?.content;
  }

  // State management (for middleware)
  get state(): Record<string, unknown> { return this._state; }
  set<K extends string>(key: K, value: unknown): void { this._state[key] = value; }
  get<K extends string>(key: K): unknown { return this._state[key]; }

  // ——— Reply Helpers ————————————————————————————

  async reply(text: string, opts?: SendMessageOptions): Promise<Message> {
    const chatId = this.chatId;
    if (!chatId) throw new Error('No chat context available');
    return this.bot.sendMessage(chatId, text, {
      reply_to_id: this.message?.id,
      ...opts,
    });
  }

  async replyWithPhoto(photo: string, caption?: string, opts?: SendMessageOptions): Promise<Message> {
    const chatId = this.chatId!;
    return this.bot.sendPhoto(chatId, photo, caption, { reply_to_id: this.message?.id, ...opts });
  }

  async replyWithVideo(video: string, caption?: string, opts?: SendMessageOptions): Promise<Message> {
    const chatId = this.chatId!;
    return this.bot.sendVideo(chatId, video, caption, { reply_to_id: this.message?.id, ...opts });
  }

  async replyWithAudio(audio: string, caption?: string, opts?: SendMessageOptions): Promise<Message> {
    const chatId = this.chatId!;
    return this.bot.sendAudio(chatId, audio, caption, { reply_to_id: this.message?.id, ...opts });
  }

  async replyWithDocument(doc: string, caption?: string, opts?: SendMessageOptions): Promise<Message> {
    const chatId = this.chatId!;
    return this.bot.sendDocument(chatId, doc, caption, { reply_to_id: this.message?.id, ...opts });
  }

  async replyWithSticker(stickerId: string): Promise<Message> {
    return this.bot.sendSticker(this.chatId!, stickerId);
  }

  async replyWithPoll(question: string, options: string[], opts?: any): Promise<Message> {
    return this.bot.sendPoll(this.chatId!, question, options, opts);
  }

  // ——— Send to Chat (no reply) ——————————————————

  async send(text: string, opts?: SendMessageOptions): Promise<Message> {
    return this.bot.sendMessage(this.chatId!, text, opts);
  }

  // ——— Callback Query ———————————————————————————

  async answerCallbackQuery(text?: string, opts?: { show_alert?: boolean; url?: string }): Promise<boolean> {
    if (!this.callbackQuery) throw new Error('No callback query in context');
    return this.bot.answerCallbackQuery(this.callbackQuery.id, text, opts);
  }

  async editMessageText(text: string, opts?: Partial<SendMessageOptions>): Promise<Message> {
    const msg = this.callbackQuery?.message || this.message;
    if (!msg) throw new Error('No message in context');
    return this.bot.editMessageText(msg.chat.id, msg.id, text, opts);
  }

  async editMessageReplyMarkup(markup: any): Promise<Message> {
    const msg = this.callbackQuery?.message || this.message;
    if (!msg) throw new Error('No message in context');
    return this.bot.editMessageReplyMarkup(msg.chat.id, msg.id, markup);
  }

  // ——— Inline Query —————————————————————————————

  async answerInlineQuery(results: any[], opts?: any): Promise<boolean> {
    if (!this.inlineQuery) throw new Error('No inline query in context');
    return this.bot.answerInlineQuery(this.inlineQuery.id, results, opts);
  }

  // ——— Typing ———————————————————————————————————

  async typing(action = 'typing'): Promise<boolean> {
    return this.bot.sendTyping(this.chatId!, action);
  }

  // ——— Reactions ————————————————————————————————

  async react(emoji: string): Promise<boolean> {
    if (!this.message) throw new Error('No message to react to');
    return this.bot.addReaction(this.chatId!, this.message.id, emoji);
  }

  // ——— Member Actions ———————————————————————————

  async ban(userId: string, reason?: string): Promise<boolean> {
    return this.bot.banMember(this.chatId!, userId, reason);
  }

  async unban(userId: string): Promise<boolean> {
    return this.bot.unbanMember(this.chatId!, userId);
  }

  // ——— Matches —————————————————————————————————

  match(pattern: string | RegExp): RegExpMatchArray | null {
    const text = this.text || '';
    if (typeof pattern === 'string') {
      return text.includes(pattern) ? [text] : null;
    }
    return text.match(pattern);
  }
}
