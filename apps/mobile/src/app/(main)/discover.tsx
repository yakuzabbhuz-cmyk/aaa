/**
 * DL Chat — Discover / Search Screen
 * DEATH LEGION Team — Proprietary & Confidential
 * © 2025 DL Chat. All rights reserved.
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity,
  ScrollView, Animated, Keyboard, ActivityIndicator,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import api from '../api/client';

type SearchTab = 'all' | 'people' | 'groups' | 'servers' | 'messages';

const TRENDING_TOPICS = ['#deathlegion', '#crypto', '#gaming', '#dev', '#music', '#anime'];
const CATEGORIES = [
  { id: 'gaming', icon: '🎮', label: 'Gaming', color: '#7c3aed' },
  { id: 'tech', icon: '💻', label: 'Tech', color: '#06b6d4' },
  { id: 'music', icon: '🎵', label: 'Music', color: '#f59e0b' },
  { id: 'sports', icon: '⚽', label: 'Sports', color: '#10b981' },
  { id: 'art', icon: '🎨', label: 'Art', color: '#ec4899' },
  { id: 'anime', icon: '⛩️', label: 'Anime', color: '#ef4444' },
  { id: 'crypto', icon: '₿', label: 'Crypto', color: '#f59e0b' },
  { id: 'science', icon: '🔬', label: 'Science', color: '#0ea5e9' },
];

const FEATURED_SERVERS = [
  { id: 'dl-official', name: 'DEATH LEGION Official', members: 84200, icon: '💀', verified: true, category: 'Community' },
  { id: 'dl-dev', name: 'DL Developers', members: 12400, icon: '⚡', verified: true, category: 'Tech' },
  { id: 'dl-gaming', name: 'DL Gaming Lounge', members: 31000, icon: '🎮', verified: false, category: 'Gaming' },
  { id: 'anime-world', name: 'Anime World', members: 95000, icon: '⛩️', verified: false, category: 'Anime' },
];

export default function DiscoverScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<SearchTab>('all');
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const searchAnim = useRef(new Animated.Value(0)).current;

  const focusSearch = () => {
    Animated.timing(searchAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    inputRef.current?.focus();
  };
  const blurSearch = () => {
    if (!query) {
      Animated.timing(searchAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    }
  };

  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['search', query, tab],
    queryFn: async () => {
      if (!query || query.length < 2) return null;
      const res = await api.searchUsers(query);
      return { users: res.users, groups: [], servers: [], messages: [] };
    },
    enabled: query.length >= 2,
    staleTime: 10000,
  });

  const renderUserResult = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={s.resultItem}
      onPress={() => router.push(`/profile/${item.id}`)}
      activeOpacity={0.7}
    >
      <LinearGradient colors={['#7c3aed', '#4f46e5']} style={s.resultAvatar}>
        <Text style={s.resultAvatarText}>{item.display_name?.[0]?.toUpperCase() || '?'}</Text>
      </LinearGradient>
      <View style={s.resultContent}>
        <View style={s.resultNameRow}>
          <Text style={s.resultName}>{item.display_name}</Text>
          {item.is_verified && <Text style={s.verifiedBadge}>✓</Text>}
        </View>
        {item.username && <Text style={s.resultHandle}>@{item.username}</Text>}
        {item.bio && <Text style={s.resultBio} numberOfLines={1}>{item.bio}</Text>}
      </View>
      <TouchableOpacity style={s.addBtn} onPress={() => api.addContact({ user_id: item.id })}>
        <Text style={s.addBtnText}>Add</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderServerCard = ({ item }: { item: typeof FEATURED_SERVERS[0] }) => (
    <TouchableOpacity style={s.serverCard} onPress={() => {}} activeOpacity={0.7}>
      <View style={s.serverIcon}>
        <Text style={s.serverIconText}>{item.icon}</Text>
      </View>
      <View style={s.serverInfo}>
        <View style={s.serverNameRow}>
          <Text style={s.serverName} numberOfLines={1}>{item.name}</Text>
          {item.verified && <Text style={s.verifiedBadge}>✓</Text>}
        </View>
        <Text style={s.serverMeta}>{item.category} · {(item.members / 1000).toFixed(0)}K members</Text>
      </View>
      <TouchableOpacity style={s.joinBtn}>
        <Text style={s.joinBtnText}>Join</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.container}>
        {/* Header */}
        <LinearGradient colors={['#0d0d2b', '#05050f']} style={s.header}>
          <Text style={s.headerTitle}>Discover</Text>
          <Text style={s.headerSub}>Find people, groups & servers</Text>
        </LinearGradient>

        {/* Search Bar */}
        <View style={s.searchSection}>
          <View style={s.searchBar}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput
              ref={inputRef}
              style={s.searchInput}
              placeholder="Search people, groups, servers..."
              placeholderTextColor="#475569"
              value={query}
              onChangeText={setQuery}
              onFocus={focusSearch}
              onBlur={blurSearch}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(''); }} style={s.clearBtn}>
                <Text style={s.clearBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Search Results */}
        {query.length >= 2 ? (
          <View style={{ flex: 1 }}>
            {/* Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsRow} contentContainerStyle={s.tabsContent}>
              {(['all', 'people', 'groups', 'servers', 'messages'] as SearchTab[]).map(t => (
                <TouchableOpacity key={t} style={[s.tabChip, tab === t && s.tabChipActive]} onPress={() => setTab(t)}>
                  <Text style={[s.tabChipText, tab === t && s.tabChipTextActive]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {isSearching ? (
              <View style={s.loadingWrap}>
                <ActivityIndicator color="#7c3aed" size="large" />
                <Text style={s.loadingText}>Searching...</Text>
              </View>
            ) : searchResults?.users?.length ? (
              <FlatList
                data={searchResults.users}
                keyExtractor={i => i.id}
                renderItem={renderUserResult}
                contentContainerStyle={s.resultsList}
                showsVerticalScrollIndicator={false}
              />
            ) : (
              <View style={s.noResults}>
                <Text style={s.noResultsIcon}>🔍</Text>
                <Text style={s.noResultsTitle}>No results for "{query}"</Text>
                <Text style={s.noResultsSub}>Try a different search term</Text>
              </View>
            )}
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Trending */}
            <View style={s.discoverSection}>
              <Text style={s.discoverSectionTitle}>🔥 Trending</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.trendingRow}>
                {TRENDING_TOPICS.map(topic => (
                  <TouchableOpacity key={topic} style={s.trendingChip} onPress={() => setQuery(topic)}>
                    <Text style={s.trendingChipText}>{topic}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Categories */}
            <View style={s.discoverSection}>
              <Text style={s.discoverSectionTitle}>📂 Categories</Text>
              <View style={s.categoriesGrid}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity key={cat.id} style={[s.categoryCard, { borderColor: cat.color + '40' }]} onPress={() => setQuery(cat.label)}>
                    <LinearGradient colors={[cat.color + '20', cat.color + '08']} style={s.categoryGradient}>
                      <Text style={s.categoryIcon}>{cat.icon}</Text>
                      <Text style={s.categoryLabel}>{cat.label}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Featured Servers */}
            <View style={s.discoverSection}>
              <Text style={s.discoverSectionTitle}>🏰 Featured Servers</Text>
              <FlatList
                data={FEATURED_SERVERS}
                keyExtractor={i => i.id}
                renderItem={renderServerCard}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={s.separator} />}
              />
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05050f' },
  header: { paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16 },
  headerTitle: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { color: '#64748b', fontSize: 13, marginTop: 2 },
  searchSection: { padding: 16, paddingTop: 8 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d1f', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(124,58,237,0.2)', paddingHorizontal: 14, height: 48, gap: 10 },
  searchIcon: { fontSize: 18 },
  searchInput: { flex: 1, color: '#f8fafc', fontSize: 15 },
  clearBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  clearBtnText: { color: '#94a3b8', fontSize: 12 },
  tabsRow: { maxHeight: 44, marginBottom: 4 },
  tabsContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center', paddingVertical: 4 },
  tabChip: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  tabChipActive: { backgroundColor: 'rgba(124,58,237,0.2)', borderColor: 'rgba(124,58,237,0.5)' },
  tabChipText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  tabChipTextActive: { color: '#a78bfa' },
  resultsList: { padding: 16, gap: 8 },
  resultItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#0d0d1f', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(124,58,237,0.1)' },
  resultAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  resultAvatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  resultContent: { flex: 1 },
  resultNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultName: { color: '#f8fafc', fontSize: 15, fontWeight: '700' },
  verifiedBadge: { color: '#7c3aed', fontSize: 12 },
  resultHandle: { color: '#7c3aed', fontSize: 12, marginTop: 1 },
  resultBio: { color: '#64748b', fontSize: 12, marginTop: 2 },
  addBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100, backgroundColor: 'rgba(124,58,237,0.2)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.4)' },
  addBtnText: { color: '#a78bfa', fontSize: 13, fontWeight: '700' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#64748b', fontSize: 14 },
  noResults: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  noResultsIcon: { fontSize: 48, marginBottom: 4 },
  noResultsTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '700' },
  noResultsSub: { color: '#64748b', fontSize: 14 },
  discoverSection: { paddingHorizontal: 16, marginBottom: 28 },
  discoverSectionTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700', marginBottom: 14 },
  trendingRow: { gap: 8, paddingVertical: 4 },
  trendingChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 100, backgroundColor: 'rgba(124,58,237,0.12)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)' },
  trendingChipText: { color: '#a78bfa', fontSize: 14, fontWeight: '600' },
  categoriesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryCard: { width: '22%', borderRadius: 14, overflow: 'hidden', borderWidth: 1, flexGrow: 1 },
  categoryGradient: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20, gap: 6 },
  categoryIcon: { fontSize: 28 },
  categoryLabel: { color: '#f8fafc', fontSize: 12, fontWeight: '600' },
  serverCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#0d0d1f', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  serverIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(124,58,237,0.2)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  serverIconText: { fontSize: 22 },
  serverInfo: { flex: 1 },
  serverNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  serverName: { color: '#f8fafc', fontSize: 14, fontWeight: '700', flex: 1 },
  serverMeta: { color: '#64748b', fontSize: 12, marginTop: 2 },
  joinBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100, backgroundColor: 'rgba(124,58,237,0.2)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.4)' },
  joinBtnText: { color: '#a78bfa', fontSize: 13, fontWeight: '700' },
  separator: { height: 8 },
});
