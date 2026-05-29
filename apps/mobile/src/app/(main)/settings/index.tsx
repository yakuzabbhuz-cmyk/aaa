/**
 * DL Chat — Settings Screen
 * DEATH LEGION Team — Proprietary & Confidential
 * © 2025 DL Chat. All rights reserved.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Alert, Image, Platform,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../../store/auth';

type SettingItem = {
  icon: string; label: string; sublabel?: string;
  type?: 'navigate' | 'toggle' | 'danger' | 'info';
  value?: boolean; onPress?: () => void; onToggle?: (v: boolean) => void;
};

export default function SettingsScreen() {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [notifs, setNotifs] = useState(true);
  const [sounds, setSounds] = useState(true);
  const [readReceipts, setReadReceipts] = useState(true);
  const [onlineStatus, setOnlineStatus] = useState(true);
  const [twoFA, setTwoFA] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [autoDownload, setAutoDownload] = useState(true);
  const [biometric, setBiometric] = useState(false);

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out from all devices?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out', style: 'destructive',
        onPress: async () => {
          try {
            await SecureStore.deleteItemAsync('auth_token');
            clearAuth();
            router.replace('/(auth)/login');
          } catch {}
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      '⚠️ Delete Account',
      'This will permanently delete your account, all messages, and data. This action CANNOT be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'I understand, Delete', style: 'destructive', onPress: () => {} },
      ]
    );
  };

  const sections: { title: string; items: SettingItem[] }[] = [
    {
      title: 'Account',
      items: [
        { icon: '👤', label: 'Edit Profile', sublabel: 'Name, bio, photo', type: 'navigate', onPress: () => router.push('/settings/edit-profile') },
        { icon: '📱', label: 'Phone & Email', sublabel: user?.phone || 'Not set', type: 'navigate', onPress: () => router.push('/settings/phone') },
        { icon: '🔑', label: 'Change Password', type: 'navigate', onPress: () => router.push('/settings/password') },
        { icon: '🔐', label: 'Two-Factor Auth', sublabel: twoFA ? 'Enabled' : 'Disabled', type: 'navigate', onPress: () => router.push('/settings/2fa') },
        { icon: '🗝️', label: 'Passkeys', sublabel: 'Manage biometric login', type: 'navigate', onPress: () => router.push('/settings/passkeys') },
        { icon: '📱', label: 'Active Sessions', sublabel: '1 device', type: 'navigate', onPress: () => router.push('/settings/sessions') },
      ],
    },
    {
      title: 'Privacy',
      items: [
        { icon: '👁️', label: 'Online Status', sublabel: 'Who can see you\'re online', type: 'toggle', value: onlineStatus, onToggle: setOnlineStatus },
        { icon: '✓✓', label: 'Read Receipts', sublabel: 'Show when you\'ve read messages', type: 'toggle', value: readReceipts, onToggle: setReadReceipts },
        { icon: '🔒', label: 'Privacy Settings', sublabel: 'Last seen, profile photo, groups', type: 'navigate', onPress: () => router.push('/settings/privacy') },
        { icon: '🚫', label: 'Blocked Users', sublabel: '0 users blocked', type: 'navigate', onPress: () => router.push('/settings/blocked') },
        { icon: '🗑️', label: 'Disappearing Messages', sublabel: 'Default: Off', type: 'navigate', onPress: () => router.push('/settings/disappearing') },
      ],
    },
    {
      title: 'Notifications',
      items: [
        { icon: '🔔', label: 'Push Notifications', type: 'toggle', value: notifs, onToggle: setNotifs },
        { icon: '🔊', label: 'Message Sounds', type: 'toggle', value: sounds, onToggle: setSounds },
        { icon: '📳', label: 'Vibration', type: 'navigate', onPress: () => {} },
        { icon: '🎵', label: 'Notification Tone', sublabel: 'Default', type: 'navigate', onPress: () => {} },
        { icon: '🤫', label: 'Do Not Disturb', sublabel: 'Off', type: 'navigate', onPress: () => {} },
      ],
    },
    {
      title: 'Appearance',
      items: [
        { icon: '🌙', label: 'Dark Mode', type: 'toggle', value: darkMode, onToggle: setDarkMode },
        { icon: '🎨', label: 'Theme', sublabel: 'Deep Space (Default)', type: 'navigate', onPress: () => router.push('/settings/theme') },
        { icon: '🔤', label: 'Font Size', sublabel: 'Medium', type: 'navigate', onPress: () => {} },
        { icon: '💬', label: 'Chat Wallpaper', type: 'navigate', onPress: () => {} },
      ],
    },
    {
      title: 'Storage & Data',
      items: [
        { icon: '📥', label: 'Auto-Download Media', type: 'toggle', value: autoDownload, onToggle: setAutoDownload },
        { icon: '💾', label: 'Storage Usage', sublabel: 'Calculating...', type: 'navigate', onPress: () => {} },
        { icon: '🔗', label: 'Network Usage', type: 'navigate', onPress: () => {} },
        { icon: '☁️', label: 'Chat Backup', sublabel: 'Never backed up', type: 'navigate', onPress: () => {} },
      ],
    },
    {
      title: 'Security',
      items: [
        { icon: '🤳', label: 'Biometric Lock', type: 'toggle', value: biometric, onToggle: setBiometric },
        { icon: '⏱️', label: 'Auto-Lock', sublabel: '1 minute', type: 'navigate', onPress: () => {} },
        { icon: '🔏', label: 'Encryption Keys', sublabel: 'View your key fingerprint', type: 'navigate', onPress: () => router.push('/settings/keys') },
        { icon: '🛡️', label: 'Security Log', type: 'navigate', onPress: () => {} },
      ],
    },
    {
      title: 'About',
      items: [
        { icon: '📋', label: 'App Version', sublabel: '1.0.0 (build 1)', type: 'info' },
        { icon: '📜', label: 'Terms of Service', type: 'navigate', onPress: () => {} },
        { icon: '🔒', label: 'Privacy Policy', type: 'navigate', onPress: () => {} },
        { icon: '⚖️', label: 'Open Source Licenses', type: 'navigate', onPress: () => {} },
        { icon: '🐛', label: 'Report a Bug', type: 'navigate', onPress: () => {} },
        { icon: '💡', label: 'DL Chat Bot', sublabel: '@dlchatbot — support & tips', type: 'navigate', onPress: () => {} },
      ],
    },
    {
      title: 'Account Actions',
      items: [
        { icon: '🚪', label: 'Log Out', type: 'danger', onPress: handleLogout },
        { icon: '💀', label: 'Delete Account', type: 'danger', onPress: handleDeleteAccount },
      ],
    },
  ];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.container}>
        {/* Header */}
        <LinearGradient colors={['#0d0d2b', '#05050f']} style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backText}>←</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Settings</Text>
          <View style={{ width: 40 }} />
        </LinearGradient>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Profile Preview */}
          <TouchableOpacity style={s.profileCard} onPress={() => router.push('/settings/edit-profile')}>
            <LinearGradient colors={['#7c3aed', '#4f46e5']} style={s.profileAvatar}>
              <Text style={s.profileAvatarText}>{user?.display_name?.[0]?.toUpperCase() || 'U'}</Text>
            </LinearGradient>
            <View style={s.profileInfo}>
              <Text style={s.profileName}>{user?.display_name || 'Your Name'}</Text>
              <Text style={s.profileHandle}>{user?.username ? `@${user.username}` : user?.phone || 'Set username'}</Text>
              <Text style={s.profileBio}>{user?.bio || 'Add a bio...'}</Text>
            </View>
            <Text style={s.profileArrow}>›</Text>
          </TouchableOpacity>

          {/* Settings Sections */}
          {sections.map(section => (
            <View key={section.title} style={s.section}>
              <Text style={s.sectionTitle}>{section.title}</Text>
              <View style={s.sectionCard}>
                {section.items.map((item, idx) => (
                  <SettingRow
                    key={item.label}
                    item={item}
                    isLast={idx === section.items.length - 1}
                  />
                ))}
              </View>
            </View>
          ))}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </>
  );
}

