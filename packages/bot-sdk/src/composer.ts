// ============================================
// DL Chat Bot SDK — Composer (Middleware Chain)
// DEATH LEGION Team — Proprietary Software
// ============================================

import { BotContext } from './context';
import { Middleware, Handler } from './types';

type MiddlewareFn = (ctx: BotContext, next: () => Promise<void>) => Promise<void> | void;

export class Composer {
  private middlewares: MiddlewareFn[] = [];

  use(...fns: MiddlewareFn[]): this {
    this.middlewares.push(...fns);
    return this;
  }

  on(eventType: string, ...handlers: Handler<BotContext>[]): this {
    return this.use(async (ctx, next) => {
      if (ctx.update.type === eventType || eventType === 'all') {
        for (const h of handlers) await h(ctx);
      } else {
        await next();
      }
    });
  }

  command(cmd: string | string[], ...handlers: Handler<BotContext>[]): this {
    const cmds = Array.isArray(cmd) ? cmd : [cmd];
    return this.use(async (ctx, next) => {
      const text = ctx.text || '';
      const matched = cmds.some((c) => {
        const pattern = c.startsWith('/') ? c : `/${c}`;
        return text === pattern || text.startsWith(`${pattern} `) || text.startsWith(`${pattern}@`);
      });

      if (matched && (ctx.update.type === 'message' || ctx.update.type === 'bot_command')) {
        // Parse args
        const parts = text.split(' ');
        (ctx as any)._commandArgs = parts.slice(1);
        (ctx as any)._command = parts[0];
        for (const h of handlers) await h(ctx);
      } else {
        await next();
      }
    });
  }

  hears(pattern: string | RegExp | Array<string | RegExp>, ...handlers: Handler<BotContext>[]): this {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    return this.use(async (ctx, next) => {
      const text = ctx.text || '';
      const matched = patterns.some((p) =>
        typeof p === 'string' ? text.includes(p) : p.test(text)
      );
      if (matched && ctx.update.type === 'message') {
        for (const h of handlers) await h(ctx);
      } else {
        await next();
      }
    });
  }

  action(data: string | RegExp | Array<string | RegExp>, ...handlers: Handler<BotContext>[]): this {
    const patterns = Array.isArray(data) ? data : [data];
    return this.use(async (ctx, next) => {
      if (ctx.update.type !== 'callback_query') { await next(); return; }
      const cbData = ctx.callbackQuery?.data || '';
      const matched = patterns.some((p) =>
        typeof p === 'string' ? cbData === p || cbData.startsWith(p) : p.test(cbData)
      );
      if (matched) {
        for (const h of handlers) await h(ctx);
      } else {
        await next();
      }
    });
  }

  inlineQuery(pattern: string | RegExp, ...handlers: Handler<BotContext>[]): this {
    return this.use(async (ctx, next) => {
      if (ctx.update.type !== 'inline_query') { await next(); return; }
      const query = ctx.inlineQuery?.query || '';
      const matched = typeof pattern === 'string' ? query.includes(pattern) : pattern.test(query);
      if (matched) {
        for (const h of handlers) await h(ctx);
      } else {
        await next();
      }
    });
  }

  reaction(emoji?: string | string[], ...handlers: Handler<BotContext>[]): this {
    const emojis = emoji ? (Array.isArray(emoji) ? emoji : [emoji]) : null;
    return this.use(async (ctx, next) => {
      if (ctx.update.type !== 'reaction') { await next(); return; }
      const reactionEmoji = ctx.update.reaction?.emoji;
      if (!emojis || (reactionEmoji && emojis.includes(reactionEmoji))) {
        for (const h of handlers) await h(ctx);
      } else {
        await next();
      }
    });
  }

  // Filter: only process if predicate passes
  filter(predicate: (ctx: BotContext) => boolean | Promise<boolean>, ...handlers: Handler<BotContext>[]): this {
    return this.use(async (ctx, next) => {
      if (await predicate(ctx)) {
        for (const h of handlers) await h(ctx);
      } else {
        await next();
      }
    });
  }

  // Catch errors
  catch(handler: (err: Error, ctx: BotContext) => void): this {
    const originalMiddlewares = [...this.middlewares];
    this.middlewares = [];
    return this.use(async (ctx, next) => {
      try {
        await runMiddlewares(originalMiddlewares, ctx, next);
      } catch (err: any) {
        handler(err, ctx);
      }
    });
  }

  // Build the middleware chain
  get middleware(): MiddlewareFn {
    return async (ctx: BotContext, next: () => Promise<void>) => {
      await runMiddlewares(this.middlewares, ctx, next);
    };
  }
}

async function runMiddlewares(
  middlewares: MiddlewareFn[],
  ctx: BotContext,
  finalNext: () => Promise<void>
): Promise<void> {
  let index = -1;

  const dispatch = async (i: number): Promise<void> => {
    if (i <= index) throw new Error('next() called multiple times');
    index = i;
    const fn = i < middlewares.length ? middlewares[i] : finalNext;
    if (fn) await fn(ctx, () => dispatch(i + 1));
  };

  await dispatch(0);
}
