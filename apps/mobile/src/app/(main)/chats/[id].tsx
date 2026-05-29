// ============================================
// DL Chat Mobile - Chat View Screen
// THE MAIN CHAT UI - WhatsApp/Telegram style
// Real-time messaging with WebSocket
// ============================================
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
  Pressable,
  Animated,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useChatStore } from '../../../store/chats';
import { useAuthStore } from '../../../store/auth';
import { apiClient } from '../../../api/client';
import { COLORS, AVATAR_COLORS } from '../../../constants/theme';
import type { Message } from '../../../api/client';

// ─── Message Bubble ──────────────────────────────────────────────────────────
interface MsgBubbleProps {
  message: Message;
  isMine: boolean;
  showAvatar: boolean;
  onLongPress: (msg: Message) => void;
  onReact: (msgId: string, emoji: string) => void;
}

const MessageBubble = React.memo(
  ({ message, isMine, showAvatar, onLongPress, onReact }: MsgBubbleProps) => {
    const scaleAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();
    }, []);

    const timeStr = useMemo(() => {
      const d = new Date(message.created_at);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }, [message.created_at]);

    const avatarColor = AVATAR_COLORS[
      (message.sender_name?.charCodeAt(0) || 65) % AVATAR_COLORS.length
    ];

    return (
      <Animated.View
        style={[
          styles.messageRow,
          isMine && styles.messageRowMine,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        {/* Avatar (only for others, and only when sender changes) */}
        {!isMine && showAvatar ? (
          <View style={[styles.msgAvatar, { backgroundColor: avatarColor }]}>
            <Text style={styles.msgAvatarText}>
              {(message.sender_name?.[0] || '?').toUpperCase()}
            </Text>
          </View>
        ) : !isMine ? (
          <View style={styles.msgAvatarSpacer} />
        ) : null}

        {/* Bubble */}
        <Pressable
          style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}
          onLongPress={() => onLongPress(message)}
          delayLongPress={300}
        >
          {/* Sender name in group chats */}
          {!isMine && showAvatar && message.sender_name ? (
            <Text style={[styles.senderName, { color: avatarColor }]}>
              {message.sender_name}
            </Text>
          ) : null}

          {/* Reply reference */}
          {message.reply_to && (
            <View style={styles.replyContainer}>
              <View style={styles.replyBar} />
              <View style={styles.replyContent}>
                <Text style={styles.replyTo} numberOfLines={1}>
                  {message.reply_to_name || 'Message'}
                </Text>
                <Text style={styles.replyPreview} numberOfLines={1}>
                  {message.reply_to_content || '...'}
                </Text>
              </View>
            </View>
          )}

          {/* Message content based on type */}
          {message.message_type === 'text' || !message.message_type ? (
            <Text style={[styles.msgText, isMine && styles.msgTextMine]}>
              {message.content}
            </Text>
          ) : message.message_type === 'image' ? (
            <View style={styles.mediaContainer}>
              {message.media_url ? (
                <Image
                  source={{ uri: message.media_url }}
                  style={styles.mediaImage}
                  resizeMode="cover"
                />
              ) : null}
              {message.content ? (
                <Text style={[styles.msgText, isMine && styles.msgTextMine, styles.mediaCaption]}>
                  {message.content}
                </Text>
              ) : null}
            </View>
          ) : message.message_type === 'voice' ? (
            <View style={styles.voiceMessage}>
              <Text style={styles.voiceIcon}>🎤</Text>
              <View style={styles.voiceWaveform}>
                {Array(20).fill(0).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.voiceBar,
                      { height: 6 + Math.sin(i * 0.9) * 10 },
                      isMine && styles.voiceBarMine,
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.voiceDuration, isMine && styles.voiceDurationMine]}>
                {message.media_duration || '0:00'}
              </Text>
            </View>
          ) : message.message_type === 'file' ? (
            <TouchableOpacity style={styles.fileContainer}>
              <Text style={styles.fileIcon}>📄</Text>
              <View style={styles.fileInfo}>
                <Text style={[styles.fileName, isMine && styles.fileNameMine]} numberOfLines={1}>
                  {message.media_name || 'File'}
                </Text>
                <Text style={styles.fileSize}>
                  {message.media_size ? `${(message.media_size / 1024).toFixed(0)} KB` : ''}
                </Text>
              </View>
              <Text style={styles.downloadIcon}>⬇️</Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.msgText, isMine && styles.msgTextMine]}>
              {message.content}
            </Text>
          )}

          {/* Reactions */}
          {message.reactions && Object.keys(message.reactions).length > 0 ? (
            <View style={styles.reactionsRow}>
              {Object.entries(message.reactions).map(([emoji, users]) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.reactionChip}
                  onPress={() => onReact(message.id, emoji)}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                  <Text style={styles.reactionCount}>{(users as string[]).length}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {/* Timestamp + Read status */}
          <View style={styles.msgMeta}>
            {message.is_edited && (
              <Text style={[styles.metaText, isMine && styles.metaTextMine]}>edited </Text>
            )}
            <Text style={[styles.metaText, isMine && styles.metaTextMine]}>{timeStr}</Text>
            {isMine && (
              <Text style={styles.readStatus}>
                {message.is_read ? ' ✓✓' : message.is_delivered ? ' ✓' : ' ○'}
              </Text>
            )}
          </View>
        </Pressable>
      </Animated.View>
    );
  }
);

