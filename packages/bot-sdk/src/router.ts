// ============================================
// DL Chat Bot SDK — Router (Scene Manager)
// DEATH LEGION Team — Proprietary Software
// ============================================

import { Composer } from './composer';
import { BotContext } from './context';
import { Handler } from './types';

const SESSION_KEY = '__router_scene__';

export class Scene extends Composer {
  readonly id: string;
  private enterHandlers: Handler<BotContext>[] = [];
  private leaveHandlers: Handler<BotContext>[] = [];

  constructor(id: string) {
    super();
    this.id = id;
  }

  enter(...handlers: Handler<BotContext>[]): this {
    this.enterHandlers.push(...handlers);
    return this;
  }

  leave(...handlers: Handler<BotContext>[]): this {
    this.leaveHandlers.push(...handlers);
    return this;
  }

  async onEnter(ctx: BotContext): Promise<void> {
    for (const h of this.enterHandlers) await h(ctx);
  }

  async onLeave(ctx: BotContext): Promise<void> {
    for (const h of this.leaveHandlers) await h(ctx);
  }
}

export class Router {
  private scenes: Map<string, Scene> = new Map();
  private sessionStore: Map<string, string> = new Map();

  register(...scenes: Scene[]): this {
    for (const scene of scenes) {
      this.scenes.set(scene.id, scene);
    }
    return this;
  }

  private getSession(userId: string): string | undefined {
    return this.sessionStore.get(userId);
  }

  private setSession(userId: string, sceneId: string | null): void {
    if (sceneId === null) {
      this.sessionStore.delete(userId);
    } else {
      this.sessionStore.set(userId, sceneId);
    }
  }

  enter(sceneId: string): (ctx: BotContext) => Promise<void> {
    return async (ctx: BotContext) => {
      const userId = ctx.userId || 'unknown';
      const currentScene = this.getSession(userId);

      // Leave current scene
      if (currentScene) {
        const scene = this.scenes.get(currentScene);
        if (scene) await scene.onLeave(ctx);
      }

      this.setSession(userId, sceneId);
      const nextScene = this.scenes.get(sceneId);
      if (!nextScene) throw new Error(`Scene '${sceneId}' not found`);
      await nextScene.onEnter(ctx);
    };
  }

  leave(): (ctx: BotContext) => Promise<void> {
    return async (ctx: BotContext) => {
      const userId = ctx.userId || 'unknown';
      const currentScene = this.getSession(userId);
      if (currentScene) {
        const scene = this.scenes.get(currentScene);
        if (scene) await scene.onLeave(ctx);
        this.setSession(userId, null);
      }
    };
  }

  // Middleware that routes updates to the active scene
  get middleware() {
    return async (ctx: BotContext, next: () => Promise<void>) => {
      const userId = ctx.userId || 'unknown';
      const sceneId = this.getSession(userId);

      if (sceneId) {
        const scene = this.scenes.get(sceneId);
        if (scene) {
          // Attach scene helpers to context
          (ctx as any).scene = {
            enter: this.enter.bind(this),
            leave: this.leave().bind(this),
            current: sceneId,
          };
          await scene.middleware(ctx, next);
          return;
        }
      }

      await next();
    };
  }
}
