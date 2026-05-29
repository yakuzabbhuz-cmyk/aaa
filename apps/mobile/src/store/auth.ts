// ============================================
// DL Chat Mobile - Auth Store (Zustand)
// ============================================
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import api from '../api/client';

interface User {
  id: string;
  username?: string;
  phone?: string;
  email?: string;
  display_name: string;
  avatar_url?: string;
  status?: string;
  is_verified: boolean;
  is_premium: boolean;
  public_key?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  initialize: () => Promise<void>;
  login: (user: User, token: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  refreshSession: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,

  initialize: async () => {
    set({ isLoading: true });
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      const userJson = await SecureStore.getItemAsync('user_data');

      if (token && userJson) {
        const user = JSON.parse(userJson) as User;
        set({ user, token, refreshToken, isAuthenticated: true });

        // Refresh user data from server
        try {
          const { user: freshUser } = await api.getMe();
          set({ user: freshUser as User });
          await SecureStore.setItemAsync('user_data', JSON.stringify(freshUser));
        } catch (e) {
          // Token might be expired, try refresh
          if (refreshToken) {
            const refreshed = await get().refreshSession();
            if (!refreshed) {
              await get().logout();
            }
          } else {
            await get().logout();
          }
        }
      }
    } catch (e) {
      console.error('[Auth] Initialize error:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  login: async (user, token, refreshToken) => {
    await SecureStore.setItemAsync('auth_token', token);
    await SecureStore.setItemAsync('refresh_token', refreshToken);
    await SecureStore.setItemAsync('user_data', JSON.stringify(user));
    set({ user, token, refreshToken, isAuthenticated: true });
  },

  logout: async () => {
    try {
      await api.logout();
    } catch (e) {
      // Ignore logout errors
    }
    await SecureStore.deleteItemAsync('auth_token');
    await SecureStore.deleteItemAsync('refresh_token');
    await SecureStore.deleteItemAsync('user_data');
    set({ user: null, token: null, refreshToken: null, isAuthenticated: false });
  },

  updateUser: (updates) => {
    const currentUser = get().user;
    if (!currentUser) return;
    const updatedUser = { ...currentUser, ...updates };
    set({ user: updatedUser });
    SecureStore.setItemAsync('user_data', JSON.stringify(updatedUser));
  },

  refreshSession: async () => {
    const { refreshToken } = get();
    if (!refreshToken) return false;

    try {
      const { token: newToken } = await api.refreshToken(refreshToken);
      await SecureStore.setItemAsync('auth_token', newToken);
      set({ token: newToken });
      return true;
    } catch (e) {
      return false;
    }
  },
}));
