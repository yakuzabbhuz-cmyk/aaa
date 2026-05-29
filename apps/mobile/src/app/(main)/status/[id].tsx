// ============================================
// DL Chat Mobile - Status Viewer Screen
// Full-screen story/status viewer with progress
// ============================================
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import { useAuthStore } from '../../../store/auth';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STATUS_DURATION = 5000; // 5 seconds per status

export default function StatusViewerScreen() {
  const { id: userId, startId } = useLocalSearchParams<{ id: string; startId?: string }>();
  const { user } = useAuthStore();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['status', userId],
    queryFn: () => apiClient.getUserStatuses(userId),
  });

  const statuses = data?.data?.statuses || [];
  const currentStatus = statuses[currentIndex];
  const isMyStatus = userId === user?.id;

  // ─── Progress animation ─────────────────────────────────────────────────────
  const startProgress = useCallback(() => {
    progressAnim.setValue(0);
    animRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: STATUS_DURATION,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) {
        goNext();
      }
    });
  }, [currentIndex, statuses.length]);

  useEffect(() => {
    if (statuses.length === 0) return;
    if (isPaused) {
      animRef.current?.stop();
    } else {
      startProgress();
    }
    return () => animRef.current?.stop();
  }, [currentIndex, isPaused, statuses.length]);

  // ─── Mark as viewed ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (currentStatus && !isMyStatus) {
      apiClient.viewStatus(currentStatus.id).catch(() => {});
    }
  }, [currentStatus?.id]);

  function goNext() {
    if (currentIndex < statuses.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      router.back();
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    } else {
      router.back();
    }
  }

  async function handleReply() {
    if (!replyText.trim() || !currentStatus) return;
    try {
      await apiClient.replyToStatus(currentStatus.id, replyText.trim());
      setReplyText('');
      setShowReply(false);
    } catch {
      Alert.alert('Error', 'Could not send reply.');
    }
  }

  async function handleReact(emoji: string) {
    if (!currentStatus) return;
    try {
      await apiClient.reactToStatus(currentStatus.id, emoji);
    } catch {
      // ignore
    }
  }

  async function handleDelete() {
    if (!currentStatus || !isMyStatus) return;
    Alert.alert('Delete Status', 'Delete this status?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.deleteStatus(currentStatus.id);
            if (statuses.length <= 1) {
              router.back();
            } else {
              goNext();
            }
          } catch {
            Alert.alert('Error', 'Could not delete status.');
          }
        },
      },
    ]);
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" hidden />
        <View style={styles.loadingOverlay} />
      </View>
    );
  }

  if (!currentStatus) {
    router.back();
    return null;
  }

  const bgColor = currentStatus.background_color || '#1a1a2e';

  return (
    <View style={styles.container}>
      <StatusBar style="light" hidden />

      {/* Background */}
      {currentStatus.type === 'image' && currentStatus.media_url ? (
        <Image
          source={{ uri: currentStatus.media_url }}
          style={styles.bgImage}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.bgColor, { backgroundColor: bgColor }]} />
      )}

      {/* Overlay for text readability */}
      <View style={styles.overlay} />

      {/* Progress bars */}
      <View style={styles.progressBars}>
        {statuses.map((_, i) => (
          <View key={i} style={styles.progressBarBg}>
            <Animated.View
              style={[
                styles.progressBarFill,
                {
                  width:
                    i < currentIndex
                      ? '100%'
                      : i === currentIndex
                      ? progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%'],
                        })
                      : '0%',
                },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(currentStatus.user_name?.[0] || '?').toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.userName}>{currentStatus.user_name || 'Unknown'}</Text>
            <Text style={styles.statusTime}>{formatTime(currentStatus.created_at)}</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {isMyStatus && (
            <>
              <Text style={styles.viewerCount}>👁 {currentStatus.viewer_count}</Text>
              <TouchableOpacity onPress={handleDelete} style={styles.headerBtn}>
                <Text style={styles.headerBtnIcon}>🗑️</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <Text style={styles.headerBtnIcon}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tap zones for navigation */}
      <View style={styles.tapZones}>
        <Pressable
          style={styles.tapLeft}
          onPress={goPrev}
          onLongPress={() => setIsPaused(true)}
          onPressOut={() => setIsPaused(false)}
        />
        <Pressable
          style={styles.tapRight}
          onPress={goNext}
          onLongPress={() => setIsPaused(true)}
          onPressOut={() => setIsPaused(false)}
        />
      </View>

      {/* Content */}
      {currentStatus.type === 'text' && currentStatus.content ? (
        <View style={styles.textContent}>
          <Text style={styles.statusText}>{currentStatus.content}</Text>
        </View>
      ) : null}

      {/* Footer */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.footer}
      >
        {/* Quick reactions */}
        {!isMyStatus && !showReply && (
          <View style={styles.reactions}>
            {['❤️', '😂', '😮', '😢', '🙏', '🔥'].map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.reactionBtn}
                onPress={() => handleReact(emoji)}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Reply input */}
        {!isMyStatus && (
          showReply ? (
            <View style={styles.replyBar}>
              <TextInput
                style={styles.replyInput}
                placeholder="Reply to status..."
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={replyText}
                onChangeText={setReplyText}
                autoFocus
                onBlur={() => !replyText && setShowReply(false)}
              />
              <TouchableOpacity
                style={styles.replySendBtn}
                onPress={handleReply}
                disabled={!replyText.trim()}
              >
                <Text style={styles.replySendIcon}>▶</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.replyPlaceholder}
              onPress={() => {
                setShowReply(true);
                setIsPaused(true);
              }}
            >
              <Text style={styles.replyPlaceholderText}>Reply to {currentStatus.user_name}...</Text>
            </TouchableOpacity>
          )
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function formatTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m ago`;
  if (m > 0) return `${m}m ago`;
  return 'Just now';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  bgImage: { position: 'absolute', width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
  bgColor: { position: 'absolute', width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
  overlay: {
    position: 'absolute',
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  loadingOverlay: { flex: 1, backgroundColor: '#1a1a1a' },
  progressBars: {
    position: 'absolute',
    top: 50,
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 4,
    zIndex: 10,
  },
  progressBarBg: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 1,
  },
  header: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  userInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#6c63ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  userName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  statusTime: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewerCount: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  headerBtn: { padding: 8 },
  headerBtnIcon: { fontSize: 20 },
  tapZones: {
    position: 'absolute',
    top: 110,
    left: 0,
    right: 0,
    bottom: 120,
    flexDirection: 'row',
    zIndex: 5,
  },
  tapLeft: { flex: 1 },
  tapRight: { flex: 1 },
  textContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    zIndex: 3,
  },
  statusText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 38,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    paddingHorizontal: 16,
    gap: 10,
    zIndex: 10,
  },
  reactions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  reactionBtn: {
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
  },
  reactionEmoji: { fontSize: 24 },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 4,
    gap: 8,
  },
  replyInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    paddingVertical: 8,
  },
  replySendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6c63ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  replySendIcon: { color: '#fff', fontSize: 14, fontWeight: '700', marginLeft: 2 },
  replyPlaceholder: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24,
  },
  replyPlaceholderText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
  },
});
