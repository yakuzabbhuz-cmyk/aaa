// ============================================
// DL Chat Mobile - WebSocket Hook
// ============================================
import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/auth';
import { useChatsStore } from '../store/chats';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://dl-chat-api.death-legion-dlchat.workers.dev/ws';
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;
const PING_INTERVAL = 30000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isConnectedRef = useRef(false);

  const { user, token } = useAuthStore();
  const { addMessage, updateMessage, deleteMessage, addReaction, setTyping, moveToTop, setChats } = useChatsStore();

  const connect = useCallback(() => {
    if (!user?.id || !token) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = `${WS_URL}?token=${token}&userId=${user.id}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        isConnectedRef.current = true;
        reconnectAttemptsRef.current = 0;

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleEvent(data);
        } catch (e) {
          console.error('[WebSocket] Parse error:', e);
        }
      };

      ws.onclose = (event) => {
        console.log('[WebSocket] Closed:', event.code, event.reason);
        isConnectedRef.current = false;

        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Auto-reconnect
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = RECONNECT_DELAY * Math.pow(1.5, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current++;
          setTimeout(connect, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };
    } catch (e) {
      console.error('[WebSocket] Connection failed:', e);
    }
  }, [user?.id, token]);

  const handleEvent = useCallback((data: Record<string, unknown>) => {
    switch (data.type) {
      case 'new_message': {
        const msg = data.message as any;
        if (!msg) return;
        addMessage(msg.chat_id, msg);
        moveToTop(msg.chat_id, msg);
        break;
      }

      case 'message_edited': {
        const msg = data.message as any;
        if (!msg) return;
        updateMessage(msg.chat_id, { id: msg.id, content: msg.content, is_edited: true, edited_at: msg.edited_at });
        break;
      }

      case 'message_deleted': {
        const { chatId, messageId } = data as any;
        deleteMessage(chatId, messageId);
        break;
      }

      case 'reaction': {
        const { chatId, messageId, reactions } = data as any;
        addReaction(chatId, messageId, reactions);
        break;
      }

      case 'typing': {
        const { chatId, userId, isTyping } = data as any;
        setTyping(chatId, userId, isTyping);
        break;
      }

      case 'presence': {
        // Handle presence updates
        break;
      }

      case 'call_incoming': {
        const { call } = data as any;
        // TODO: Show incoming call UI
        console.log('[WebSocket] Incoming call:', call);
        break;
      }

      case 'pong':
        // Heartbeat response
        break;

      default:
        console.log('[WebSocket] Unknown event:', data.type);
    }
  }, [addMessage, updateMessage, deleteMessage, addReaction, setTyping, moveToTop]);

  const sendTyping = useCallback((chatId: string, isTyping: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'typing', chatId, isTyping }));
    }
  }, []);

  const markRead = useCallback((chatId: string, messageId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'message_read', chatId, messageId }));
    }
  }, []);

  const subscribeTo = useCallback((chatId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', chatId }));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return { sendTyping, markRead, subscribeTo, isConnected: isConnectedRef.current };
}
