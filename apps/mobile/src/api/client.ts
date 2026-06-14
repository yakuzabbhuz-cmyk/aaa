// ============================================
// DL Chat Mobile - API Client
// ============================================
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://dl-chat-api.death-legion-dlchat.workers.dev';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async getToken(): Promise<string | null> {
    return SecureStore.getItemAsync('auth_token');
  }

  private async request<T>(
    path: string,
    options: RequestInit & { params?: Record<string, string> } = {}
  ): Promise<T> {
    const token = await this.getToken();
    const { params, ...fetchOptions } = options;

    let url = `${this.baseUrl}${path}`;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((fetchOptions.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    if (!response.ok) {
      const error = await response.json<{ error?: string; message?: string }>().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(
        error.error || error.message || `HTTP ${response.status}`,
        response.status
      );
    }

    return response.json<T>();
  }

  // Auth
  async register(data: { phone?: string; email?: string; display_name: string }) {
    return this.request<{ success: boolean; debug_code?: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async login(data: { phone?: string; email?: string }) {
    return this.request<{ success: boolean; debug_code?: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async verifyOtp(data: { target: string; code: string; type: string; device_info?: object }) {
    return this.request<{
      user: any;
      token: string;
      refresh_token: string;
      expires_at: number;
      is_new_user: boolean;
    }>('/api/v1/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ── Email + Password Auth ─────────────────────────────────
  async loginWithPassword(data: { email: string; password: string }) {
    return this.request<{
      user: any; token: string; refresh_token: string; expires_at: number; is_new_user: boolean;
    }>('/api/v1/auth/login-password', { method: 'POST', body: JSON.stringify(data) });
  }

  async registerWithPassword(data: { email: string; password: string; display_name: string; username?: string }) {
    return this.request<{
      user: any; token: string; refresh_token: string; expires_at: number; is_new_user: boolean;
    }>('/api/v1/auth/register-password', { method: 'POST', body: JSON.stringify(data) });
  }

  async forgotPassword(email: string) {
    return this.request<{ success: boolean; message: string; debug_code?: string }>(
      '/api/v1/auth/forgot-password',
      { method: 'POST', body: JSON.stringify({ email }) }
    );
  }

  async resetPassword(data: { email: string; code: string; new_password: string }) {
    return this.request<{ success: boolean; message: string }>(
      '/api/v1/auth/reset-password',
      { method: 'POST', body: JSON.stringify(data) }
    );
  }

  async sendOtp(phone: string) {
    return this.request<{ success: boolean; message: string; debug_code?: string }>(
      '/api/v1/auth/register',
      { method: 'POST', body: JSON.stringify({ phone, display_name: 'User' }) }
    );
  }

  async logout() {
    return this.request<{ success: boolean }>('/api/v1/auth/logout', { method: 'POST' });
  }

  async refreshToken(refreshToken: string) {
    return this.request<{ token: string; expires_at: number }>('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  }

  // Users
  async getMe() {
    return this.request<{ user: any }>('/api/v1/users/me');
  }

  async updateMe(data: object) {
    return this.request<{ user: any }>('/api/v1/users/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async searchUsers(query: string, limit = 20) {
    return this.request<{ users: any[] }>('/api/v1/users/search', {
      params: { q: query, limit: String(limit) },
    });
  }

  async getContacts() {
    return this.request<{ contacts: any[] }>('/api/v1/users/contacts');
  }

  async addContact(data: { phone?: string; user_id?: string; nickname?: string }) {
    return this.request<{ contact: any }>('/api/v1/users/contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async blockUser(userId: string) {
    return this.request<{ success: boolean }>(`/api/v1/users/block/${userId}`, { method: 'POST' });
  }

  async uploadPublicKey(publicKey: string) {
    return this.request<{ success: boolean }>('/api/v1/users/keys', {
      method: 'POST',
      body: JSON.stringify({ public_key: publicKey }),
    });
  }

  // Chats
  async getChats(limit = 50, offset = 0) {
    return this.request<{ chats: any[] }>('/api/v1/chats', {
      params: { limit: String(limit), offset: String(offset) },
    });
  }

  async createDirectChat(userId: string) {
    return this.request<{ chat: any; is_new: boolean }>('/api/v1/chats/direct', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  }

  async createGroup(data: { name: string; description?: string; member_ids?: string[] }) {
    return this.request<{ chat: any }>('/api/v1/chats/group', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getChat(chatId: string) {
    return this.request<{ chat: any }>(`/api/v1/chats/${chatId}`);
  }

  async getChatMembers(chatId: string) {
    return this.request<{ members: any[] }>(`/api/v1/chats/${chatId}/members`);
  }

  async generateInviteLink(chatId: string) {
    return this.request<{ invite_link: string; invite_url: string }>(`/api/v1/chats/${chatId}/invite`, {
      method: 'POST',
    });
  }

  async joinViaInvite(inviteCode: string) {
    return this.request<{ chat: any; already_member: boolean }>(`/api/v1/chats/join/${inviteCode}`, {
      method: 'POST',
    });
  }

  // Messages
  async getMessages(chatId: string, limit = 50, before?: string) {
    const params: Record<string, string> = { limit: String(limit) };
    if (before) params.before = before;
    return this.request<{ messages: any[]; has_more: boolean }>(`/api/v1/messages/${chatId}`, { params });
  }

  async sendMessage(chatId: string, data: {
    type: string;
    content?: string;
    media_url?: string;
    reply_to_id?: string;
    mention_ids?: string[];
    is_view_once?: boolean;
    poll?: object;
    location?: object;
  }) {
    return this.request<{ message: any }>(`/api/v1/messages/${chatId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async editMessage(chatId: string, msgId: string, content: string) {
    return this.request<{ message: any }>(`/api/v1/messages/${chatId}/${msgId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  async deleteMessage(chatId: string, msgId: string, forEveryone = false) {
    return this.request<{ success: boolean }>(
      `/api/v1/messages/${chatId}/${msgId}?for_everyone=${forEveryone}`,
      { method: 'DELETE' }
    );
  }

  async reactToMessage(chatId: string, msgId: string, emoji: string) {
    return this.request<{ reactions: object }>(`/api/v1/messages/${chatId}/${msgId}/react`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  }

  async markAsRead(chatId: string, msgId: string) {
    return this.request<{ success: boolean }>(`/api/v1/messages/${chatId}/${msgId}/read`, {
      method: 'POST',
    });
  }

  async forwardMessage(chatId: string, msgId: string, targetChatIds: string[]) {
    return this.request<{ success: boolean }>(`/api/v1/messages/${chatId}/${msgId}/forward`, {
      method: 'POST',
      body: JSON.stringify({ target_chat_ids: targetChatIds }),
    });
  }

  async starMessage(chatId: string, msgId: string) {
    return this.request<{ starred: boolean }>(`/api/v1/messages/${chatId}/${msgId}/star`, {
      method: 'POST',
    });
  }

  async getStarredMessages() {
    return this.request<{ starred_messages: any[] }>('/api/v1/messages/starred');
  }

  // Status
  async getStatuses() {
    return this.request<{ status_updates: any[] }>('/api/v1/status');
  }

  async createStatus(data: {
    type: string;
    content?: string;
    media_url?: string;
    background_color?: string;
    caption?: string;
    privacy?: string;
  }) {
    return this.request<{ status: any }>('/api/v1/status', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteStatus(statusId: string) {
    return this.request<{ success: boolean }>(`/api/v1/status/${statusId}`, { method: 'DELETE' });
  }

  async reactToStatus(statusId: string, emoji: string) {
    return this.request<{ success: boolean; reactions: object }>(`/api/v1/status/${statusId}/react`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  }

  // Calls
  async initiateCall(data: { chat_id?: string; type: string; participant_ids?: string[] }) {
    return this.request<{ call: any }>('/api/v1/calls/initiate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async answerCall(callId: string) {
    return this.request<{ success: boolean }>(`/api/v1/calls/${callId}/answer`, { method: 'POST' });
  }

  async rejectCall(callId: string) {
    return this.request<{ success: boolean }>(`/api/v1/calls/${callId}/reject`, { method: 'POST' });
  }

  async endCall(callId: string) {
    return this.request<{ success: boolean; duration_seconds: number }>(`/api/v1/calls/${callId}/end`, {
      method: 'POST',
    });
  }

  // Upload
  async uploadFile(formData: FormData) {
    const token = await this.getToken();
    const response = await fetch(`${this.baseUrl}/api/v1/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json<{ error?: string }>();
      throw new ApiError(error.error || 'Upload failed', response.status);
    }

    return response.json<{ key: string; url: string; size: number; mime_type: string }>();
  }

  // Servers
  async getServers() {
    return this.request<{ servers: any[] }>('/api/v1/servers');
  }

  async createServer(data: { name: string; description?: string; is_public?: boolean }) {
    return this.request<{ server: any; channels: any[] }>('/api/v1/servers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async joinServer(inviteCode: string) {
    return this.request<{ success: boolean; server: any }>(`/api/v1/servers/join/${inviteCode}`, {
      method: 'POST',
    });
  }

  // Privacy
  async updatePrivacy(data: object) {
    return this.request<{ success: boolean }>('/api/v1/users/privacy', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const api = new ApiClient(API_URL);
export const apiClient = api; // alias for legacy imports
export default api;
