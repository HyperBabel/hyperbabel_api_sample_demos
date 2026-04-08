/**
 * HyperBabel Demo — Stream Chat Overlay
 *
 * Live chat panel shown during a live stream for both host and viewer.
 * Uses the United Chat API (room-based) or a dedicated stream chat channel.
 * Messages float over the stream video in a semi-transparent list.
 *
 * Typically mounted as an overlay inside host.tsx and viewer/[sessionId].tsx.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import dayjs from 'dayjs';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/context/RealtimeContext';
import { colors, spacing, textPresets, borderRadius } from '@/theme';
import * as unitedChat from '@/services/unitedChatService';
import type { Message } from '@/services/unitedChatService';

interface StreamChatProps {
  /** The United Chat room ID that serves as the stream's chat room */
  chatRoomId: string;
}

export function StreamChat({ chatRoomId }: StreamChatProps) {
  const { user }           = useAuth();
  const { channelService } = useRealtime();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState('');
  const listRef = useRef<FlatList>(null);

  // Load recent messages
  useEffect(() => {
    unitedChat.getMessages(chatRoomId, { limit: 30 })
      .then(({ messages: m }) => setMessages([...(m ?? [])].reverse()))
      .catch(() => {});
  }, [chatRoomId]);

  // Real-time subscription
  useEffect(() => {
    if (!channelService) return;
    const unsub = channelService.subscribeToRoom(chatRoomId, ({ message }) => {
      const msg = message as Message;
      setMessages((prev) => {
        if (prev.some((m) => m.message_id === msg.message_id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    });
    return () => unsub();
  }, [channelService, chatRoomId]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !user) return;
    setInput('');
    try {
      const msg = await unitedChat.sendMessage(chatRoomId, { sender_id: user.userId, content: text });
      setMessages((prev) => {
        if (prev.some((m) => m.message_id === msg.message_id)) return prev;
        return [...prev, msg];
      });
    } catch { /* ignore */ }
  }, [input, user, chatRoomId]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.message_id}
        renderItem={({ item }) => (
          <View style={styles.msgRow}>
            <Text style={styles.sender} numberOfLines={1}>{item.sender_name ?? item.sender_id}</Text>
            <Text style={styles.content} numberOfLines={2}>{item.content}</Text>
          </View>
        )}
        contentContainerStyle={{ padding: spacing[3], gap: spacing[2] }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        style={styles.list}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Say something…"
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={input}
          onChangeText={setInput}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !input.trim() && { opacity: 0.4 }]}
          onPress={handleSend}
          disabled={!input.trim()}
        >
          <Text style={styles.sendIcon}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { width: 240, maxHeight: 320, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: borderRadius.xl, overflow: 'hidden' },
  list:      { flex: 1 },
  msgRow:    { gap: 2 },
  sender:    { ...textPresets.caption, color: colors.primaryLight, fontWeight: '700', fontSize: 11 },
  content:   { ...textPresets.caption, color: 'rgba(255,255,255,0.9)', fontSize: 12 },
  inputRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[3], paddingVertical: spacing[2], gap: spacing[2], borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  input:     { flex: 1, color: colors.white, fontSize: 12, paddingVertical: spacing[2] },
  sendBtn:   { width: 32, height: 32, backgroundColor: colors.primary, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sendIcon:  { color: colors.white, fontSize: 14, fontWeight: '700' },
});
