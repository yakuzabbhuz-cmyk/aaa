/**
 * DL Chat — Active Call Screen (Voice + Video)
 * DEATH LEGION Team — Proprietary & Confidential
 * © 2025 DL Chat. All rights reserved.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Dimensions, StatusBar, Alert, Vibration,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

const { width: W, height: H } = Dimensions.get('window');

type CallState = 'ringing' | 'connecting' | 'connected' | 'ended';

export default function CallScreen() {
  const { userId, type, chatId, name, avatar } = useLocalSearchParams<{
    userId: string; type: 'voice' | 'video'; chatId?: string; name?: string; avatar?: string;
  }>();
  const router = useRouter();
  const isVideo = type === 'video';

  const [state, setState] = useState<CallState>('ringing');
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(isVideo);
  const [cameraOn, setCameraOn] = useState(isVideo);
  const [frontCamera, setFrontCamera] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [quality, setQuality] = useState<'HD' | 'SD'>('HD');

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Simulate connection
    setTimeout(() => setState('connecting'), 1500);
    setTimeout(() => {
      setState('connected');
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    }, 3000);

    // Pulse animation while ringing
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const endCall = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setState('ended');
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeout(() => router.back(), 1000);
  }, [router]);

  const toggleMute = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMuted(m => !m);
  };
  const toggleSpeaker = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSpeakerOn(s => !s);
  };
  const toggleCamera = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCameraOn(c => !c);
  };
  const flipCamera = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFrontCamera(f => !f);
  };

  const handleTap = () => {
    if (!showControls) {
      setShowControls(true);
      Animated.timing(controlsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setShowControls(false);
      Animated.timing(controlsOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }, 4000);
  };

  const stateLabel = {
    ringing: `Calling ${name || 'User'}...`,
    connecting: 'Connecting...',
    connected: formatDuration(duration),
    ended: 'Call Ended',
  }[state];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <TouchableOpacity style={s.container} activeOpacity={1} onPress={handleTap}>
        {/* Background */}
        {isVideo && cameraOn ? (
          <LinearGradient colors={['#0a0a1a', '#1a0a2a', '#0a0a1a']} style={StyleSheet.absoluteFill} />
        ) : (
          <LinearGradient colors={['#0d0d2b', '#1a0535', '#0d0d2b']} style={StyleSheet.absoluteFill} />
        )}

        {/* Animated background circles */}
        <Animated.View style={[s.pulseOuter, { transform: [{ scale: pulseAnim }], opacity: state === 'connected' ? 0 : 0.3 }]} />
        <Animated.View style={[s.pulseInner, { transform: [{ scale: pulseAnim }], opacity: state === 'connected' ? 0 : 0.5 }]} />

        {/* Caller Info */}
        <View style={s.callerSection}>
          {/* Quality badge */}
          {state === 'connected' && (
            <View style={s.qualityBadge}>
              <View style={[s.qualityDot, { backgroundColor: quality === 'HD' ? '#10b981' : '#f59e0b' }]} />
              <Text style={s.qualityText}>{quality} · E2E Encrypted 🔐</Text>
            </View>
          )}

          {/* Avatar */}
          <Animated.View style={[s.avatarOuter, state === 'ringing' && { transform: [{ scale: pulseAnim }] }]}>
            <LinearGradient colors={['#7c3aed', '#4f46e5']} style={s.avatar}>
              <Text style={s.avatarText}>{(name || 'U')[0].toUpperCase()}</Text>
            </LinearGradient>
          </Animated.View>

          <Text style={s.callerName}>{name || 'Unknown'}</Text>
          <Text style={s.callState}>{stateLabel}</Text>
          {state === 'connected' && (
            <View style={s.encBadge}>
              <Text style={s.encText}>🔐 End-to-End Encrypted</Text>
            </View>
          )}
        </View>

        {/* Self video preview (top-right) */}
        {isVideo && cameraOn && state === 'connected' && (
          <View style={s.selfVideo}>
            <LinearGradient colors={['#1a0a3d', '#0a0a1a']} style={s.selfVideoInner}>
              <Text style={s.selfVideoText}>{frontCamera ? '🤳' : '📷'}</Text>
            </LinearGradient>
          </View>
        )}

        {/* Controls */}
        <Animated.View style={[s.controls, { opacity: controlsOpacity }]}>
          {/* Secondary controls */}
          <View style={s.secondaryControls}>
            <ControlBtn icon={muted ? '🔇' : '🎤'} label={muted ? 'Unmute' : 'Mute'} active={muted} onPress={toggleMute} />
            <ControlBtn icon={speakerOn ? '🔊' : '🔈'} label={speakerOn ? 'Speaker' : 'Earpiece'} active={speakerOn} onPress={toggleSpeaker} />
            {isVideo && <ControlBtn icon={cameraOn ? '📷' : '📵'} label={cameraOn ? 'Camera' : 'No Cam'} active={!cameraOn} onPress={toggleCamera} />}
            {isVideo && <ControlBtn icon="🔄" label="Flip" onPress={flipCamera} />}
            {!isVideo && <ControlBtn icon="⌨️" label="Keypad" onPress={() => {}} />}
            <ControlBtn icon="➕" label="Add" onPress={() => {}} />
          </View>

          {/* End call button */}
          <TouchableOpacity style={s.endCallBtn} onPress={endCall} activeOpacity={0.8}>
            <LinearGradient colors={['#ef4444', '#dc2626']} style={s.endCallGradient}>
              <Text style={s.endCallIcon}>📵</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </>
  );
}

function ControlBtn({ icon, label, active, onPress }: { icon: string; label: string; active?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.ctrlBtn} onPress={onPress}>
      <View style={[s.ctrlIcon, active && s.ctrlIconActive]}>
        <Text style={s.ctrlIconText}>{icon}</Text>
      </View>
      <Text style={s.ctrlLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  pulseOuter: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: '#7c3aed', top: H * 0.22 },
  pulseInner: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: '#7c3aed', top: H * 0.26 },
  callerSection: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
  qualityBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 100, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' },
  qualityDot: { width: 6, height: 6, borderRadius: 3 },
  qualityText: { color: '#e2e8f0', fontSize: 12, fontWeight: '600' },
  avatarOuter: { marginBottom: 8 },
  avatar: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.2)' },
  avatarText: { color: '#fff', fontSize: 48, fontWeight: '800' },
  callerName: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  callState: { color: '#94a3b8', fontSize: 16, fontFamily: 'JetBrains Mono, monospace' },
  encBadge: { paddingHorizontal: 14, paddingVertical: 5, backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 100, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' },
  encText: { color: '#10b981', fontSize: 12, fontWeight: '600' },
  selfVideo: { position: 'absolute', top: 100, right: 16, width: 100, height: 140, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(124,58,237,0.5)' },
  selfVideoInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  selfVideoText: { fontSize: 36 },
  controls: { paddingBottom: 48, paddingHorizontal: 20, width: '100%', alignItems: 'center', gap: 24 },
  secondaryControls: { flexDirection: 'row', justifyContent: 'center', gap: 16, flexWrap: 'wrap' },
  ctrlBtn: { alignItems: 'center', gap: 6, minWidth: 64 },
  ctrlIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  ctrlIconActive: { backgroundColor: 'rgba(239,68,68,0.2)', borderColor: 'rgba(239,68,68,0.5)' },
  ctrlIconText: { fontSize: 24 },
  ctrlLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  endCallBtn: { width: 76, height: 76, borderRadius: 38, overflow: 'hidden', shadowColor: '#ef4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 12, elevation: 12 },
  endCallGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  endCallIcon: { fontSize: 32 },
});
