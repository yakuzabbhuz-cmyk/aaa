// ============================================
// DL Chat Mobile - Main Tab Layout
// ============================================
import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { COLORS } from '../../constants/theme';
import { useChatsStore } from '../../store/chats';
import { useWebSocket } from '../../hooks/useWebSocket';

function TabIcon({ name, focused, icon, badge }: {
  name: string;
  focused: boolean;
  icon: string;
  badge?: number;
}) {
  return (
    <View style={styles.tabItem}>
      <View style={styles.iconWrapper}>
        <Text style={[styles.icon, focused && styles.iconActive]}>{icon}</Text>
        {badge && badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.label, focused && styles.labelActive]}>{name}</Text>
    </View>
  );
}

export default function MainLayout() {
  const { chats } = useChatsStore();
  const totalUnread = chats.reduce((sum, c) => sum + c.unread_count, 0);

  // Initialize WebSocket
  useWebSocket();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="chats"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="Chats" focused={focused} icon="💬" badge={totalUnread} />
          ),
        }}
      />
      <Tabs.Screen
        name="status"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="Status" focused={focused} icon="⭕" />
          ),
        }}
      />
      <Tabs.Screen
        name="calls"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="Calls" focused={focused} icon="📞" />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="Settings" focused={focused} icon="⚙️" />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#0A0A14',
    borderTopWidth: 1,
    borderTopColor: '#1A1A2E',
    height: Platform.OS === 'ios' ? 84 : 64,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    paddingTop: 8,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  iconWrapper: {
    position: 'relative',
  },
  icon: {
    fontSize: 24,
    opacity: 0.5,
  },
  iconActive: {
    opacity: 1,
  },
  label: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  labelActive: {
    color: '#6C63FF',
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    backgroundColor: '#FF4B4B',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
