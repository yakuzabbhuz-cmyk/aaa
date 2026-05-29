/**
 * DL Chat — User Profile Screen
 * DEATH LEGION Team — Proprietary & Confidential
 * © 2025 DL Chat. All rights reserved.
 */
import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Animated, Dimensions, Share, Alert, StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import api from '../../api/client';

const { width: W, height: H } = Dimensions.get('window');
const HEADER_MAX = 280;
const HEADER_MIN = 88;

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [tab, setTab] = useState<'media' | 'files' | 'links'>('media');
  const [isBlocked, setIsBlocked] = useState(false);

  // Fetch user profile
  const { data, isLoading } = useQuery({
    queryKey: ['profile', id],
    queryFn: async () => {
      const res = await (api as any).getUser(id);
      return res.user;
    },
    enabled: !!id,
  });

  const user = data || {
    id, username: 'user', display_name: 'Loading...', bio: '',
    avatar_url: null, status: '', is_verified: false,
    last_seen: null, is_online: false,
  };

  // Parallax header
  const headerHeight = scrollY.interpolate({
    inputRange: [0, HEADER_MAX - HEADER_MIN],
    outputRange: [HEADER_MAX, HEADER_MIN],
    extrapolate: 'clamp',
  });
  const avatarScale = scrollY.interpolate({
    inputRange: [0, HEADER_MAX - HEADER_MIN],
    outputRange: [1, 0.5],
    extrapolate: 'clamp',
  });
  const avatarOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_MAX - HEADER_MIN],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const titleOpacity = scrollY.interpolate({
    inputRange: [HEADER_MAX - HEADER_MIN - 40, HEADER_MAX - HEADER_MIN],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const startChat = async () => {
    try {
      const { chat } = await api.createDirectChat(id as string);
      router.push(`/chats/${chat.id}`);
    } catch (e) {
      Alert.alert('Error', 'Could not start chat');
    }
  };

  const handleVoiceCall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/call?userId=${id}&type=voice`);
  };

  const handleVideoCall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/call?userId=${id}&type=video`);
  };

  const handleBlock = () => {
    Alert.alert(
      isBlocked ? 'Unblock User' : 'Block User',
      isBlocked
        ? `Unblock ${user.display_name}? They will be able to message you again.`
        : `Block ${user.display_name}? They won't be able to message or call you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isBlocked ? 'Unblock' : 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.blockUser(id as string);
              setIsBlocked(b => !b);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {}
          },
        },
      ]
    );
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Chat with ${user.display_name} on DL Chat: dlchat://user/${id}`,
        title: user.display_name,
      });
    } catch {}
  };

  const formatLastSeen = (ts: number | null) => {
    if (!ts) return 'Last seen recently';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Online';
    if (diff < 3600000) return `Last seen ${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `Last seen ${Math.floor(diff / 3600000)}h ago`;
    return `Last seen ${new Date(ts).toLocaleDateString()}`;
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" translucent />
      <View style={s.container}>
        {/* Animated Header */}
        <Animated.View style={[s.header, { height: headerHeight }]}>
          <LinearGradient
            colors={['#0d0d2b', '#1a0a3d', '#0d0d2b']}
            style={StyleSheet.absoluteFill}
          />
          {/* Back + Actions bar */}
          <View style={s.topBar}>
            <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
              <Text style={s.iconText}>←</Text>
            </TouchableOpacity>
            <Animated.Text style={[s.headerTitle, { opacity: titleOpacity }]}>
              {user.display_name}
            </Animated.Text>
            <TouchableOpacity style={s.iconBtn} onPress={handleShare}>
              <Text style={s.iconText}>⎋</Text>
            </TouchableOpacity>
          </View>

          {/* Avatar */}
          <Animated.View style={[s.avatarWrap, { opacity: avatarOpacity, transform: [{ scale: avatarScale }] }]}>
            {user.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={s.avatar} />
            ) : (
              <LinearGradient colors={['#7c3aed', '#4f46e5']} style={s.avatar}>
                <Text style={s.avatarText}>{user.display_name[0]?.toUpperCase() || '?'}</Text>
              </LinearGradient>
            )}
            {user.is_online && <View style={s.onlineDot} />}
            {user.is_verified && <View style={s.verifiedBadge}><Text style={s.verifiedText}>✓</Text></View>}
          </Animated.View>

          <Animated.View style={[s.nameRow, { opacity: avatarOpacity }]}>
            <Text style={s.userName}>{user.display_name}</Text>
            {user.username && <Text style={s.userHandle}>@{user.username}</Text>}
            <Text style={s.lastSeen}>{user.is_online ? '● Online' : formatLastSeen(user.last_seen)}</Text>
          </Animated.View>
        </Animated.View>

        {/* Action Buttons */}
        <View style={s.actions}>
          <TouchableOpacity style={s.actionBtn} onPress={startChat}>
            <Text style={s.actionIcon}>💬</Text>
            <Text style={s.actionLabel}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={handleVoiceCall}>
            <Text style={s.actionIcon}>📞</Text>
            <Text style={s.actionLabel}>Voice Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={handleVideoCall}>
            <Text style={s.actionIcon}>🎥</Text>
            <Text style={s.actionLabel}>Video Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={handleShare}>
            <Text style={s.actionIcon}>↗️</Text>
            <Text style={s.actionLabel}>Share</Text>
          </TouchableOpacity>
        </View>

        <Animated.ScrollView
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingTop: HEADER_MAX + 72 }}
        >
          {/* Bio */}
          {user.bio ? (
            <View style={s.section}>
              <Text style={s.sectionLabel}>Bio</Text>
              <Text style={s.bioText}>{user.bio}</Text>
            </View>
          ) : null}

          {/* Info Cards */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Info</Text>
            <View style={s.infoCard}>
              <InfoRow icon="📱" label="Phone" value={user.phone || 'Hidden'} />
              <InfoRow icon="✉️" label="Email" value={user.email || 'Hidden'} />
              <InfoRow icon="🌐" label="Username" value={user.username ? `@${user.username}` : 'Not set'} />
              <InfoRow icon="📅" label="Joined" value={user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'} />
            </View>
          </View>

          {/* Shared Media Tabs */}
          <View style={s.section}>
            <View style={s.tabRow}>
              {(['media', 'files', 'links'] as const).map(t => (
                <TouchableOpacity key={t} style={[s.tabChip, tab === t && s.tabChipActive]} onPress={() => setTab(t)}>
                  <Text style={[s.tabChipText, tab === t && s.tabChipTextActive]}>
                    {t === 'media' ? '🖼️ Media' : t === 'files' ? '📁 Files' : '🔗 Links'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.mediaGrid}>
              {[0,1,2,3,4,5].map(i => (
                <LinearGradient key={i} colors={['#1a0a3d', '#0d0d2b']} style={s.mediaThumb} />
              ))}
            </View>
          </View>

          {/* Danger Zone */}
          <View style={s.section}>
            <TouchableOpacity style={s.dangerBtn} onPress={handleBlock}>
              <Text style={s.dangerIcon}>{isBlocked ? '🔓' : '🚫'}</Text>
              <Text style={s.dangerText}>{isBlocked ? 'Unblock User' : 'Block User'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.dangerBtn} onPress={() =>
              Alert.alert('Report User', 'Report this user for inappropriate behavior?', [
                { text: 'Cancel' },
                { text: 'Report', style: 'destructive' },
              ])
            }>
              <Text style={s.dangerIcon}>⚠️</Text>
              <Text style={s.dangerText}>Report User</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 40 }} />
        </Animated.ScrollView>
      </View>
    </>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoIcon}>{icon}</Text>
      <View style={s.infoContent}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05050f' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 16 },
  topBar: { position: 'absolute', top: 44, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  iconText: { color: '#fff', fontSize: 18 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  avatarWrap: { alignItems: 'center', marginBottom: 12 },
  avatar: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(124,58,237,0.6)' },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '800' },
  onlineDot: { position: 'absolute', bottom: 4, right: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: '#10b981', borderWidth: 2, borderColor: '#05050f' },
  verifiedBadge: { position: 'absolute', bottom: 0, left: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' },
  verifiedText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  nameRow: { alignItems: 'center', gap: 4 },
  userName: { color: '#fff', fontSize: 22, fontWeight: '800' },
  userHandle: { color: '#a78bfa', fontSize: 14 },
  lastSeen: { color: '#64748b', fontSize: 12 },
  actions: { position: 'absolute', top: HEADER_MAX + 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8, zIndex: 11, paddingHorizontal: 16 },
  actionBtn: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(124,58,237,0.15)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)', borderRadius: 12, paddingVertical: 10, gap: 4 },
  actionIcon: { fontSize: 22 },
  actionLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionLabel: { color: '#64748b', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  infoCard: { backgroundColor: '#0d0d1f', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(124,58,237,0.15)', overflow: 'hidden' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  infoIcon: { fontSize: 18, width: 28, textAlign: 'center' },
  infoContent: { flex: 1 },
  infoLabel: { color: '#64748b', fontSize: 11, marginBottom: 2 },
  infoValue: { color: '#f8fafc', fontSize: 14 },
  bioText: { color: '#94a3b8', fontSize: 15, lineHeight: 22, backgroundColor: '#0d0d1f', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(124,58,237,0.15)' },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tabChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  tabChipActive: { backgroundColor: 'rgba(124,58,237,0.2)', borderColor: 'rgba(124,58,237,0.5)' },
  tabChipText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  tabChipTextActive: { color: '#a78bfa' },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  mediaThumb: { width: (W - 35) / 3, height: (W - 35) / 3, borderRadius: 8 },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#0d0d1f', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', marginBottom: 8 },
  dangerIcon: { fontSize: 18 },
  dangerText: { color: '#ef4444', fontSize: 15, fontWeight: '600' },
});
