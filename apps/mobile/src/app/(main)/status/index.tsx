// ============================================
// DL Chat Mobile - Status / Stories Screen
// WhatsApp-like status updates (24h stories)
// ============================================
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  RefreshControl,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import { useAuthStore } from '../../../store/auth';
import { AVATAR_COLORS } from '../../../constants/theme';

interface StatusGroup {
  user_id: string;
  user_name: string;
  avatar_url?: string;
  statuses: {
    id: string;
    type: 'text' | 'image' | 'video';
    content?: string;
    media_url?: string;
    background_color?: string;
    created_at: string;
    viewer_count: number;
    is_viewed?: boolean;
  }[];
  all_viewed: boolean;
  latest_at: string;
}

export default function StatusScreen() {
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['statuses'],
    queryFn: () => apiClient.getStatuses(),
    refetchInterval: 60000, // refresh every minute
  });

  const statuses: StatusGroup[] = data?.data?.statuses || [];
  const myStatus = statuses.find((s) => s.user_id === user?.id);
  const contactStatuses = statuses.filter((s) => s.user_id !== user?.id);

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  function openStatus(userId: string, statusId?: string) {
    router.push({
      pathname: '/(main)/status/[id]',
      params: { id: userId, startId: statusId },
    });
  }

  function renderMyStatus() {
    return (
      <TouchableOpacity
        style={styles.myStatusContainer}
        onPress={() => {
          if (myStatus) {
            openStatus(user?.id || '');
          } else {
            router.push('/(main)/status/create' as any);
          }
        }}
      >
        {/* Avatar with + or ring */}
        <View style={styles.myAvatarWrapper}>
          <View style={[styles.myAvatar, { backgroundColor: AVATAR_COLORS[0] }]}>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>
                {(user?.name?.[0] || '?').toUpperCase()}
              </Text>
            )}
          </View>
          <View style={styles.addStatusBtn}>
            <Text style={styles.addStatusIcon}>+</Text>
          </View>
        </View>

        {/* Info */}
        <View style={styles.statusInfo}>
          <Text style={styles.statusName}>My Status</Text>
          <Text style={styles.statusMeta}>
            {myStatus
              ? `${myStatus.statuses.length} update${myStatus.statuses.length > 1 ? 's' : ''}`
              : 'Tap to add status update'}
          </Text>
        </View>

        {/* Options */}
        <TouchableOpacity
          style={styles.optionsBtn}
          onPress={() =>
            Alert.alert('Status Options', '', [
              { text: 'Add Text Status', onPress: () => router.push('/(main)/status/create?type=text' as any) },
              { text: 'Add Photo', onPress: () => router.push('/(main)/status/create?type=image' as any) },
              { text: 'Cancel', style: 'cancel' },
            ])
          }
        >
          <Text style={styles.optionsBtnIcon}>⋮</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  function renderStatusItem({ item }: { item: StatusGroup }) {
    const avatarColor =
      AVATAR_COLORS[(item.user_name.charCodeAt(0) || 65) % AVATAR_COLORS.length];
    const latest = item.statuses[item.statuses.length - 1];

    return (
      <TouchableOpacity
        style={styles.statusItem}
        onPress={() => openStatus(item.user_id)}
      >
        {/* Ring indicator */}
        <View
          style={[
            styles.statusRing,
            item.all_viewed ? styles.statusRingViewed : styles.statusRingUnread,
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{item.user_name[0].toUpperCase()}</Text>
            )}
          </View>
        </View>

        {/* Info */}
        <View style={styles.statusInfo}>
          <Text style={styles.statusName}>{item.user_name}</Text>
          <Text style={styles.statusMeta}>
            {formatRelativeTime(item.latest_at)} ·{' '}
            {item.statuses.length} update{item.statuses.length > 1 ? 's' : ''}
          </Text>
        </View>

        {/* Thumbnail preview */}
        {latest?.media_url ? (
          <View style={styles.thumbnailContainer}>
            <Image
              source={{ uri: latest.media_url }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          </View>
        ) : latest?.type === 'text' ? (
          <View
            style={[
              styles.thumbnailContainer,
              { backgroundColor: latest.background_color || '#6c63ff' },
            ]}
          >
            <Text style={styles.thumbnailText} numberOfLines={2}>
              {latest.content}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Status</Text>
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={() => router.push('/(main)/status/create' as any)}
        >
          <Text style={styles.searchBtnIcon}>✏️</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.skeletonItem}>
              <View style={styles.skeletonAvatar} />
              <View style={styles.skeletonText}>
                <View style={styles.skeletonLine} />
                <View style={[styles.skeletonLine, { width: '60%' }]} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={contactStatuses}
          keyExtractor={(item) => item.user_id}
          renderItem={renderStatusItem}
          ListHeaderComponent={() => (
            <View>
              {/* My Status */}
              <Text style={styles.sectionTitle}>Mine</Text>
              {renderMyStatus()}

              {/* Recent updates section */}
              {contactStatuses.length > 0 && (
                <Text style={styles.sectionTitle}>Recent Updates</Text>
              )}
            </View>
          )}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🌟</Text>
              <Text style={styles.emptyTitle}>No status updates</Text>
              <Text style={styles.emptySubtitle}>
                None of your contacts have posted a status update recently.
              </Text>
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#6c63ff"
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1e1e1e',
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700', flex: 1 },
  searchBtn: { padding: 6 },
  searchBtnIcon: { fontSize: 22 },
  sectionTitle: {
    color: '#a0a0a0',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  listContent: { paddingBottom: 80 },
  // My Status
  myStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
    backgroundColor: '#0d0d0d',
  },
  myAvatarWrapper: { position: 'relative' },
  myAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addStatusBtn: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#6c63ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0d0d0d',
  },
  addStatusIcon: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 18 },
  // Status ring
  statusRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
  },
  statusRingUnread: { borderColor: '#6c63ff' },
  statusRingViewed: { borderColor: '#3a3a3a' },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%', borderRadius: 100 },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  // Status item
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 14,
  },
  statusInfo: { flex: 1 },
  statusName: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 2 },
  statusMeta: { color: '#a0a0a0', fontSize: 12 },
  thumbnailContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnail: { width: 48, height: 48 },
  thumbnailText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    padding: 4,
  },
  optionsBtn: { padding: 10 },
  optionsBtnIcon: { color: '#a0a0a0', fontSize: 20 },
  // Loading
  loadingContainer: { paddingTop: 20, gap: 4 },
  skeletonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
  },
  skeletonAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#1e1e1e',
  },
  skeletonText: { flex: 1, gap: 6 },
  skeletonLine: {
    height: 12,
    backgroundColor: '#1e1e1e',
    borderRadius: 6,
    width: '80%',
  },
  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptySubtitle: { color: '#a0a0a0', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
