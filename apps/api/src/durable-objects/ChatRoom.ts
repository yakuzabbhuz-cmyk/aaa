// ============================================
// DL Chat - ChatRoom Durable Object
// Real-time WebSocket messaging for each chat
// ============================================

export interface WebSocketSession {
  socket: WebSocket;
  userId: string;
  chatId: string;
  isTyping: boolean;
  typingTimeout?: ReturnType<typeof setTimeout>;
}

export class ChatRoom implements DurableObject {
  private sessions: Map<string, WebSocketSession> = new Map();
  private state: DurableObjectState;
  private chatId: string = '';

  constructor(state: DurableObjectState, env: unknown) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    // Internal HTTP API for broadcasting
    if (path === '/broadcast' && request.method === 'POST') {
      const event = await request.json<Record<string, unknown>>();
      await this.broadcast(event);
      return new Response('OK', { status: 200 });
    }

    if (path === '/ping') {
      return new Response('pong', { status: 200 });
    }

    return new Response('Not Found', { status: 404 });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const chatId = url.searchParams.get('chatId');

    if (!userId || !chatId) {
      return new Response('Missing userId or chatId', { status: 400 });
    }

    this.chatId = chatId;

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server);

    const sessionId = crypto.randomUUID();
    const session: WebSocketSession = {
      socket: server,
      userId,
      chatId,
      isTyping: false,
    };

    this.sessions.set(sessionId, session);

    // Send join notification
    this.broadcastToOthers(userId, {
      type: 'user_joined',
      chatId,
      userId,
      timestamp: Date.now(),
    });

    // Send online members list to new user
    const onlineMembers = Array.from(this.sessions.values()).map(s => s.userId);
    this.sendToSession(session, {
      type: 'online_members',
      chatId,
      members: [...new Set(onlineMembers)],
    });

    server.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string);
        await this.handleClientMessage(sessionId, session, data);
      } catch (e) {
        this.sendToSession(session, { type: 'error', message: 'Invalid message format' });
      }
    });

    server.addEventListener('close', (event) => {
      this.sessions.delete(sessionId);

      // Clear typing indicator
      if (session.isTyping) {
        this.broadcastToOthers(userId, {
          type: 'typing',
          chatId,
          userId,
          isTyping: false,
        });
      }

      // Notify others user left
      this.broadcastToOthers(userId, {
        type: 'user_left',
        chatId,
        userId,
        timestamp: Date.now(),
      });
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async handleClientMessage(
    sessionId: string,
    session: WebSocketSession,
    data: Record<string, unknown>
  ): Promise<void> {
    switch (data.type) {
      case 'typing':
        session.isTyping = data.isTyping as boolean;

        // Broadcast typing indicator to all others in this chat
        this.broadcastToOthers(session.userId, {
          type: 'typing',
          chatId: session.chatId,
          userId: session.userId,
          isTyping: data.isTyping,
        });

        // Auto-clear typing after 5 seconds
        if (data.isTyping) {
          if (session.typingTimeout) {
            clearTimeout(session.typingTimeout);
          }
          session.typingTimeout = setTimeout(() => {
            session.isTyping = false;
            this.broadcastToOthers(session.userId, {
              type: 'typing',
              chatId: session.chatId,
              userId: session.userId,
              isTyping: false,
            });
          }, 5000);
        }
        break;

      case 'ping':
        this.sendToSession(session, { type: 'pong', timestamp: Date.now() });
        break;

      case 'message_read':
        this.broadcastToOthers(session.userId, {
          type: 'message_read',
          messageId: data.messageId,
          chatId: session.chatId,
          userId: session.userId,
          readAt: Date.now(),
        });
        break;

      default:
        this.sendToSession(session, { type: 'error', message: `Unknown event type: ${data.type}` });
    }
  }

  async broadcast(event: Record<string, unknown>): Promise<void> {
    const message = JSON.stringify(event);
    const deadSessions: string[] = [];

    for (const [id, session] of this.sessions) {
      try {
        session.socket.send(message);
      } catch (e) {
        deadSessions.push(id);
      }
    }

    // Clean up dead sessions
    for (const id of deadSessions) {
      this.sessions.delete(id);
    }
  }

  private broadcastToOthers(senderId: string, event: Record<string, unknown>): void {
    const message = JSON.stringify(event);
    const deadSessions: string[] = [];

    for (const [id, session] of this.sessions) {
      if (session.userId !== senderId) {
        try {
          session.socket.send(message);
        } catch (e) {
          deadSessions.push(id);
        }
      }
    }

    for (const id of deadSessions) {
      this.sessions.delete(id);
    }
  }

  private sendToSession(session: WebSocketSession, event: Record<string, unknown>): void {
    try {
      session.socket.send(JSON.stringify(event));
    } catch (e) {
      // Session may be closed
    }
  }

  getOnlineMembers(): string[] {
    return [...new Set(Array.from(this.sessions.values()).map(s => s.userId))];
  }
}
