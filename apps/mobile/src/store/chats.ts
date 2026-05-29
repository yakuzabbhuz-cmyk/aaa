// ============================================
// DL Chat Mobile - Chats Store (Zustand)
// ============================================
import { create } from 'zustand';

interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  type: string;
  content?: string;
  media_url?: string;
  created_at: number;
  reactions: Record<string, string[]>;
  reply_to?: Partial<Message>;
  sender_name?: string;
  sender_avatar?: string;
  is_deleted: boolean;
  is_edited: boolean;
}

interface Chat {
  id: string;
  type: string;
  name?: string;
  avatar_url?: string;
  last_message?: Message;
  unread_count: number;
  is_muted: boolean;
  updated_at: number;
}

interface ChatsState {
  chats: Chat[];
  messages: Record<string, Message[]>;
  typingUsers: Record<string, Set<string>>;
  onlineUsers: Set<string>;

  // Actions
  setChats: (chats: Chat[]) => void;
  updateChat: (chat: Partial<Chat> & { id: string }) => void;
  setMessages: (chatId: string, messages: Message[]) => void;
  addMessage: (chatId: string, message: Message) => void;
  updateMessage: (chatId: string, message: Partial<Message> & { id: string }) => void;
  deleteMessage: (chatId: string, messageId: string) => void;
  addReaction: (chatId: string, messageId: string, reactions: Record<string, string[]>) => void;
  setTyping: (chatId: string, userId: string, isTyping: boolean) => void;
  setOnline: (userId: string, isOnline: boolean) => void;
  markChatRead: (chatId: string) => void;
  moveToTop: (chatId: string, lastMessage: Message) => void;
}

export const useChatsStore = create<ChatsState>((set, get) => ({
  chats: [],
  messages: {},
  typingUsers: {},
  onlineUsers: new Set(),

  setChats: (chats) => set({ chats }),

  updateChat: (chat) => {
    set(state => ({
      chats: state.chats.map(c => c.id === chat.id ? { ...c, ...chat } : c),
    }));
  },

  setMessages: (chatId, messages) => {
    set(state => ({
      messages: { ...state.messages, [chatId]: messages },
    }));
  },

  addMessage: (chatId, message) => {
    set(state => ({
      messages: {
        ...state.messages,
        [chatId]: [...(state.messages[chatId] || []), message],
      },
    }));
  },

  updateMessage: (chatId, updates) => {
    set(state => ({
      messages: {
        ...state.messages,
        [chatId]: (state.messages[chatId] || []).map(m =>
          m.id === updates.id ? { ...m, ...updates } : m
        ),
      },
    }));
  },

  deleteMessage: (chatId, messageId) => {
    set(state => ({
      messages: {
        ...state.messages,
        [chatId]: (state.messages[chatId] || []).map(m =>
          m.id === messageId ? { ...m, is_deleted: true } : m
        ),
      },
    }));
  },

  addReaction: (chatId, messageId, reactions) => {
    set(state => ({
      messages: {
        ...state.messages,
        [chatId]: (state.messages[chatId] || []).map(m =>
          m.id === messageId ? { ...m, reactions } : m
        ),
      },
    }));
  },

  setTyping: (chatId, userId, isTyping) => {
    set(state => {
      const chatTyping = new Set(state.typingUsers[chatId] || []);
      if (isTyping) {
        chatTyping.add(userId);
      } else {
        chatTyping.delete(userId);
      }
      return { typingUsers: { ...state.typingUsers, [chatId]: chatTyping } };
    });
  },

  setOnline: (userId, isOnline) => {
    set(state => {
      const onlineUsers = new Set(state.onlineUsers);
      if (isOnline) {
        onlineUsers.add(userId);
      } else {
        onlineUsers.delete(userId);
      }
      return { onlineUsers };
    });
  },

  markChatRead: (chatId) => {
    set(state => ({
      chats: state.chats.map(c => c.id === chatId ? { ...c, unread_count: 0 } : c),
    }));
  },

  moveToTop: (chatId, lastMessage) => {
    set(state => {
      const chat = state.chats.find(c => c.id === chatId);
      if (!chat) return state;

      const updatedChat = { ...chat, last_message: lastMessage, updated_at: Date.now() };
      const otherChats = state.chats.filter(c => c.id !== chatId);

      return { chats: [updatedChat, ...otherChats] };
    });
  },
}));
