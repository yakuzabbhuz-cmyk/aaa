// ============================================
// DL Chat - Presence Durable Object
// Global online/offline status tracking per user
// ============================================

interface PresenceSession {
  socket: WebSocket;
  userId: string;
  status: 'online' | 'away' | 'offline';
  lastActivity: number;
  subscribedChats: Set<string>;
  deviceInfo?: string;
}

export class Presence implements DurableObject {
  private sessions: Map<string, PresenceSession> = new Map();
  private state: DurableObjectState;
  private userId: string = '';
  private currentStatus: 'online' | 'away' | 'offline' = 'offline';
  private lastSeen: number = 0;

  constructor(state: DurableObjectState, env: unknown) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // WebSocket upgrade for user's presence connection
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    // Internal: Send notification to user's connected sessions
    if (path === '/notify' && request.method === 'POST') {
      const event = await request.json<Record<string, unknown>>();
      this.notifyUser(event);
      return new Response('OK');
    }

    // Internal: Get presence status
    if (path === '/status') {
      return Response.json({
        userId: this.userId,
        status: this.currentStatus,
        lastSeen: this.lastSeen,
        sessions: this.sessions.size,
      });
    }

    // Internal: Subscribe to events for a specific chat
    if (path === '/subscribe' && request.method === 'POST') {
      const { chatId } = await request.json<{ chatId: string }>();
      for (const session of this.sessions.values()) {
        session.subscribedChats.add(chatId);
      }
      return new Response('OK');
    }

    return new Response('Not Found', { status: 404 });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const deviceInfo = url.searchParams.get('device');

    if (!userId) {
      return new Response('Missing userId', { status: 400 });
    }

    this.userId = userId;

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server);

    const sessionId = crypto.randomUUID();
    const session: PresenceSession = {
      socket: server,
      userId,
      status: 'online',
      lastActivity: Date.now(),
      subscribedChats: new Set(),
      deviceInfo: deviceInfo || undefined,
    };

    this.sessions.set(sessionId, session);

    // Update presence
    this.currentStatus = 'online';
    this.lastSeen = Date.now();

    // Send initial state
    this.sendToSession(session, {
      type: 'connected',
      userId,
      status: 'online',
      timestamp: Date.now(),
    });

    server.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string);
        await this.handlePresenceMessage(sessionId, session, data);
        session.lastActivity = Date.now();
      } catch (e) {
        this.sendToSession(session, { type: 'error', message: 'Invalid message' });
      }
    });

    server.addEventListener('close', () => {
      this.sessions.delete(sessionId);
      this.lastSeen = Date.now();

      if (this.sessions.size === 0) {
        this.currentStatus = 'offline';
      }
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async handlePresenceMessage(
    sessionId: string,
    session: PresenceSession,
    data: Record<string, unknown>
  ): Promise<void> {
    switch (data.type) {
      case 'presence':
        const newStatus = data.status as 'online' | 'away' | 'offline';
        session.status = newStatus;

        // Overall status is 'online' if any session is online
        const hasOnline = Array.from(this.sessions.values()).some(s => s.status === 'online');
        this.currentStatus = hasOnline ? 'online' : newStatus;
        this.lastSeen = Date.now();
        break;

      case 'subscribe':
        // Subscribe to events for a chat
        const chatId = data.chatId as string;
        session.subscribedChats.add(chatId);
        break;

      case 'unsubscribe':
        session.subscribedChats.delete(data.chatId as string);
        break;

      case 'typing':
        // Forward typing indicator to ChatRoom DO
        // The client handles this directly with the ChatRoom DO
        break;

      case 'message_read':
        // Forward read receipt
        break;

      case 'ping':
        this.sendToSession(session, { type: 'pong', timestamp: Date.now() });
        break;

      case 'activity':
        session.lastActivity = Date.now();
        if (session.status !== 'online') {
          session.status = 'online';
          this.currentStatus = 'online';
        }
        break;
    }
  }

  private notifyUser(event: Record<string, unknown>): void {
    const message = JSON.stringify(event);
    const deadSessions: string[] = [];

    for (const [id, session] of this.sessions) {
      try {
        session.socket.send(message);
      } catch (e) {
        deadSessions.push(id);
      }
    }

    for (const id of deadSessions) {
      this.sessions.delete(id);
    }
  }

  private sendToSession(session: PresenceSession, event: Record<string, unknown>): void {
    try {
      session.socket.send(JSON.stringify(event));
    } catch (e) {
      // Session closed
    }
  }

  getStatus(): { status: string; lastSeen: number } {
    return { status: this.currentStatus, lastSeen: this.lastSeen };
  }
}
