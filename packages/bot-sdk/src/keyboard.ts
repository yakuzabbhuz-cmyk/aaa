// ============================================
// DL Chat Bot SDK — Keyboard Builders
// DEATH LEGION Team — Proprietary Software
// ============================================

import { InlineKeyboard, ReplyKeyboard, RemoveKeyboard, InlineKeyboardButton, KeyboardButton } from './types';

// ——— Inline Keyboard —————————————————————————————

export class InlineKeyboardBuilder {
  private rows: InlineKeyboardButton[][] = [];
  private currentRow: InlineKeyboardButton[] = [];

  button(text: string, callbackData: string): this {
    this.currentRow.push({ text, callback_data: callbackData });
    return this;
  }

  url(text: string, url: string): this {
    this.currentRow.push({ text, url });
    return this;
  }

  webApp(text: string, url: string): this {
    this.currentRow.push({ text, web_app: { url } });
    return this;
  }

  switchInline(text: string, query = ''): this {
    this.currentRow.push({ text, switch_inline_query: query });
    return this;
  }

  switchInlineCurrent(text: string, query = ''): this {
    this.currentRow.push({ text, switch_inline_query_current_chat: query });
    return this;
  }

  row(...buttons: InlineKeyboardButton[]): this {
    if (this.currentRow.length > 0) {
      this.rows.push([...this.currentRow]);
      this.currentRow = [];
    }
    this.rows.push(buttons);
    return this;
  }

  newRow(): this {
    if (this.currentRow.length > 0) {
      this.rows.push([...this.currentRow]);
      this.currentRow = [];
    }
    return this;
  }

  build(): InlineKeyboard {
    if (this.currentRow.length > 0) {
      this.rows.push([...this.currentRow]);
    }
    return { type: 'inline_keyboard', inline_keyboard: this.rows };
  }

  // Static helpers
  static from(buttons: Array<Array<{ text: string; data: string }>>): InlineKeyboard {
    return {
      type: 'inline_keyboard',
      inline_keyboard: buttons.map((row) =>
        row.map(({ text, data }) => ({ text, callback_data: data }))
      ),
    };
  }
}

// ——— Reply Keyboard —————————————————————————————

export class ReplyKeyboardBuilder {
  private rows: KeyboardButton[][] = [];
  private currentRow: KeyboardButton[] = [];
  private options: { resize_keyboard?: boolean; one_time_keyboard?: boolean; placeholder?: string } = {};

  button(text: string, requestContact = false, requestLocation = false): this {
    this.currentRow.push({ text, request_contact: requestContact, request_location: requestLocation });
    return this;
  }

  contact(text: string): this {
    return this.button(text, true, false);
  }

  location(text: string): this {
    return this.button(text, false, true);
  }

  row(...buttons: KeyboardButton[]): this {
    if (this.currentRow.length > 0) {
      this.rows.push([...this.currentRow]);
      this.currentRow = [];
    }
    this.rows.push(buttons);
    return this;
  }

  newRow(): this {
    if (this.currentRow.length > 0) {
      this.rows.push([...this.currentRow]);
      this.currentRow = [];
    }
    return this;
  }

  resize(value = true): this {
    this.options.resize_keyboard = value;
    return this;
  }

  oneTime(value = true): this {
    this.options.one_time_keyboard = value;
    return this;
  }

  placeholder(text: string): this {
    this.options.placeholder = text;
    return this;
  }

  build(): ReplyKeyboard {
    if (this.currentRow.length > 0) {
      this.rows.push([...this.currentRow]);
    }
    return { type: 'keyboard', keyboard: this.rows, ...this.options };
  }
}

// ——— Remove Keyboard ————————————————————————————

export function removeKeyboard(selective = false): RemoveKeyboard {
  return { type: 'remove_keyboard', selective };
}

// ——— Convenience Functions ——————————————————————

/** Create inline keyboard from simple 2D array */
export function inlineKeyboard(buttons: Array<Array<[string, string]>>): InlineKeyboard {
  return {
    type: 'inline_keyboard',
    inline_keyboard: buttons.map((row) =>
      row.map(([text, data]) => ({ text, callback_data: data }))
    ),
  };
}

/** Create a single-row confirm/cancel keyboard */
export function confirmKeyboard(confirmData: string, cancelData: string): InlineKeyboard {
  return inlineKeyboard([
    [['✅ Confirm', confirmData], ['❌ Cancel', cancelData]],
  ]);
}

/** Create a paginator keyboard */
export function paginatorKeyboard(
  page: number,
  total: number,
  prefix: string,
  pageSize = 10
): InlineKeyboard {
  const totalPages = Math.ceil(total / pageSize);
  const buttons: Array<[string, string]> = [];

  if (page > 0) buttons.push(['◀ Prev', `${prefix}_page_${page - 1}`]);
  buttons.push([`${page + 1} / ${totalPages}`, `${prefix}_noop`]);
  if (page < totalPages - 1) buttons.push(['Next ▶', `${prefix}_page_${page + 1}`]);

  return inlineKeyboard([buttons]);
}
