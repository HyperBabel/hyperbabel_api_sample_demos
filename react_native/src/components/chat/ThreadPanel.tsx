/**
 * HyperBabel Demo — ThreadPanel Component
 *
 * Bottom sheet showing a parent message and its thread replies.
 * Allows users to send new replies in the thread context.
 *
 * Architecture:
 *  - Loads thread replies from chatService.getThreadReplies()
 *  - Real-time thread updates come through room channel subscription
 *    (message events with reply_to === parentMessage.message_id)
 *  - Sends via chatService.sendThreadReply()
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, Modal, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, SafeAreaView,
} from 'react-native';
import dayjs from 'dayjs';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, textPresets, borderRadius } from '@/theme';
import { getThreadReplies, sendThreadReply } from '@/services/chatService';
import type { ChatMessage } from '@/services/chatService';
import type { Message } from '@/services/unitedChatService';

interface ThreadPanelProps {
  visible:       boolean;
  parentMessage: Message | null;
  currentUserId: string;
  roomId:        string;
  onClose:       () => void;
}

export function ThreadPanel({
  visible, parentMessage, currentUserId, roomId, onClose,
}: ThreadPanelProps) {
  const [replies,   setReplies]  = useState<ChatMessage[]>([]);
  const [loading,   setLoading]  = useState(false);
  const [inputText, setInput]    = useState('');
  const [sending,   setSending]  = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!visible || !parentMessage) return;
    setLoading(true);
    getThreadReplies(roomId, parentMessage.message_id)
      .then(({ replies: r }) => setReplies(r))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, parentMessage, roomId]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !parentMessage) return;
    setInput('');
    setSending(true);
    try {
      const reply = await sendThreadReply(roomId, parentMessage.message_id, {
        sender_id: currentUserId,
        content:   text,
      });
      setReplies((prev) => [...prev, reply]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch { /* ignore */ } finally {
      setSending(false);
    }
  };

  if (!parentMessage) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheet}>
        <SafeAreaView style={styles.inner}>
          {/* Handle */}
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Thread · {replies.length} {replies.length === 1 ? 'reply' : 'replies'}</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.closeBtn}>✕</Text></TouchableOpacity>
          </View>

          {/* Parent message */}
          <View style={styles.parentWrap}>
            <View style={styles.parentAccent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.parentSender}>{parentMessage.sender_name ?? parentMessage.sender_id}</Text>
              <Text style={styles.parentContent} numberOfLines={3}>{parentMessage.content}</Text>
            </View>
          </View>

          {/* Thread replies */}
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ margin: spacing[8] }} />
          ) : (
            <FlatList
              ref={listRef}
              data={replies}
              keyExtractor={(r) => r.message_id}
              renderItem={({ item }) => (
                <View style={styles.replyRow}>
                  <Avatar name={item.sender_name ?? item.sender_id} size={32} />
                  <View style={styles.replyBody}>
                    <View style={styles.replyHeader}>
                      <Text style={styles.replySender}>{item.sender_name ?? item.sender_id}</Text>
                      <Text style={styles.replyTime}>{dayjs(item.created_at).format('HH:mm')}</Text>
                    </View>
                    <Text style={styles.replyContent}>{item.content}</Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.empty}>No replies yet. Be the first!</Text>
              }
              contentContainerStyle={styles.replyList}
            />
          )}

          {/* Input */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Reply in thread…"
              placeholderTextColor={colors.textMuted}
              value={inputText}
              onChangeText={setInput}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim() || sending}
            >
              {sending
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Text style={styles.sendIcon}>↑</Text>
              }
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:         { backgroundColor: colors.background, borderTopLeftRadius: borderRadius['2xl'], borderTopRightRadius: borderRadius['2xl'], maxHeight: '80%' },
  inner:         { flex: 1 },
  handle:        { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginTop: spacing[3] },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[5], paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.border },
  title:         { ...textPresets.label, color: colors.text, fontWeight: '700' },
  closeBtn:      { color: colors.textMuted, fontSize: 18 },

  parentWrap:    { flexDirection: 'row', gap: spacing[3], padding: spacing[5], backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  parentAccent:  { width: 3, backgroundColor: colors.primary, borderRadius: 2 },
  parentSender:  { ...textPresets.caption, color: colors.primary, fontWeight: '700', marginBottom: 2 },
  parentContent: { ...textPresets.label, color: colors.textSecondary },

  replyList:     { padding: spacing[5], gap: spacing[4] },
  replyRow:      { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' },
  replyBody:     { flex: 1 },
  replyHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  replySender:   { ...textPresets.caption, color: colors.primaryLight, fontWeight: '700' },
  replyTime:     { ...textPresets.caption, color: colors.textMuted, fontSize: 10 },
  replyContent:  { ...textPresets.body, color: colors.text },
  empty:         { ...textPresets.label, color: colors.textMuted, textAlign: 'center', padding: spacing[8] },

  inputRow:      { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3], borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  input:         { flex: 1, ...textPresets.body, color: colors.text, maxHeight: 100, backgroundColor: colors.card, borderRadius: borderRadius.xl, paddingHorizontal: spacing[4], paddingVertical: spacing[3], borderWidth: 1, borderColor: colors.border },
  sendBtn:       { width: 44, height: 44, backgroundColor: colors.primary, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled:{ opacity: 0.4 },
  sendIcon:      { color: colors.white, fontSize: 20, fontWeight: '700' },
});
