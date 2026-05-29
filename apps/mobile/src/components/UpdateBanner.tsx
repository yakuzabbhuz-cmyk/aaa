// ============================================
// DL Chat Mobile - Update Banner Component
// Shows a bottom banner when update is available
// ============================================
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { COLORS } from '../constants/theme';

export function UpdateBanner() {
  const { updateInfo, progress, checking, applyUpdate, dismiss, checkForUpdates } = useAppUpdate();
  const slideAnim = useRef(new Animated.Value(100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const isVisible = updateInfo?.available && !progress;

  useEffect(() => {
    if (isVisible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 100,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isVisible]);

  // Download progress UI
  if (progress?.downloading) {
    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>Downloading Update...</Text>
          <Text style={styles.progressPercent}>{Math.round(progress.percent)}%</Text>
        </View>
        <View style={styles.progressBarBg}>
          <Animated.View
            style={[styles.progressBarFill, { width: `${progress.percent}%` }]}
          />
        </View>
        <Text style={styles.progressDetail}>
          {(progress.bytesDownloaded / 1024 / 1024).toFixed(1)} MB /{' '}
          {(progress.totalBytes / 1024 / 1024).toFixed(1)} MB
          {progress.speed > 0
            ? ` · ${(progress.speed / 1024).toFixed(0)} KB/s`
            : ''}
        </Text>
      </View>
    );
  }

  if (!isVisible) return null;

  const isOta = updateInfo?.isOta;
  const isCritical = updateInfo?.isCritical;
  const version = updateInfo?.version;
  const sizeMB = updateInfo?.sizeBytes
    ? (updateInfo.sizeBytes / 1024 / 1024).toFixed(0) + ' MB'
    : '';

  return (
    <Animated.View
      style={[
        styles.banner,
        isCritical && styles.bannerCritical,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      {/* Icon */}
      <View style={[styles.iconContainer, isCritical && styles.iconCritical]}>
        <Text style={styles.icon}>{isOta ? '⚡' : '⬇️'}</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title}>
          {isCritical ? '🔴 Required Update' : 'Update Available'}
          {version ? ` — v${version}` : ''}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {updateInfo?.changelog ||
            (isOta
              ? 'Bug fixes and performance improvements'
              : `New features and security updates${sizeMB ? ` · ${sizeMB}` : ''}`)}
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {!isCritical && (
          <TouchableOpacity style={styles.dismissBtn} onPress={dismiss}>
            <Text style={styles.dismissText}>Later</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.updateBtn} onPress={applyUpdate}>
          <Text style={styles.updateText}>
            {isOta ? 'Update' : Platform.OS === 'ios' ? 'App Store' : 'Install'}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // ─── Banner ────────────────────────────────────────────────────────────────
  banner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1a1a2e',
    borderTopWidth: 1,
    borderTopColor: '#6c63ff40',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 12,
    zIndex: 9999,
  },
  bannerCritical: {
    borderTopColor: '#e53e3e60',
    backgroundColor: '#1a0a0a',
  },

  // ─── Icon ──────────────────────────────────────────────────────────────────
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCritical: {
    backgroundColor: 'rgba(229, 62, 62, 0.15)',
  },
  icon: {
    fontSize: 20,
  },

  // ─── Content ───────────────────────────────────────────────────────────────
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  subtitle: {
    color: '#a0a0a0',
    fontSize: 11,
    lineHeight: 16,
  },

  // ─── Actions ───────────────────────────────────────────────────────────────
  actions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dismissBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  dismissText: {
    color: '#a0a0a0',
    fontSize: 12,
    fontWeight: '500',
  },
  updateBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: COLORS.primary || '#6c63ff',
  },
  updateText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  // ─── Progress ──────────────────────────────────────────────────────────────
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1a1a2e',
    borderTopWidth: 1,
    borderTopColor: '#6c63ff40',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    gap: 6,
    zIndex: 9999,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  progressPercent: {
    color: '#6c63ff',
    fontSize: 13,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#2a2a2a',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6c63ff',
    borderRadius: 2,
  },
  progressDetail: {
    color: '#a0a0a0',
    fontSize: 11,
  },
});
