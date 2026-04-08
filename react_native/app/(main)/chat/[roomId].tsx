/**
 * HyperBabel Demo — Chat Room Detail Screen (Enhanced)
 *
 * Full-featured real-time chat with:
 *  - Message history (paginated, reverse-scroll FlatList)
 *  - Real-time subscription (messages, typing, read receipts)
 *  - Send text (multi-line input)
 *  - Long-press menu: Reply, React, Delete, Thread
 *  - ReactionPicker (emoji reactions via chatService)
 *  - ThreadPanel (replies)
 *  - PinBanner (tap to show pinned, owner can unpin)
 *  - MembersSheet (role management)
 *  - Typing indicator
 *  - Mark as read on focus
 *  - Auto-translation (useTranslation hook)
 *  - Start Video Call
 *  - File attachment (image picker → storageService presign upload)
 *
 * Route: app/(main)/chat/[roomId].tsx
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  TouchableWithoutFeedback, StyleSheet, SafeAreaView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import dayjs from 'dayjs';

import { useAuth }       from '@/context/AuthContext';
import { useRealtime }   from '@/context/RealtimeContext';
import { useTranslation }from '@/hooks/useTranslation';
import { useHaptic }     from '@/hooks/useHaptic';
import { Avatar }        from '@/components/ui/Avatar';
import { PinBanner }     from '@/components/chat/PinBanner';
import { ReactionPicker }from '@/components/chat/ReactionPicker';
import { ThreadPanel }   from '@/components/chat/ThreadPanel';
import { MembersSheet }  from '@/components/chat/MembersSheet';
import { colors, spacing, textPresets, borderRadius } from '@/theme';
import * as unitedChat   from '@/services/unitedChatService';
import * as chatService  from '@/services/chatService';
import { uploadFile }    from '@/services/storageService';
import type { Message, Room, RoomMember } from '@/services/unitedChatService';

// ── Message bubble ──────────────────────────────────────────────────────────

interface BubbleProps {
  msg:           Message;
  isSelf:        boolean;
  translated?:   string;
  onDelete:      () => void;
  onReply:       () => void;
  onOpenThread:  () => void;
  onReact:       () => void;
}

function MessageBubble({ msg, isSelf, translated, onDelete, onReply, onOpenThread, onReact }: BubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isDeleted = !!msg.deleted_at;

  return (
    <View style={[styles.bubbleWrap, isSelf && styles.bubbleWrapSelf]}>
      {!isSelf && <Avatar name={msg.sender_name ?? msg.sender_id} size={28} />}

      <TouchableWithoutFeedback
        onLongPress={() => { if (!isDeleted) { setMenuOpen(true); } }}
        onPress={() => menuOpen && setMenuOpen(false)}
      >
        <View style={[styles.bubble, isSelf ? styles.bubbleSelf : styles.bubbleOther]}>
          {!isSelf && !isDeleted && (
            <Text style={styles.bubbleSender}>{msg.sender_name ?? msg.sender_id}</Text>
          )}

          {/* Reply quote */}
          {msg.reply_to && !isDeleted && (
            <View style={styles.replyQuote}>
              <Text style={styles.replyQuoteText} numberOfLines={1}>↩ Replying…</Text>
            </View>
          )}

          {isDeleted ? (
            <Text style={styles.deletedText}>This message was deleted.</Text>
          ) : msg.message_type === 'image' ? (
            <Text style={styles.fileMsg}>🖼 Image</Text>
          ) : msg.message_type === 'file' ? (
            <Text style={styles.fileMsg}>📎 File</Text>
          ) : (
            <Text style={styles.bubbleText}>{msg.content}</Text>
          )}

          {/* Translation */}
          {translated && translated !== msg.content && !isDeleted && (
            <Text style={styles.translatedText}>🌐 {translated}</Text>
          )}

          {/* Reactions row */}
          {msg.reactions && msg.reactions.length > 0 && (
            <View style={styles.reactionsRow}>
              {msg.reactions.map((r, i) => (
                <View key={i} style={styles.reactionChip}>
                  <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                  {r.count && r.count > 1 && <Text style={styles.reactionCount}>{r.count}</Text>}
                </View>
              ))}
            </View>
          )}

          {/* Thread count */}
          {msg.reply_count && msg.reply_count > 0 && (
            <TouchableOpacity onPress={onOpenThread} style={styles.threadHint}>
              <Text style={styles.threadHintText}>↩ {msg.reply_count} replies</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.bubbleTime}>{dayjs(msg.created_at).format('HH:mm')}</Text>
        </View>
      </TouchableWithoutFeedback>

      {/* Long-press context menu */}
      {menuOpen && (
        <View style={[styles.msgMenu, isSelf && styles.msgMenuSelf]}>
          <TouchableOpacity style={styles.menuItem} onPress={() => { onReply(); setMenuOpen(false); }}>
            <Text style={styles.menuItemText}>↩ Reply</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => { onReact(); setMenuOpen(false); }}>
            <Text style={styles.menuItemText}>😊 React</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => { onOpenThread(); setMenuOpen(false); }}>
            <Text style={styles.menuItemText}>🧵 Thread</Text>
          </TouchableOpacity>
          {isSelf && (
            <TouchableOpacity style={styles.menuItem} onPress={() => { onDelete(); setMenuOpen(false); }}>
              <Text style={[styles.menuItemText, { color: colors.error }]}>🗑 Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────

export default function ChatRoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { user }   = useAuth();
  const { channelService } = useRealtime();
  const { translatedMap, translateMessages } = useTranslation(roomId ?? '', user?.langCode);
  const haptic  = useHaptic();

  const [room,           setRoom]       = useState<Room | null>(null);
  const [messages,       setMessages]   = useState<Message[]>([]);
  const [inputText,      setInputText]  = useState('');
  const [loading,        setLoading]    = useState(true);
  const [sending,        setSending]    = useState(false);
  const [loadingMore,    setLoadingMore]= useState(false);
  const [nextCursor,     setNextCursor] = useState<string | null>(null);
  const [typing,         setTyping]     = useState<string | null>(null);
  const [replyTo,        setReplyTo]    = useState<Message | null>(null);
  const [threadMsg,      setThreadMsg]  = useState<Message | null>(null);
  const [reactTarget,    setReactTarget]= useState<Message | null>(null);
  const [showMembers,    setShowMembers]= useState(false);
  const [uploading,      setUploading]  = useState(false);

  const flatRef        = useRef<FlatList>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingAt   = useRef(0);

  // Current user's role in the room
  const myRole = room?.members?.find((m: RoomMember) => m.user_id === user?.userId)?.role ?? 'member';

  // ── Load data ─────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!roomId) return;
    const [r, m] = await Promise.all([
      unitedChat.getRoom(roomId),
      unitedChat.getMessages(roomId, { limit: 30 }),
    ]);
    setRoom(r);
    const msgs = [...(m.messages ?? [])].reverse();
    setMessages(msgs);
    setNextCursor(m.next_cursor ?? null);
    // Trigger translation in background
    translateMessages(msgs.map((x) => x.message_id));
  }, [roomId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Mark as read on mount
  useEffect(() => {
    if (roomId && user) unitedChat.markAsRead(roomId, user.userId).catch(() => {});
  }, [roomId, user]);

  // ── Real-time subscription ────────────────────────────────────────────────

  useEffect(() => {
    if (!channelService || !roomId || !user) return;

    const unsubRoom = channelService.subscribeToRoom(roomId, ({ message, type }) => {
      const msg = message as Message;
      if (type === 'message' || !type) {
        if (!msg || !msg.message_id || !msg.created_at) return;
        setMessages((prev) => {
          if (prev.some((m) => m.message_id === msg.message_id)) return prev;
          const next = [...prev, msg];
          translateMessages([msg.message_id]);
          return next;
        });
        unitedChat.markAsRead(roomId, user.userId).catch(() => {});
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
      } else if (type === 'message_deleted') {
        setMessages((prev) =>
          prev.map((m) => m.message_id === msg.message_id ? { ...m, deleted_at: new Date().toISOString() } : m),
        );
      }
    });

    const unsubTyping = channelService.subscribeToTyping(roomId, ({ user_id, is_typing }) => {
      if (user_id === user.userId) return;
      setTyping(is_typing ? user_id : null);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (is_typing) typingTimerRef.current = setTimeout(() => setTyping(null), 4000);
    });

    return () => { unsubRoom(); unsubTyping(); if (typingTimerRef.current) clearTimeout(typingTimerRef.current); };
  }, [channelService, roomId, user]);

  // ── Pagination ────────────────────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || !roomId) return;
    setLoadingMore(true);
    try {
      const data = await unitedChat.getMessages(roomId, { cursor: nextCursor, limit: 30 });
      const older = [...(data.messages ?? [])].reverse();
      setMessages((prev) => [...older, ...prev]);
      setNextCursor(data.next_cursor ?? null);
      translateMessages(older.map((x) => x.message_id));
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, roomId]);

  // ── Send ──────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !user || !roomId) return;
    setInputText('');
    setReplyTo(null);
    setSending(true);
    try {
      const msg = await unitedChat.sendMessage(roomId, {
        sender_id: user.userId,
        content:   text,
        ...(replyTo ? { reply_to: replyTo.message_id } : {}),
      });
      setMessages((prev) => {
        if (prev.some((m) => m.message_id === msg.message_id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 60);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to send.');
    } finally {
      setSending(false);
    }
  };

  // ── Typing ────────────────────────────────────────────────────────────────

  const handleInputChange = (text: string) => {
    setInputText(text);
    if (!user || !roomId) return;
    const now = Date.now();
    if (now - lastTypingAt.current > 1000) {
      lastTypingAt.current = now;
      unitedChat.sendTypingIndicator(roomId, user.userId, user.userName).catch(() => {});
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = (msg: Message) => {
    Alert.alert('Delete', 'Delete this message?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        if (!user || !roomId) return;
        await unitedChat.deleteMessage(roomId, msg.message_id, user.userId);
        setMessages((prev) =>
          prev.map((m) => m.message_id === msg.message_id ? { ...m, deleted_at: new Date().toISOString() } : m),
        );
      }},
    ]);
  };

  // ── Reaction ──────────────────────────────────────────────────────────────

  const handleReaction = async (emoji: string) => {
    if (!reactTarget || !user || !roomId) return;
    try {
      await chatService.addReaction(roomId, reactTarget.message_id, user.userId, emoji);
      haptic.light();
      // Optimistically update reactions
      setMessages((prev) => prev.map((m) => {
        if (m.message_id !== reactTarget.message_id) return m;
        const existing = m.reactions ?? [];
        const idx = existing.findIndex((r) => r.emoji === emoji);
        if (idx >= 0) {
          const updated = [...existing];
          updated[idx] = { ...updated[idx], count: (updated[idx].count ?? 1) + 1 };
          return { ...m, reactions: updated };
        }
        return { ...m, reactions: [...existing, { emoji, user_id: user.userId, count: 1 }] };
      }));
    } catch { /* ignore */ }
    setReactTarget(null);
  };

  // ── File upload ───────────────────────────────────────────────────────────

  const handleAttach = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality:    0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (!user || !roomId) return;

    setUploading(true);
    try {
      const filename = asset.fileName ?? `photo_${Date.now()}.jpg`;
      const mimeType = asset.mimeType ?? 'image/jpeg';
      const fileSize = asset.fileSize ?? 0;
      const confirmed = await uploadFile({ uri: asset.uri, filename, mimeType, fileSize });

      await unitedChat.sendMessage(roomId, {
        sender_id:    user.userId,
        content:      confirmed.cdn_url,
        message_type: 'image',
        metadata:     { cdn_url: confirmed.cdn_url, filename },
      });
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message ?? 'Could not upload file.');
    } finally {
      setUploading(false);
    }
  };

  // ── Video call ────────────────────────────────────────────────────────────

  const handleStartCall = async () => {
    if (!user || !roomId) return;
    try {
      await unitedChat.startVideoCall(roomId, user.userId);
      router.push({ pathname: '/video-call/[roomId]', params: { roomId } });
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to start call.');
    }
  };

  // ── Room freeze/unfreeze helpers ──────────────────────────────────────────

  const handleToggleFreeze = async () => {
    if (!user || !roomId) return;
    try {
      if (room?.is_frozen) {
        await unitedChat.unfreezeRoom(roomId, user.userId);
        setRoom((r) => r ? { ...r, is_frozen: false } : r);
      } else {
        await unitedChat.freezeRoom(roomId, user.userId);
        setRoom((r) => r ? { ...r, is_frozen: true } : r);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const displayName = room?.room_name ?? room?.members?.[0]?.user_name ?? roomId;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerName} numberOfLines={1}>{displayName}</Text>
            {room?.is_frozen && <Text style={styles.frozenBadge}>🔒 Frozen</Text>}
          </View>
          <TouchableOpacity onPress={handleStartCall} style={styles.headerAction}>
            <Text style={styles.headerActionIcon}>📹</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowMembers(true)} style={styles.headerAction}>
            <Text style={styles.headerActionIcon}>👥</Text>
          </TouchableOpacity>
          {(myRole === 'owner' || myRole === 'sub_admin') && (
            <TouchableOpacity onPress={handleToggleFreeze} style={styles.headerAction}>
              <Text style={styles.headerActionIcon}>{room?.is_frozen ? '🔓' : '🔒'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Pin banner */}
        {room?.pinned_message && (
          <PinBanner
            message={room.pinned_message}
            showUnpin={myRole === 'owner' || myRole === 'sub_admin'}
            onUnpin={async () => {
              if (!user) return;
              await unitedChat.unpinMessage(roomId, user.userId);
              setRoom((r) => r ? { ...r, pinned_message: undefined } : r);
            }}
          />
        )}

        {/* Message list */}
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.message_id}
          renderItem={({ item }) => (
            item.message_type === 'system' ? (
              item.content ? (
                <View style={{ alignItems: 'center', marginVertical: spacing[2] }}>
                  <Text style={{ backgroundColor: colors.cardElevated, paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: 12, ...textPresets.caption, color: colors.textMuted }}>
                    {item.content}
                  </Text>
                </View>
              ) : null
            ) : (
            <MessageBubble
              msg={item}
              isSelf={item.sender_id === user?.userId}
              translated={translatedMap[item.message_id]}
              onDelete={() => handleDelete(item)}
              onReply={() => setReplyTo(item)}
              onOpenThread={() => setThreadMsg(item)}
              onReact={() => setReactTarget(item)}
            />
            )
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.2}
          ListHeaderComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ margin: spacing[4] }} /> : null}
          contentContainerStyle={styles.msgList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Typing indicator */}
        {typing && (
          <View style={styles.typingRow}>
            <Text style={styles.typingText}>{typing} is typing…</Text>
          </View>
        )}

        {/* Reply banner */}
        {replyTo && (
          <View style={styles.replyRow}>
            <Text style={styles.replyRowText} numberOfLines={1}>↩  {replyTo.content}</Text>
            <TouchableOpacity onPress={() => setReplyTo(null)}><Text style={styles.replyRowClose}>✕</Text></TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          {!room?.is_frozen && (
            <TouchableOpacity onPress={handleAttach} style={styles.attachBtn} disabled={uploading}>
              <Text style={styles.attachIcon}>{uploading ? '⏳' : '📎'}</Text>
            </TouchableOpacity>
          )}
          <TextInput
            style={styles.input}
            placeholder={room?.is_frozen ? '🔒 Room is frozen' : 'Message…'}
            placeholderTextColor={colors.textMuted}
            value={inputText}
            onChangeText={handleInputChange}
            multiline
            maxLength={2000}
            editable={!room?.is_frozen}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            {sending
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={styles.sendIcon}>↑</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Thread panel */}
      <ThreadPanel
        visible={!!threadMsg}
        parentMessage={threadMsg}
        currentUserId={user?.userId ?? ''}
        roomId={roomId ?? ''}
        onClose={() => setThreadMsg(null)}
      />

      {/* Reaction picker */}
      <ReactionPicker
        visible={!!reactTarget}
        onSelect={handleReaction}
        onClose={() => setReactTarget(null)}
      />

      {/* Members sheet */}
      <MembersSheet
        visible={showMembers}
        roomId={roomId ?? ''}
        currentUserId={user?.userId ?? ''}
        currentRole={myRole as any}
        onClose={() => setShowMembers(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: colors.background },
  flex:          { flex: 1 },

  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[3], paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing[2] },
  backBtn:       { padding: spacing[2] },
  backIcon:      { fontSize: 22, color: colors.primary },
  headerInfo:    { flex: 1 },
  headerName:    { ...textPresets.label, color: colors.text, fontWeight: '700' },
  frozenBadge:   { ...textPresets.caption, color: colors.info },
  headerAction:  { padding: spacing[2] },
  headerActionIcon: { fontSize: 20 },

  msgList:       { paddingHorizontal: spacing[4], paddingVertical: spacing[4] },

  bubbleWrap:    { flexDirection: 'row', alignItems: 'flex-end', marginBottom: spacing[3], gap: spacing[2] },
  bubbleWrapSelf:{ flexDirection: 'row-reverse' },
  bubble:        { maxWidth: '78%', padding: spacing[3], borderRadius: borderRadius.xl, gap: 3 },
  bubbleSelf:    { backgroundColor: colors.bubbleSent, borderBottomRightRadius: spacing[1] },
  bubbleOther:   { backgroundColor: colors.bubbleReceived, borderBottomLeftRadius: spacing[1], borderWidth: 1, borderColor: colors.border },
  bubbleSender:  { ...textPresets.caption, color: colors.primaryLight, fontWeight: '700', marginBottom: 2 },
  bubbleText:    { ...textPresets.body, color: colors.text },
  deletedText:   { ...textPresets.body, color: colors.textMuted, fontStyle: 'italic' },
  fileMsg:       { ...textPresets.body, color: colors.primary },
  translatedText:{ ...textPresets.caption, color: colors.textMuted, marginTop: spacing[1] },
  bubbleTime:    { ...textPresets.caption, color: 'rgba(255,255,255,0.4)', alignSelf: 'flex-end', fontSize: 10 },

  replyQuote:    { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: borderRadius.sm, padding: spacing[2], marginBottom: spacing[1] },
  replyQuoteText:{ ...textPresets.caption, color: colors.textMuted },

  reactionsRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], marginTop: spacing[1] },
  reactionChip:  { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: borderRadius.full, paddingHorizontal: spacing[2], paddingVertical: 2, gap: 2 },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { ...textPresets.caption, color: colors.textSecondary, fontSize: 11 },

  threadHint:    { marginTop: spacing[1] },
  threadHintText:{ ...textPresets.caption, color: colors.primary, fontWeight: '600' },

  msgMenu:       { position: 'absolute', top: -52, left: 0, backgroundColor: colors.cardElevated, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', overflow: 'hidden', zIndex: 100 },
  msgMenuSelf:   { left: 'auto', right: 0 },
  menuItem:      { paddingHorizontal: spacing[3], paddingVertical: spacing[3] },
  menuItemText:  { ...textPresets.caption, color: colors.text, fontWeight: '600' },

  typingRow:     { paddingHorizontal: spacing[5], paddingVertical: spacing[2] },
  typingText:    { ...textPresets.caption, color: colors.textMuted, fontStyle: 'italic' },

  replyRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[5], paddingVertical: spacing[3], backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing[3] },
  replyRowText:  { ...textPresets.caption, color: colors.textSecondary, flex: 1 },
  replyRowClose: { color: colors.textMuted, fontSize: 16 },

  inputBar:      { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: spacing[3], paddingVertical: spacing[3], borderTopWidth: 1, borderTopColor: colors.border, gap: spacing[3], backgroundColor: colors.surface },
  attachBtn:     { padding: spacing[2] },
  attachIcon:    { fontSize: 22 },
  input:         { flex: 1, ...textPresets.body, color: colors.text, maxHeight: 120, backgroundColor: colors.card, borderRadius: borderRadius.xl, paddingHorizontal: spacing[4], paddingVertical: spacing[3], borderWidth: 1, borderColor: colors.border },
  sendBtn:       { width: 44, height: 44, backgroundColor: colors.primary, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled:{ opacity: 0.4 },
  sendIcon:      { color: colors.white, fontSize: 20, fontWeight: '700' },
});