function SettingRow({ item, isLast }: { item: SettingItem; isLast: boolean }) {
  const isDanger = item.type === 'danger';
  const isToggle = item.type === 'toggle';

  return (
    <TouchableOpacity
      style={[s.row, !isLast && s.rowBorder]}
      onPress={item.onPress}
      disabled={isToggle || item.type === 'info'}
      activeOpacity={0.7}
    >
      <View style={s.rowLeft}>
        <View style={[s.rowIcon, isDanger && s.rowIconDanger]}>
          <Text style={s.rowIconText}>{item.icon}</Text>
        </View>
        <View style={s.rowText}>
          <Text style={[s.rowLabel, isDanger && s.rowLabelDanger]}>{item.label}</Text>
          {item.sublabel && <Text style={s.rowSublabel}>{item.sublabel}</Text>}
        </View>
      </View>
      {isToggle ? (
        <Switch
          value={item.value}
          onValueChange={item.onToggle}
          trackColor={{ false: '#1e293b', true: '#7c3aed' }}
          thumbColor={item.value ? '#fff' : '#64748b'}
        />
      ) : item.type !== 'info' ? (
        <Text style={s.rowArrow}>›</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05050f' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#fff', fontSize: 20 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, margin: 16, padding: 16, backgroundColor: '#0d0d1f', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)' },
  profileAvatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  profileAvatarText: { color: '#fff', fontSize: 24, fontWeight: '800' },
  profileInfo: { flex: 1 },
  profileName: { color: '#f8fafc', fontSize: 17, fontWeight: '700', marginBottom: 2 },
  profileHandle: { color: '#a78bfa', fontSize: 13, marginBottom: 4 },
  profileBio: { color: '#64748b', fontSize: 12 },
  profileArrow: { color: '#475569', fontSize: 24 },
  section: { marginHorizontal: 16, marginBottom: 20 },
  sectionTitle: { color: '#64748b', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  sectionCard: { backgroundColor: '#0d0d1f', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(124,58,237,0.15)', alignItems: 'center', justifyContent: 'center' },
  rowIconDanger: { backgroundColor: 'rgba(239,68,68,0.1)' },
  rowIconText: { fontSize: 16 },
  rowText: { flex: 1 },
  rowLabel: { color: '#f8fafc', fontSize: 15 },
  rowLabelDanger: { color: '#ef4444' },
  rowSublabel: { color: '#64748b', fontSize: 12, marginTop: 1 },
  rowArrow: { color: '#475569', fontSize: 20 },
});
