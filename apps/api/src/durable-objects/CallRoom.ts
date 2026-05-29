// ============================================
// DL Chat - CallRoom Durable Object
// WebRTC Signaling for voice/video calls
// ============================================

interface CallParticipantSession {
  socket: WebSocket;
  userId: string;
  callId: string;
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
}

interface SignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate';
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  targetUserId?: string;
}

export class CallRoom implements DurableObject {
  private participants: Map<string, CallParticipantSession> = new Map();
  private state: DurableObjectState;
  private callId: string = '';
  private callStatus: 'ringing' | 'active' | 'ended' = 'ringing';
  private startedAt: number | null = null;

  constructor(state: DurableObjectState, env: unknown) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // WebSocket upgrade for signaling
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }

    // Internal endpoints
    if (path === '/signal' && request.method === 'POST') {
      const { signal, fromUserId } = await request.json<{ signal: SignalMessage; fromUserId: string }>();
      this.routeSignal(fromUserId, signal);
      return new Response('OK');
    }

    if (path === '/end' && request.method === 'POST') {
      await this.endCall();
      return new Response('OK');
    }

    if (path === '/participants') {
      const participants = Array.from(this.participants.values()).map(p => ({
        userId: p.userId,
        isMuted: p.isMuted,
        isVideoOn: p.isVideoOn,
        isScreenSharing: p.isScreenSharing,
      }));
      return Response.json({ participants });
    }

    return new Response('Not Found', { status: 404 });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const callId = url.searchParams.get('callId');

    if (!userId || !callId) {
      return new Response('Missing userId or callId', { status: 400 });
    }

    this.callId = callId;

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server);

    const session: CallParticipantSession = {
      socket: server,
      userId,
      callId,
      isMuted: false,
      isVideoOn: false,
      isScreenSharing: false,
    };

    this.participants.set(userId, session);

    // Update call status
    if (this.callStatus === 'ringing' && this.participants.size >= 2) {
      this.callStatus = 'active';
      this.startedAt = Date.now();
    }

    // Notify all participants about new participant
    this.broadcastAll({
      type: 'participant_joined',
      callId,
      userId,
      participants: this.getParticipantList(),
    });

    // Send current participants to new user
    this.sendToUser(userId, {
      type: 'call_state',
      callId,
      status: this.callStatus,
      participants: this.getParticipantList(),
    });

    server.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string);
        await this.handleSignalingMessage(userId, data);
      } catch (e) {
        this.sendToUser(userId, { type: 'error', message: 'Invalid signaling message' });
      }
    });

    server.addEventListener('close', () => {
      this.participants.delete(userId);

      this.broadcastAll({
        type: 'participant_left',
        callId,
        userId,
        participants: this.getParticipantList(),
      });

      // End call if no participants
      if (this.participants.size === 0) {
        this.callStatus = 'ended';
      }
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async handleSignalingMessage(
    fromUserId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    switch (data.type) {
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        // Route WebRTC signal to target user
        const targetUserId = data.targetUserId as string;
        if (targetUserId) {
          this.sendToUser(targetUserId, {
            type: 'call_signal',
            fromUserId,
            signal: data,
          });
        } else {
          // Broadcast to all others
          for (const [uid, participant] of this.participants) {
            if (uid !== fromUserId) {
              this.sendToUser(uid, {
                type: 'call_signal',
                fromUserId,
                signal: data,
              });
            }
          }
        }
        break;

      case 'mute':
        const session = this.participants.get(fromUserId);
        if (session) {
          session.isMuted = data.isMuted as boolean;
          this.broadcastAll({
            type: 'participant_muted',
            callId: this.callId,
            userId: fromUserId,
            isMuted: session.isMuted,
          });
        }
        break;

      case 'video_toggle':
        const videoSession = this.participants.get(fromUserId);
        if (videoSession) {
          videoSession.isVideoOn = data.isVideoOn as boolean;
          this.broadcastAll({
            type: 'participant_video',
            callId: this.callId,
            userId: fromUserId,
            isVideoOn: videoSession.isVideoOn,
          });
        }
        break;

      case 'screen_share':
        const screenSession = this.participants.get(fromUserId);
        if (screenSession) {
          screenSession.isScreenSharing = data.isScreenSharing as boolean;
          this.broadcastAll({
            type: 'screen_share',
            callId: this.callId,
            userId: fromUserId,
            isScreenSharing: screenSession.isScreenSharing,
          });
        }
        break;

      case 'ping':
        this.sendToUser(fromUserId, { type: 'pong', timestamp: Date.now() });
        break;
    }
  }

  private routeSignal(fromUserId: string, signal: SignalMessage): void {
    if (signal.targetUserId) {
      this.sendToUser(signal.targetUserId, {
        type: 'call_signal',
        fromUserId,
        signal,
      });
    } else {
      for (const [uid] of this.participants) {
        if (uid !== fromUserId) {
          this.sendToUser(uid, {
            type: 'call_signal',
            fromUserId,
            signal,
          });
        }
      }
    }
  }

  private async endCall(): Promise<void> {
    this.callStatus = 'ended';
    this.broadcastAll({
      type: 'call_ended',
      callId: this.callId,
      endedAt: Date.now(),
    });

    // Close all connections
    for (const [, participant] of this.participants) {
      try {
        participant.socket.close(1000, 'Call ended');
      } catch (e) {
        // Ignore
      }
    }

    this.participants.clear();
  }

  private broadcastAll(event: Record<string, unknown>): void {
    const message = JSON.stringify(event);
    for (const [uid, participant] of this.participants) {
      try {
        participant.socket.send(message);
      } catch (e) {
        this.participants.delete(uid);
      }
    }
  }

  private sendToUser(userId: string, event: Record<string, unknown>): void {
    const participant = this.participants.get(userId);
    if (participant) {
      try {
        participant.socket.send(JSON.stringify(event));
      } catch (e) {
        this.participants.delete(userId);
      }
    }
  }

  private getParticipantList(): Array<{ userId: string; isMuted: boolean; isVideoOn: boolean; isScreenSharing: boolean }> {
    return Array.from(this.participants.values()).map(p => ({
      userId: p.userId,
      isMuted: p.isMuted,
      isVideoOn: p.isVideoOn,
      isScreenSharing: p.isScreenSharing,
    }));
  }
}
