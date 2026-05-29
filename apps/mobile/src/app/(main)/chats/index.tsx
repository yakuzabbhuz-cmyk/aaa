// ============================================
// DL Chat Mobile - Chat List Screen
// ============================================
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, RefreshControl, ActivityIndicator, StatusBar,
  Alert, Animated,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Swipeable } from 'react-native-gesture-handler';
import api from '../../../api/client';
import { useChatsStore } from '../../../store/chats';
import { useAuthStore } from '../../../store/auth';
import { COLORS, SIZES, AVATAR_COLORS } from '../../../constants/theme';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

function AvatarPlaceholder({ name, size = 48 }: { name: string; size?: number }) {
  const index = name.charCodeAt(0) % AVATAR_COLORS.length;
  const color = AVATAR_COLORS[index];
  return (
    <View style={[styles.avatarPlaceholder, { width: size, height: size, backgroundColor: color }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{name[0]?.toUpperCase()}</Text>
    </View>
  );
}

function ChatItem({ chat, onPress, onDelete, onMute }: {
  chat: any;
  onPress: () => void;
  onDelete: () => void;
  onMute: () => void;
}) {
  const { user } = useAuthStore();
  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>) => {
    return (
      <View style={styles.swipeActions}>
        <TouchableOpacity style={[styles.swipeAction, { backgroundColor: '#F5A623' }]} onPress={onMute}>
          <Text style={styles.swipeActionIcon}>🔇</Text>
          <Text style={styles.swipeActionText}>Mute</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.swipeAction, { backgroundColor: '#FF4B4B' }]} onPress={onDelete}>
          <Text style={styles.swipeActionIcon}>🗑️</Text>
          <Text style={styles.swipeActionText}>Delete</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const lastMsg = chat.last_message;
  const lastMsgTime = lastMsg ? dayjs(lastMsg.created_at).fromNow() : '';

  let messagePreview = 'No messages yet';
  if (lastMsg && !lastMsg.is_deleted) {
    if (lastMsg.type === 'text') messagePreview = lastMsg.content?.slice(0, 60) || '';
    else if (lastMsg.type === 'image') messagePreview = '📷 Photo';
    else if (lastMsg.type === 'video') messagePreview = '🎥 Video';
    else if (lastMsg.type === 'voice') messagePreview = '🎙️ Voice message';
    else if (lastMsg.type === 'audio') messagePreview = '🎵 Audio';
    else if (lastMsg.type === 'document') messagePreview = '📄 Document';
    else if (lastMsg.type === 'sticker') messagePreview = '😊 Sticker';
    else if (lastMsg.type === 'poll') messagePreview = '📊 Poll';
    else if (lastMsg.type === 'location') messagePreview = '📍 Location';
    else if (lastMsg.type === 'call') messagePreview = '📞 Call';
    else messagePreview = `[${lastMsg.type}]`;
  } else if (lastMsg?.is_deleted) {
    messagePreview = '🚫 Message deleted';
  }

  const chatName = chat.name || chat.display_name || 'Unknown';

  return (
    <Swipeable renderRightActions={renderRightActions} rightThreshold={40}>
      <TouchableOpacity style={styles.chatItem} onPress={onPress} activeOpacity={0.7}>
        {chat.avatar_url ? (
          <Image source={{ uri: chat.avatar_url }} style={styles.avatar} />
        ) : (
          <AvatarPlaceholder name={chatName} />
        )}

        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatName} numberOfLines={1}>{chatName}</Text>
            <Text style={styles.chatTime}>{lastMsgTime}</Text>
          </View>
          <View style={styles.chatMeta}>
            <Text style={styles.lastMessage} numberOfLines={1}>{messagePreview}</Text>
            {chat.unread_count > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{chat.unread_count > 99 ? '99+' : chat.unread_count}</Text>
              </View>
            )}
            {chat.is_muted && <Text style={styles.mutedIcon}>🔇</Text>}
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

export default function ChatsScreen() {
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const { chats, setChats } = useChatsStore();
  const { user } = useAuthStore();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['chats'],
    queryFn: () => api.getChats(),
    staleTime: 30000,
  });

  useEffect(() => {
    if (data?.chats) {
      setChats(data.chats);
    }
  }, [data]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const filteredChats = chats.filter(chat => {
    if (!search) return true;
    const name = chat.name || '';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const handleDeleteChat = (chatId: string) => {
    Alert.alert('Delete Chat', 'Are you sure you want to delete this chat?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.request(`/api/v1/chats/${chatId}`, { method: 'DELETE' } as any);
            setChats(chats.filter(c => c.id !== chatId));
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        }
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/(main)/chats/new-group')}>
            <Text style={styles.headerBtnText}>👥</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/(main)/chats/new-chat')}>
            <Text style={styles.headerBtnText}>✏️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search chats..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Chat List */}
      {isLoading && chats.length === 0 ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredChats}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChatItem
              chat={item}
              onPress={() => router.push({ pathname: '/(main)/chats/[id]', params: { id: item.id } })}
              onDelete={() => handleDeleteChat(item.id)}
              onMute={() => {}}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyTitle}>No chats yet</Text>
              <Text style={styles.emptySubtitle}>Start a conversation with someone!</Text>
              <TouchableOpacity style={styles.emptyButton} onPress={() => router.push('/(main)/chats/new-chat')}>
                <Text style={styles.emptyButtonText}>New Chat</Text>
              </TouchableOpacity>
            </View>
          }
          contentContainerStyle={filteredChats.length === 0 ? styles.emptyContainer : undefined}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => router.push('/(main)/chats/new-chat')}>
        <Text style={styles.fabIcon}>✏️</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  headerBtnText: { fontSize: 18 },
  searchContainer: { paddingHorizontal: 16, paddingBottom: 8 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, color: '#fff', fontSize: 15 },
  searchClear: { color: COLORS.textMuted, fontSize: 16, padding: 4 },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarPlaceholder: { borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  chatInfo: { flex: 1, marginLeft: 12 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  chatName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#fff', marginRight: 8 },
  chatTime: { fontSize: 12, color: COLORS.textMuted },
  chatMeta: { flexDirection: 'row', alignItems: 'center' },
  lastMessage: { flex: 1, fontSize: 14, color: COLORS.textSecondary },
  unreadBadge: { backgroundColor: COLORS.primary, borderRadius: 12, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 8 },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  mutedIcon: { fontSize: 12, marginLeft: 4 },
  swipeActions: { flexDirection: 'row' },
  swipeAction: { width: 70, alignItems: 'center', justifyContent: 'center', gap: 4 },
  swipeActionIcon: { fontSize: 20 },
  swipeActionText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flex: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 72, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 8 },
  emptySubtitle: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 24 },
  emptyButton: { backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  fab: { position: 'absolute', bottom: 80, right: 16, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#6C63FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
  fabIcon: { fontSize: 22 },
});