// ─── Main Chat Screen ─────────────────────────────────────────────────────────
export default function ChatScreen() {
  const { id: chatId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const { messages, addMessage, typingUsers, onlineUsers } = useChatStore();
  const queryClient = useQueryClient();

  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showActions, setShowActions] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTypingRef = useRef<(() => void) | null>(null);

  // ─── Fetch chat info ────────────────────────────────────────────────────────
  const { data: chatData, isLoading: chatLoading } = useQuery({
    queryKey: ['chat', chatId],
    queryFn: () => apiClient.getChat(chatId),
    enabled: !!chatId,
  });
  const chat = chatData?.data;

  // ─── Fetch messages ─────────────────────────────────────────────────────────
  const { data: msgsData, isLoading: msgsLoading, fetchNextPage, hasNextPage } = useQuery({
    queryKey: ['messages', chatId],
    queryFn: () => apiClient.getMessages(chatId, { limit: 50 }),
    enabled: !!chatId,
  });

  const chatMessages = messages[chatId] || msgsData?.data?.messages || [];

  // ─── Send message ───────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      apiClient.sendMessage(chatId, {
        content,
        message_type: 'text',
        reply_to: replyTo?.id,
      }),
    onMutate: async (content) => {
      // Optimistic update
      const tempMsg: Message = {
        id: `temp_${Date.now()}`,
        chat_id: chatId,
        sender_id: user?.id || '',
        sender_name: user?.name || '',
        content,
        message_type: 'text',
        reply_to: replyTo?.id,
        reply_to_name: replyTo?.sender_name,
        reply_to_content: replyTo?.content,
        is_read: false,
        is_delivered: false,
        is_edited: false,
        created_at: new Date().toISOString(),
        reactions: {},
      };
      addMessage(chatId, tempMsg);
      setReplyTo(null);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
    },
    onError: (err: any) => {
      Alert.alert('Failed to send', err?.message || 'Please try again.');
    },
  });

  // ─── React to message ───────────────────────────────────────────────────────
  const reactMutation = useMutation({
    mutationFn: ({ msgId, emoji }: { msgId: string; emoji: string }) =>
      apiClient.reactToMessage(chatId, msgId, emoji),
  });

  // ─── Send typing indicator ──────────────────────────────────────────────────
  function handleTyping() {
    if (!isTyping) {
      setIsTyping(true);
      // TODO: send typing event via WebSocket
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setIsTyping(false), 3000);
  }

  // ─── Handle send ────────────────────────────────────────────────────────────
  function handleSend() {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    sendMutation.mutate(text);
  }

  // ─── Mark as read on open ───────────────────────────────────────────────────
  useEffect(() => {
    if (chatId) {
      apiClient.markRead(chatId).catch(() => {});
    }
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [chatId]);

  // ─── Action sheet (long press) ───────────────────────────────────────────────
  function handleLongPress(msg: Message) {
    setSelectedMessage(msg);
    setShowActions(true);
  }

  function handleAction(action: string) {
    setShowActions(false);
    if (!selectedMessage) return;

    switch (action) {
      case 'reply':
        setReplyTo(selectedMessage);
        break;
      case 'copy':
        // Clipboard.setString(selectedMessage.content || '');
        break;
      case 'delete':
        Alert.alert('Delete Message', 'Delete this message?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => apiClient.deleteMessage(chatId, selectedMessage.id).then(() => {
              queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
            }),
          },
        ]);
        break;
      case 'star':
        apiClient.starMessage(chatId, selectedMessage.id).catch(() => {});
        break;
    }
    setSelectedMessage(null);
  }

  // ─── Render message item ────────────────────────────────────────────────────
  const renderMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isMine = item.sender_id === user?.id;
      const prevMsg = chatMessages[index - 1];
      const showAvatar = !prevMsg || prevMsg.sender_id !== item.sender_id;

      return (
        <MessageBubble
          message={item}
          isMine={isMine}
          showAvatar={showAvatar}
          onLongPress={handleLongPress}
          onReact={(msgId, emoji) => reactMutation.mutate({ msgId, emoji })}
        />
      );
    },
    [chatMessages, user?.id]
  );

  // ─── Typing indicator display ───────────────────────────────────────────────
  const chatTypingUsers = typingUsers[chatId] || [];
  const typingDisplay =
    chatTypingUsers.length === 1
      ? `${chatTypingUsers[0]} is typing...`
      : chatTypingUsers.length > 1
      ? `${chatTypingUsers.slice(0, 2).join(', ')} are typing...`
      : null;

  // ─── Header info ────────────────────────────────────────────────────────────
  const isOnline = chat?.type === 'direct' && onlineUsers.includes(chat?.other_user_id || '');
  const headerSubtitle = typingDisplay
    ? typingDisplay
    : chat?.type === 'group'
    ? `${chat?.member_count || 0} members`
    : isOnline
    ? 'Online'
    : 'Last seen recently';

  if (chatLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerInfo}
          onPress={() => router.push(`/chats/info/${chatId}` as any)}
        >
          <View style={[styles.headerAvatar, { backgroundColor: AVATAR_COLORS[0] }]}>
            {chat?.avatar_url ? (
              <Image source={{ uri: chat.avatar_url }} style={styles.headerAvatarImg} />
            ) : (
              <Text style={styles.headerAvatarText}>
                {(chat?.name?.[0] || '?').toUpperCase()}
              </Text>
            )}
            {isOnline && <View style={styles.onlineDot} />}
          </View>

          <View style={styles.headerText}>
            <Text style={styles.headerName} numberOfLines={1}>
              {chat?.name || 'Chat'}
            </Text>
            <Text
              style={[
                styles.headerSubtitle,
                typingDisplay && styles.headerSubtitleTyping,
              ]}
              numberOfLines={1}
            >
              {headerSubtitle}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push(`/calls/new?chatId=${chatId}` as any)}
          >
            <Text style={styles.headerBtnIcon}>📞</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push(`/calls/new?chatId=${chatId}&video=1` as any)}
          >
            <Text style={styles.headerBtnIcon}>📹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn}>
            <Text style={styles.headerBtnIcon}>⋯</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {msgsLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={chatMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            onEndReached={() => hasNextPage && fetchNextPage()}
            onEndReachedThreshold={0.3}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
            ListEmptyComponent={() => (
              <View style={styles.emptyMessages}>
                <Text style={styles.emptyIcon}>💬</Text>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptySubtitle}>
                  Start the conversation below!
                </Text>
              </View>
            )}
          />
        )}

        {/* Reply preview */}
        {replyTo && (
          <View style={styles.replyPreviewBar}>
            <View style={styles.replyPreviewContent}>
              <Text style={styles.replyPreviewTitle}>
                Replying to {replyTo.sender_name || 'Message'}
              </Text>
              <Text style={styles.replyPreviewText} numberOfLines={1}>
                {replyTo.content}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} style={styles.replyPreviewClose}>
              <Text style={styles.replyPreviewCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          {/* Attachment */}
          <TouchableOpacity style={styles.attachBtn}>
            <Text style={styles.attachIcon}>📎</Text>
          </TouchableOpacity>

          {/* Text input */}
          <TextInput
            style={styles.textInput}
            placeholder="Message..."
            placeholderTextColor="#555"
            value={inputText}
            onChangeText={(text) => {
              setInputText(text);
              if (text) handleTyping();
            }}
            multiline
            maxLength={4096}
            returnKeyType="default"
          />

          {/* Emoji */}
          <TouchableOpacity
            style={styles.emojiBtn}
            onPress={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            <Text style={styles.emojiIcon}>😊</Text>
          </TouchableOpacity>

          {/* Send / Voice */}
          {inputText.trim() ? (
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={handleSend}
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sendIcon}>▶</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.voiceBtn}>
              <Text style={styles.voiceBtnIcon}>🎤</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Simple emoji picker */}
        {showEmojiPicker && (
          <View style={styles.emojiPicker}>
            {['😀','😂','😍','🥺','😭','😎','🤔','👍','❤️','🔥','💯','✨','🎉','🙏','👀','😏'].map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.emojiOption}
                onPress={() => {
                  setInputText((t) => t + emoji);
                  setShowEmojiPicker(false);
                }}
              >
                <Text style={styles.emojiOptionText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Message action sheet */}
      {showActions && selectedMessage && (
        <Pressable style={styles.actionOverlay} onPress={() => setShowActions(false)}>
          <View style={styles.actionSheet}>
            <Text style={styles.actionPreview} numberOfLines={2}>
              {selectedMessage.content}
            </Text>

            {/* Quick reactions */}
            <View style={styles.quickReactions}>
              {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.quickReactionBtn}
                  onPress={() => {
                    reactMutation.mutate({ msgId: selectedMessage.id, emoji });
                    setShowActions(false);
                  }}
                >
                  <Text style={styles.quickReactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Actions */}
            {[
              { action: 'reply', label: 'Reply', icon: '↩️' },
              { action: 'copy', label: 'Copy', icon: '📋' },
              { action: 'star', label: 'Star', icon: '⭐' },
              { action: 'forward', label: 'Forward', icon: '↪️' },
              ...(selectedMessage.sender_id === user?.id
                ? [{ action: 'delete', label: 'Delete', icon: '🗑️' }]
                : []),
            ].map(({ action, label, icon }) => (
              <TouchableOpacity
                key={action}
                style={[styles.actionItem, action === 'delete' && styles.actionItemDelete]}
                onPress={() => handleAction(action)}
              >
                <Text style={styles.actionIcon}>{icon}</Text>
                <Text style={[styles.actionLabel, action === 'delete' && styles.actionLabelDelete]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ─── Header ───────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#151515',
    borderBottomWidth: 0.5,
    borderBottomColor: '#1e1e1e',
    gap: 4,
  },
  backBtn: {
    padding: 8,
    marginRight: 4,
  },
  backIcon: { color: '#6c63ff', fontSize: 28, fontWeight: '300', lineHeight: 28 },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  headerAvatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4ade80',
    borderWidth: 2,
    borderColor: '#151515',
  },
  headerText: { flex: 1 },
  headerName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  headerSubtitle: { color: '#a0a0a0', fontSize: 12, marginTop: 1 },
  headerSubtitleTyping: { color: '#6c63ff' },
  headerActions: { flexDirection: 'row', gap: 4 },
  headerBtn: { padding: 8 },
  headerBtnIcon: { fontSize: 20 },

  // ─── Messages ──────────────────────────────────────────────────────────────
  messagesList: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 2,
    flexGrow: 1,
  },
  emptyMessages: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  emptySubtitle: { color: '#a0a0a0', fontSize: 14 },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 2,
    alignItems: 'flex-end',
    gap: 8,
  },
  messageRowMine: { flexDirection: 'row-reverse' },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  msgAvatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  msgAvatarSpacer: { width: 28 },
  bubble: {
    maxWidth: '75%',
    borderRadius: 16,
    padding: 10,
    gap: 4,
  },
  bubbleOther: {
    backgroundColor: '#1e1e1e',
    borderBottomLeftRadius: 4,
  },
  bubbleMine: {
    backgroundColor: '#6c63ff',
    borderBottomRightRadius: 4,
  },
  senderName: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  msgText: { color: '#fff', fontSize: 15, lineHeight: 21 },
  msgTextMine: { color: '#fff' },
  msgMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 2,
    marginTop: 2,
  },
  metaText: { color: 'rgba(255,255,255,0.45)', fontSize: 10 },
  metaTextMine: { color: 'rgba(255,255,255,0.55)' },
  readStatus: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },

  // ─── Reply ─────────────────────────────────────────────────────────────────
  replyContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 4,
  },
  replyBar: { width: 3, backgroundColor: '#6c63ff' },
  replyContent: { padding: 6, flex: 1 },
  replyTo: { color: '#6c63ff', fontSize: 11, fontWeight: '700' },
  replyPreview: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },

  // ─── Reactions ─────────────────────────────────────────────────────────────
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { color: '#fff', fontSize: 11, fontWeight: '600' },

  // ─── Media ─────────────────────────────────────────────────────────────────
  mediaContainer: { gap: 6 },
  mediaImage: { width: 220, height: 180, borderRadius: 10 },
  mediaCaption: { fontSize: 13 },
  voiceMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  voiceIcon: { fontSize: 18 },
  voiceWaveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 24,
  },
  voiceBar: {
    width: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 2,
  },
  voiceBarMine: { backgroundColor: 'rgba(255,255,255,0.7)' },
  voiceDuration: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },
  voiceDurationMine: { color: 'rgba(255,255,255,0.8)' },
  fileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 4,
  },
  fileIcon: { fontSize: 24 },
  fileInfo: { flex: 1 },
  fileName: { color: '#fff', fontSize: 13, fontWeight: '600' },
  fileNameMine: { color: '#fff' },
  fileSize: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  downloadIcon: { fontSize: 16 },

  // ─── Input Bar ─────────────────────────────────────────────────────────────
  replyPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderTopWidth: 1,
    borderTopColor: '#2a2a3a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
  },
  replyPreviewContent: { flex: 1 },
  replyPreviewTitle: { color: '#6c63ff', fontSize: 12, fontWeight: '700' },
  replyPreviewText: { color: '#a0a0a0', fontSize: 12 },
  replyPreviewClose: { padding: 4 },
  replyPreviewCloseText: { color: '#a0a0a0', fontSize: 16 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    backgroundColor: '#151515',
    borderTopWidth: 0.5,
    borderTopColor: '#1e1e1e',
    gap: 8,
  },
  attachBtn: {
    padding: 8,
    alignSelf: 'flex-end',
  },
  attachIcon: { fontSize: 22 },
  textInput: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
    maxHeight: 120,
    lineHeight: 20,
  },
  emojiBtn: {
    padding: 8,
    alignSelf: 'flex-end',
  },
  emojiIcon: { fontSize: 22 },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#6c63ff',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  sendIcon: { color: '#fff', fontSize: 16, fontWeight: '700', marginLeft: 2 },
  voiceBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#6c63ff',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  voiceBtnIcon: { fontSize: 20 },

  // ─── Emoji Picker ──────────────────────────────────────────────────────────
  emojiPicker: {
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
    gap: 4,
  },
  emojiOption: { padding: 8 },
  emojiOptionText: { fontSize: 24 },

  // ─── Action Sheet ──────────────────────────────────────────────────────────
  actionOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    overflow: 'hidden',
  },
  actionPreview: {
    color: '#a0a0a0',
    fontSize: 13,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2a2a2a',
    fontStyle: 'italic',
  },
  quickReactions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2a2a2a',
  },
  quickReactionBtn: { padding: 8 },
  quickReactionEmoji: { fontSize: 28 },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1e1e1e',
  },
  actionItemDelete: { },
  actionIcon: { fontSize: 22 },
  actionLabel: { color: '#fff', fontSize: 15, fontWeight: '500' },
  actionLabelDelete: { color: '#e53e3e' },
});
