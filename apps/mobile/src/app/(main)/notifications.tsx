/**
 * DL Chat — Notifications Screen
 * DEATH LEGION Team — Proprietary & Confidential
 * © 2025 DL Chat. All rights reserved.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Image, Animated,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

type NotificationType = 'message' | 'call_missed' | 'mention' | 'reaction' | 'group_invite' | 'friend_request' | 'system' | 'update';

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  avatar?: string;
  actionUrl?: string;
  meta?: Record<string, string>;
}

const TYPE_ICONS: Record<NotificationType, string> = {
  message: '💬',
  call_missed: '📞',
  mention: '@',
  reaction: '❤️',
  group_invite: '👥',
  friend_request: '🤝',
  system: '🔔',
  update: '⬆️',
};

const TYPE_COLORS: Record<NotificationType, string> = {
  message: '#7c3aed',
  call_missed: '#ef4444',
  mention: '#06b6d4',
  reaction: '#f59e0b',
  group_invite: '#10b981',
  friend_request: '#8b5cf6',
  system: '#64748b',
  update: '#0ea5e9',
};

// Placeholder data
const MOCK_NOTIFICATIONS: NotificationItem[] = [
  { id: '1', type: 'message', title: 'Hiroshi Tanaka', body: 'Hey! Are you free for a call tonight?', timestamp: Date.now() - 120000, read: false, actionUrl: '/chats/1' },
  { id: '2', type: 'mention', title: 'Death Legion HQ', body: 'Yamato mentioned you: "@you Check the update!"', timestamp: Date.now() - 600000, read: false, actionUrl: '/chats/2' },
  { id: '3', type: 'call_missed', title: 'Missed Voice Call', body: 'Amara Okafor tried to call you 2 times', timestamp: Date.now() - 1800000, read: true, actionUrl: '/calls' },
  { id: '4', type: 'reaction', title: 'New Reaction', body: 'Fatima reacted ❤️ to your message in "Project Alpha"', timestamp: Date.now() - 3600000, read: true },
  { id: '5', type: 'group_invite', title: 'Group Invitation', body: 'Chen Wei invited you to join "DL Dev Team"', timestamp: Date.now() - 7200000, read: true, actionUrl: '/chats/join/abc123' },
  { id: '6', type: 'system', title: 'Security Alert', body: 'New login from Linux device detected. Was this you?', timestamp: Date.now() - 86400000, read: true },
  { id: '7', type: 'update', title: 'DL Chat Update', body: 'Version 1.0.1 available — Bug fixes and performance improvements.', timestamp: Date.now() - 172800000, read: true },
  { id: '8', type: 'friend_request', title: 'Contact Request', body: 'Nadia Petrov wants to add you as a contact', timestamp: Date.now() - 259200000, read: true },
];

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
  const [refreshing, setRefreshing] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  const filtered = filter === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications;

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const deleteNotif = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const handleNotifPress = (notif: NotificationItem) => {
    markRead(notif.id);
    if (notif.actionUrl) router.push(notif.actionUrl as any);
  };

  const renderItem = ({ item }: { item: NotificationItem }) => (
    <TouchableOpacity
      style={[s.notifItem, !item.read && s.notifUnread]}
      onPress={() => handleNotifPress(item)}
      onLongPress={() =>
        deleteNotif(item.id)
      }
      activeOpacity={0.7}
    >
      <View style={[s.notifIcon, { backgroundColor: TYPE_COLORS[item.type] + '20', borderColor: TYPE_COLORS[item.type] + '40' }]}>
        <Text style={s.notifIconText}>{TYPE_ICONS[item.type]}</Text>
      </View>
      <View style={s.notifContent}>
        <View style={s.notifTop}>
          <Text style={[s.notifTitle, !item.read && s.notifTitleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={s.notifTime}>{formatRelativeTime(item.timestamp)}</Text>
        </View>
        <Text style={s.notifBody} numberOfLines={2}>{item.body}</Text>
      </View>
      {!item.read && <View style={[s.unreadDot, { backgroundColor: TYPE_COLORS[item.type] }]} />}
    </TouchableOpacity>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.container}>
        {/* Header */}
        <LinearGradient colors={['#0d0d2b', '#05050f']} style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backText}>←</Text>
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>Notifications</Text>
            {unreadCount > 0 && (
              <View style={s.headerBadge}>
                <Text style={s.headerBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity onPress={markAllRead} style={s.markAllBtn}>
            <Text style={s.markAllText}>Mark all</Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* Filter Tabs */}
        <View style={s.filterRow}>
          <TouchableOpacity style={[s.filterBtn, filter === 'all' && s.filterActive]} onPress={() => setFilter('all')}>
            <Text style={[s.filterText, filter === 'all' && s.filterTextActive]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.filterBtn, filter === 'unread' && s.filterActive]} onPress={() => setFilter('unread')}>
            <Text style={[s.filterText, filter === 'unread' && s.filterTextActive]}>
              Unread {unreadCount > 0 ? `(${unreadCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🔔</Text>
            <Text style={s.emptyTitle}>{filter === 'unread' ? 'All caught up!' : 'No notifications'}</Text>
            <Text style={s.emptyBody}>You'll see your notifications here</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={i => i.id}
            renderItem={renderItem}
            contentContainerStyle={s.list}
            ItemSeparatorComponent={() => <View style={s.separator} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7c3aed" />}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05050f' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#fff', fontSize: 20 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerBadge: { backgroundColor: '#7c3aed', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 },
  headerBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  markAllBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  markAllText: { color: '#a78bfa', fontSize: 13, fontWeight: '600' },
  filterRow: { flexDirection: 'row', padding: 12, gap: 8 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  filterActive: { backgroundColor: 'rgba(124,58,237,0.2)', borderColor: 'rgba(124,58,237,0.5)' },
  filterText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  filterTextActive: { color: '#a78bfa' },
  list: { paddingVertical: 8 },
  notifItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14, position: 'relative' },
  notifUnread: { backgroundColor: 'rgba(124,58,237,0.05)' },
  notifIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },
  notifIconText: { fontSize: 20 },
  notifContent: { flex: 1 },
  notifTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  notifTitle: { color: '#94a3b8', fontSize: 14, fontWeight: '600', flex: 1 },
  notifTitleUnread: { color: '#f8fafc' },
  notifTime: { color: '#475569', fontSize: 11, flexShrink: 0 },
  notifBody: { color: '#64748b', fontSize: 13, lineHeight: 18 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 18, flexShrink: 0 },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.04)', marginHorizontal: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { color: '#f8fafc', fontSize: 20, fontWeight: '700' },
  emptyBody: { color: '#64748b', fontSize: 14, textAlign: 'center' },
});
