// ============================================
// DL Chat Mobile - App Update Hook
// Handles OTA updates (Expo Updates) + 
// In-app APK download for Android sideloads
// ============================================
import { useState, useEffect, useCallback } from 'react';
import { Platform, Alert, Linking } from 'react-native';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://dl-chat-api.death-legion-dlchat.workers.dev';

export interface UpdateInfo {
  available: boolean;
  version?: string;
  build?: number;
  downloadUrl?: string;
  changelog?: string;
  sizeBytes?: number;
  isCritical?: boolean;
  isOta?: boolean; // Expo OTA update
}

export interface UpdateProgress {
  downloading: boolean;
  percent: number;
  bytesDownloaded: number;
  totalBytes: number;
  speed: number; // bytes/sec
}

export function useAppUpdate() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Check for OTA updates (Expo Updates) ──────────────────────────────────
  const checkOtaUpdate = useCallback(async (): Promise<UpdateInfo | null> => {
    // OTA updates only in production builds
    if (__DEV__ || Updates.channel === 'development') return null;

    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        return {
          available: true,
          isOta: true,
          changelog: 'Bug fixes and performance improvements.',
        };
      }
    } catch (err) {
      console.log('[OTA] Check failed:', err);
    }
    return null;
  }, []);

  // ─── Check for native app updates (APK/Store) ──────────────────────────────
  const checkNativeUpdate = useCallback(async (): Promise<UpdateInfo | null> => {
    try {
      const currentVersion = Constants.expoConfig?.version || '1.0.0';
      const currentBuild = Constants.expoConfig?.android?.versionCode || 1;
      const platform = Platform.OS; // 'android' | 'ios'

      const response = await fetch(
        `${API_BASE}/api/v1/updates/check?platform=${platform}&current_version=${currentVersion}&current_build=${currentBuild}`,
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (!response.ok) return null;
      const data = await response.json();

      if (data.success && data.data.update_available) {
        return {
          available: true,
          version: data.data.latest_version,
          build: data.data.latest_build,
          downloadUrl: data.data.download_url,
          changelog: data.data.changelog,
          sizeBytes: data.data.size_bytes,
          isCritical: data.data.is_critical,
          isOta: false,
        };
      }
    } catch (err) {
      console.error('[Update] Native check failed:', err);
    }
    return null;
  }, []);

  // ─── Main check function ────────────────────────────────────────────────────
  const checkForUpdates = useCallback(async (silent = false) => {
    setChecking(true);
    setError(null);

    try {
      // First try OTA update (instant, no install required)
      const otaUpdate = await checkOtaUpdate();
      if (otaUpdate) {
        setUpdateInfo(otaUpdate);
        return otaUpdate;
      }

      // Then check for native update
      const nativeUpdate = await checkNativeUpdate();
      if (nativeUpdate) {
        setUpdateInfo(nativeUpdate);
        return nativeUpdate;
      }

      if (!silent) {
        setUpdateInfo({ available: false });
      }
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update check failed';
      setError(msg);
      return null;
    } finally {
      setChecking(false);
    }
  }, [checkOtaUpdate, checkNativeUpdate]);

  // ─── Apply OTA update ───────────────────────────────────────────────────────
  const applyOtaUpdate = useCallback(async () => {
    if (!updateInfo?.isOta) return;

    try {
      setProgress({ downloading: true, percent: 0, bytesDownloaded: 0, totalBytes: 0, speed: 0 });

      await Updates.fetchUpdateAsync();

      setProgress(null);

      Alert.alert(
        'Update Ready',
        'DL Chat has been updated. Restart to apply changes?',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Restart Now',
            onPress: () => Updates.reloadAsync(),
          },
        ]
      );
    } catch (err) {
      setProgress(null);
      setError('Failed to apply update. Please try again.');
    }
  }, [updateInfo]);

  // ─── Download APK (Android sideload) ───────────────────────────────────────
  const downloadApk = useCallback(async (url: string, totalBytes: number) => {
    if (Platform.OS !== 'android') return;

    try {
      // For Android, we open the APK URL in the browser
      // The OS handles the download and installation prompt
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        throw new Error('Cannot open URL');
      }
    } catch (err) {
      setError('Could not open download link. Please visit dlchat.app to download manually.');
    }
  }, []);

  // ─── Main apply update function ─────────────────────────────────────────────
  const applyUpdate = useCallback(async () => {
    if (!updateInfo?.available) return;

    if (updateInfo.isOta) {
      await applyOtaUpdate();
    } else if (updateInfo.downloadUrl) {
      if (Platform.OS === 'android') {
        // Open APK download
        await downloadApk(updateInfo.downloadUrl, updateInfo.sizeBytes || 0);
      } else if (Platform.OS === 'ios') {
        // Open App Store
        await Linking.openURL(updateInfo.downloadUrl);
      }
    }
  }, [updateInfo, applyOtaUpdate, downloadApk]);

  // ─── Auto-check on mount (every 6 hours) ────────────────────────────────────
  useEffect(() => {
    // Initial check (silent)
    checkForUpdates(true);

    // Periodic check
    const interval = setInterval(() => {
      checkForUpdates(true);
    }, 6 * 60 * 60 * 1000); // 6 hours

    return () => clearInterval(interval);
  }, []);

  return {
    updateInfo,
    progress,
    checking,
    error,
    checkForUpdates,
    applyUpdate,
    dismiss: () => setUpdateInfo(null),
  };
}
