// ============================================
// DL Chat Mobile - Calls Screen
// Call history + active call management
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

type CallType = 'audio' | 'video' | 'group_audio' | 'group_video';
type CallStatus = 'missed' | 'outgoing' | 'incoming' | 'declined' | 'no_answer';

interface CallRecord {
  id: string;
  chat_id: string;
  other_user_id?: string;
  other_user_name?: string;
  other_user_avatar?: string;
  type: CallType;
  status: CallStatus;
  duration_seconds?: number;
  created_at: string;
  is_outgoing: boolean;
  group_name?: string;
  participant_count?: number;
}

export default function CallsScreen() {
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'missed'>('all');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['calls', filter],
    queryFn: () => apiClient.getCallHistory({ filter }),
  });

  const calls: CallRecord[] = data?.data?.calls || [];
  const filteredCalls = filter === 'missed'
    ? calls.filter((c) => c.status === 'missed')
    : calls;

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  async function handleCallBack(call: CallRecord) {
    if (!call.other_user_id && !call.chat_id) return;
    try {
      const { data } = await apiClient.initiateCall({
        chat_id: call.chat_id,
        call_type: call.type.includes('video') ? 'video' : 'audio',
      });
      router.push({
        pathname: '/calls/active',
        params: { callId: data.call.id, type: call.type },
      } as any);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not start call.');
    }
  }

  function getCallIcon(call: CallRecord) {
    const isVideo = call.type.includes('video');
    const isGroup = call.type.includes('group');
    if (call.status === 'missed') return isVideo ? '📹❌' : '📞❌';
    if (call.is_outgoing) return isVideo ? '📹↑' : '📞↑';
    return isVideo ? '📹↓' : '📞↓';
  }

  function formatDuration(seconds?: number): string {
    if (!seconds || seconds === 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatTime(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 7 * 86400000) {
      return d.toLocaleDateString([], { weekday: 'short' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function renderCallItem({ item }: { item: CallRecord }) {
    const avatarColor =
      AVATAR_COLORS[
        ((item.other_user_name || item.group_name || '?').charCodeAt(0) || 65) %
          AVATAR_COLORS.length
      ];
    const name = item.other_user_name || item.group_name || 'Unknown';
    const isMissed = item.status === 'missed';

    return (
      <TouchableOpacity
        style={styles.callItem}
        onPress={() => handleCallBack(item)}
        onLongPress={() => {
          Alert.alert(name, '', [
            { text: 'Call Back', onPress: () => handleCallBack(item) },
            {
              text: 'View Chat',
              onPress: () => router.push(`/(main)/chats/${item.chat_id}` as any),
            },
            { text: 'Cancel', style: 'cancel' },
          ]);
        }}
      >
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          {item.other_user_avatar ? (
            <Image source={{ uri: item.other_user_avatar }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarText}>{name[0].toUpperCase()}</Text>
          )}
        </View>

        {/* Info */}
        <View style={styles.callInfo}>
          <Text style={[styles.callName, isMissed && styles.callNameMissed]}>
            {name}
          </Text>
          <View style={styles.callMeta}>
            <Text style={[styles.callStatus, isMissed && styles.callStatusMissed]}>
              {item.is_outgoing ? '↑ ' : '↓ '}
              {isMissed
                ? 'Missed'
                : item.status === 'declined'
                ? 'Declined'
                : item.type.includes('video')
                ? 'Video call'
                : 'Voice call'}
              {item.duration_seconds ? ` · ${formatDuration(item.duration_seconds)}` : ''}
            </Text>
          </View>
        </View>

        {/* Right side: time + call icon */}
        <View style={styles.callRight}>
          <Text style={styles.callTime}>{formatTime(item.created_at)}</Text>
          <TouchableOpacity
            style={styles.callBackBtn}
            onPress={() => handleCallBack(item)}
          >
            <Text style={styles.callBackIcon}>
              {item.type.includes('video') ? '📹' : '📞'}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calls</Text>
        <TouchableOpacity
          style={styles.newCallBtn}
          onPress={() => router.push('/calls/new' as any)}
        >
          <Text style={styles.newCallBtnIcon}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterTabs}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'missed' && styles.filterTabActive]}
          onPress={() => setFilter('missed')}
        >
          <Text
            style={[styles.filterTabText, filter === 'missed' && styles.filterTabTextActive]}
          >
            Missed
          </Text>
        </TouchableOpacity>
      </View>

      {/* Call list */}
      <FlatList
        data={filteredCalls}
        keyExtractor={(item) => item.id}
        renderItem={renderCallItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />
        }
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={styles.skeletonItem}>
                    <View style={styles.skeletonAvatar} />
                    <View style={styles.skeletonContent}>
                      <View style={styles.skeletonLine} />
                      <View style={[styles.skeletonLine, { width: '50%' }]} />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <>
                <Text style={styles.emptyIcon}>
                  {filter === 'missed' ? '📵' : '📞'}
                </Text>
                <Text style={styles.emptyTitle}>
                  {filter === 'missed' ? 'No missed calls' : 'No call history'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {filter === 'missed'
                    ? "You haven't missed any calls."
                    : 'Your call history will appear here.'}
                </Text>
                <TouchableOpacity
                  style={styles.startCallBtn}
                  onPress={() => router.push('/calls/new' as any)}
                >
                  <Text style={styles.startCallBtnText}>Start a Call</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
        contentContainerStyle={filteredCalls.length === 0 ? styles.emptyList : styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
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
  newCallBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6c63ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newCallBtnIcon: { color: '#fff', fontSize: 24, fontWeight: '300', lineHeight: 32, marginTop: -2 },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  filterTab: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
  },
  filterTabActive: { backgroundColor: '#6c63ff' },
  filterTabText: { color: '#a0a0a0', fontSize: 13, fontWeight: '600' },
  filterTabTextActive: { color: '#fff' },
  listContent: { paddingBottom: 80 },
  emptyList: { flex: 1 },
  // Call item
  callItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#141414',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: 50, height: 50, borderRadius: 25 },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  callInfo: { flex: 1 },
  callName: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 3 },
  callNameMissed: { color: '#e53e3e' },
  callMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  callStatus: { color: '#a0a0a0', fontSize: 12 },
  callStatusMissed: { color: '#e53e3e' },
  callRight: { alignItems: 'flex-end', gap: 8 },
  callTime: { color: '#a0a0a0', fontSize: 11 },
  callBackBtn: { padding: 4 },
  callBackIcon: { fontSize: 20 },
  // Empty
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptySubtitle: { color: '#a0a0a0', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  startCallBtn: {
    marginTop: 8,
    backgroundColor: '#6c63ff',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 22,
  },
  startCallBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  // Skeleton
  loadingContainer: { width: '100%' },
  skeletonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
  },
  skeletonAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1e1e1e',
  },
  skeletonContent: { flex: 1, gap: 6 },
  skeletonLine: { height: 12, backgroundColor: '#1e1e1e', borderRadius: 6, width: '70%' },
});
