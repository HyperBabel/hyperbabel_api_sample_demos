/**
 * HyperBabel Demo — In-Call Chat Overlay
 *
 * Semi-transparent slide-up chat panel shown during a video call.
 * Loads messages from the room and allows sending while the call is active.
 * Displayed over the VideoCallScreen.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, Animated, Keyboard, KeyboardAvoidingView, Platform,
} from 'react-native';
import dayjs from 'dayjs';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/context/RealtimeContext';
import { colors, spacing, textPresets, borderRadius } from '@/theme';
import * as unitedChat from '@/services/unitedChatService';
import type { Message } from '@/services/unitedChatService';

interface InCallChatProps {
  roomId:   string;
  visible:  boolean;
  onClose:  () => void;
}

export function InCallChat({ roomId, visible, onClose }: InCallChatProps) {
  const { user }            = useAuth();
  const { channelService }  = useRealtime();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState('');
  const [sending,  setSending]  = useState(false);
  const slideAnim = useRef(new Animated.Value(300)).current;
  const listRef   = useRef<FlatList>(null);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue:         visible ? 0 : 300,
      duration:        280,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  // Load recent messages
  useEffect(() => {
    if (!visible) return;
    unitedChat.getMessages(roomId, { limit: 20 })
      .then(({ messages: m }) => setMessages([...(m ?? [])].reverse()))
      .catch(() => {});
  }, [visible, roomId]);

  // Real-time subscription
  useEffect(() => {
    if (!channelService || !visible) return;
    const unsub = channelService.subscribeToRoom(roomId, ({ message }) => {
      const msg = message as Message;
      setMessages((prev) => {
        if (prev.some((m) => m.message_id === msg.message_id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    });
    return () => unsub();
  }, [channelService, roomId, visible]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !user) return;
    setInput('');
    setSending(true);
    try {
      const msg = await unitedChat.sendMessage(roomId, { sender_id: user.userId, content: text });
      setMessages((prev) => {
        if (prev.some((m) => m.message_id === msg.message_id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } finally {
      setSending(false);
    }
  }, [input, user, roomId]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      <KeyboardAvoidingView style={styles.inner} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>💬 In-Call Chat</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.close}>✕</Text></TouchableOpacity>
        </View>

        {/* Messages */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.message_id}
          renderItem={({ item }) => {
            const isSelf = item.sender_id === user?.userId;
            return (
              <View style={[styles.msgRow, isSelf && styles.msgRowSelf]}>
                {!isSelf && <Text style={styles.sender}>{item.sender_name ?? item.sender_id}: </Text>}
                <Text style={styles.msgText}>{item.content}</Text>
                <Text style={styles.msgTime}>{dayjs(item.created_at).format('HH:mm')}</Text>
              </View>
            );
          }}
          contentContainerStyle={{ padding: spacing[3], gap: spacing[2] }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Message…"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={input}
            onChangeText={setInput}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !input.trim() && { opacity: 0.4 }]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 340, backgroundColor: 'rgba(10,10,15,0.92)', borderTopLeftRadius: borderRadius['2xl'], borderTopRightRadius: borderRadius['2xl'], borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  inner:     { flex: 1 },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[5], paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  title:     { ...textPresets.label, color: colors.white, fontWeight: '700' },
  close:     { color: 'rgba(255,255,255,0.5)', fontSize: 18 },
  msgRow:    { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 },
  msgRowSelf:{ flexDirection: 'row-reverse' },
  sender:    { ...textPresets.caption, color: colors.primaryLight, fontWeight: '700' },
  msgText:   { ...textPresets.caption, color: 'rgba(255,255,255,0.9)' },
  msgTime:   { ...textPresets.caption, color: 'rgba(255,255,255,0.3)', fontSize: 10 },
  inputRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[4], paddingVertical: spacing[3], gap: spacing[3], borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  input:     { flex: 1, ...textPresets.body, color: colors.white, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: borderRadius.xl, paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  sendBtn:   { width: 40, height: 40, backgroundColor: colors.primary, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sendIcon:  { color: colors.white, fontSize: 18, fontWeight: '700' },
});
