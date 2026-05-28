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
  Modal, ScrollView, Linking,
} from 'react-native';
import * as ImagePicker    from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location       from 'expo-location';
import {
  AudioModule,
  useAudioPlayer,
  useAudioRecorder,
  RecordingPresets,
  type AudioRecorder,
} from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
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

// ── Media bubbles ───────────────────────────────────────────────────────────

/**
 * Inline video player. expo-video's `useVideoPlayer` keeps a single native
 * player per component instance; nativeControls handle play/pause UX so we
 * don''' + "'" + '''t reinvent transport.
 */
function VideoBubble({ url }: { url: string }) {
  const player = useVideoPlayer(url ? { uri: url } : null, (p: any) => {
    p.muted = true;
    p.loop  = false;
  });
  return (
    <View style={styles.videoBubble}>
      <VideoView
        player={player}
        style={styles.videoView}
        contentFit="cover"
        nativeControls
      />
    </View>
  );
}

/**
 * Inline audio player. expo-audio''' + "'" + '''s `useAudioPlayer` exposes `.playing` as
 * a reactive property — touching it inside render subscribes the component
 * to playback state changes.
 */
function AudioBubble({ url, filename }: { url: string; filename?: string }) {
  const player = useAudioPlayer(url ? { uri: url } : null);
  const toggle = () => {
    if (player.playing) {
      player.pause();
    } else {
      // Always seek to 0 in case playback already ended.
      try { player.seekTo(0); } catch { /* no-op */ }
      player.play();
    }
  };
  return (
    <View style={styles.audioBubble}>
      <TouchableOpacity onPress={toggle} style={styles.audioPlayBtn}>
        <Text style={styles.audioPlayIcon}>{player.playing ? '⏸' : '▶'}</Text>
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.audioFilename} numberOfLines={1}>
          {filename ?? 'Voice message'}
        </Text>
        <Text style={styles.audioStatus}>
          {player.playing ? 'Playing…' : 'Tap to play'}
        </Text>
      </View>
    </View>
  );
}

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
            <Text style={styles.fileMsg}>
              🖼 {(msg.metadata as any)?.filename ?? 'Image'}
            </Text>
          ) : msg.message_type === 'video' ? (
            <VideoBubble url={(msg.metadata as any)?.url ?? ''} />
          ) : msg.message_type === 'audio' ? (
            <AudioBubble
              url={(msg.metadata as any)?.url ?? ''}
              filename={(msg.metadata as any)?.filename}
            />
          ) : msg.message_type === 'file' ? (
            <View style={styles.fileCard}>
              <Text style={styles.fileCardIcon}>📎</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.fileCardName} numberOfLines={2}>
                  {(msg.metadata as any)?.filename ?? 'File'}
                </Text>
                {!!(msg.metadata as any)?.size_bytes && (
                  <Text style={styles.fileCardMeta}>
                    {Math.max(1, Math.round((msg.metadata as any).size_bytes / 1024))} KB
                  </Text>
                )}
              </View>
            </View>
          ) : msg.message_type === 'location' ? (
            <View style={styles.metaCard}>
              <Text style={styles.metaCardIcon}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.metaCardTitle} numberOfLines={1}>
                  {(msg.metadata as any)?.name ?? 'Location'}
                </Text>
                {!!(msg.metadata as any)?.address && (
                  <Text style={styles.metaCardSub} numberOfLines={2}>
                    {(msg.metadata as any).address}
                  </Text>
                )}
                {(msg.metadata as any)?.latitude != null && (msg.metadata as any)?.longitude != null && (
                  <Text style={styles.metaCardCoord}>
                    {Number((msg.metadata as any).latitude).toFixed(4)}, {Number((msg.metadata as any).longitude).toFixed(4)}
                  </Text>
                )}
              </View>
            </View>
          ) : msg.message_type === 'contact' ? (
            <View style={styles.metaCard}>
              <Text style={styles.metaCardIcon}>👤</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.metaCardTitle} numberOfLines={1}>
                  {(msg.metadata as any)?.name ?? 'Contact'}
                </Text>
                {!!(msg.metadata as any)?.phone && (
                  <Text style={styles.metaCardSub} numberOfLines={1}>
                    📞 {(msg.metadata as any).phone}
                  </Text>
                )}
                {!!(msg.metadata as any)?.email && (
                  <Text style={styles.metaCardSub} numberOfLines={1}>
                    ✉️ {(msg.metadata as any).email}
                  </Text>
                )}
              </View>
            </View>
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
  // Group call member selector (group / open rooms with 2+ peers)
  const [showCallSelector, setShowCallSelector] = useState(false);
  const [callTargets,    setCallTargets] = useState<string[]>([]);
  const [memberSearch,   setMemberSearch] = useState('');
  const MAX_CALL_TARGETS = 4;
  // Plus menu (location / contact / file)
  const [showPlusMenu,    setShowPlusMenu]    = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showContactModal,  setShowContactModal]  = useState(false);
  const [locationForm,    setLocationForm]   = useState({ name: '', address: '', latitude: '', longitude: '' });
  const [contactForm,     setContactForm]    = useState({ name: '', phone: '', email: '' });
  const [sendingMeta,     setSendingMeta]    = useState(false);

  // Audio recording (expo-audio). The hook returns a stable recorder instance
  // for the lifetime of the screen; we drive a manual interval to refresh the
  // visible duration while recording.
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [showAudioModal,  setShowAudioModal]  = useState(false);
  const [audioPhase,      setAudioPhase]      = useState<'idle' | 'recording' | 'recorded'>('idle');
  const [audioDurationMs, setAudioDurationMs] = useState(0);
  const audioStartedAtRef = useRef<number | null>(null);
  const audioTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);

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

    // The HyperBabel Real-Time backend wraps every per-room broadcast as
    //   { type: 'message' | 'typing' | …, data: <payload>, timestamp: … }
    // and publishes it under event-name 'message'. Other event names
    // ('message.deleted', 'message.updated', …) carry an un-wrapped payload.
    const unsubRoom = channelService.subscribeToRoom(roomId, ({ message, type }) => {
      const envelope = (message ?? {}) as Record<string, any>;

      if (type === 'message' && envelope?.type === 'typing') {
        const fromId = envelope.userId as string | undefined;
        if (!fromId || fromId === user.userId) return;
        setTyping(fromId);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setTyping(null), 4000);
        return;
      }

      if (type === 'message.deleted' || (type === 'message' && envelope?.type === 'message.deleted')) {
        const payload = (envelope?.data ?? envelope) as Record<string, any>;
        const id = (payload?.message_id ?? payload?.id) as string | undefined;
        if (!id) return;
        setMessages((prev) =>
          prev.map((m) => m.message_id === id ? { ...m, deleted_at: new Date().toISOString() } : m),
        );
        return;
      }

      if (type === 'message.updated' || (type === 'message' && envelope?.type === 'message.updated')) {
        const payload = (envelope?.data ?? envelope) as Record<string, any>;
        const id = (payload?.message_id ?? payload?.id) as string | undefined;
        const content = payload?.content as string | undefined;
        if (!id || !content) return;
        setMessages((prev) =>
          prev.map((m) => m.message_id === id ? { ...m, content, edited_at: new Date().toISOString() } as Message : m),
        );
        return;
      }

      // Real chat message — Workers wraps as { type: 'message', data: <Message> }.
      // Older backends publish the message object directly.
      const msg = (
        type === 'message' && envelope?.type === 'message' && envelope?.data
          ? envelope.data
          : envelope?.message_id
            ? envelope
            : null
      ) as Message | null;
      if (!msg || !msg.message_id || !msg.created_at) return;
      setMessages((prev) => {
        if (prev.some((m) => m.message_id === msg.message_id)) return prev;
        const next = [...prev, msg];
        translateMessages([msg.message_id]);
        return next;
      });
      unitedChat.markAsRead(roomId, user.userId).catch(() => {});
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    });

    return () => { unsubRoom(); if (typingTimerRef.current) clearTimeout(typingTimerRef.current); };
  }, [channelService, roomId, user]);

  // Audio recorder timer cleanup on screen unmount — guards against the
  // unlikely case the screen is torn down mid-recording (e.g. logout).
  useEffect(() => () => {
    if (audioTimerRef.current) {
      clearInterval(audioTimerRef.current);
      audioTimerRef.current = null;
    }
  }, []);

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

  // ── Location / Contact senders ─────────────────────────────────────────────

  const handleSendLocation = async () => {
    if (!user || !roomId) return;
    const name = locationForm.name.trim();
    if (!name) { Alert.alert('Missing field', 'Please enter a location name.'); return; }
    setSendingMeta(true);
    try {
      const lat = parseFloat(locationForm.latitude);
      const lon = parseFloat(locationForm.longitude);
      await unitedChat.sendMessage(roomId, {
        sender_id:    user.userId,
        content:      name,
        message_type: 'location',
        metadata: {
          name,
          address: locationForm.address.trim() || undefined,
          ...(Number.isFinite(lat) ? { latitude: lat } : {}),
          ...(Number.isFinite(lon) ? { longitude: lon } : {}),
        },
      });
      setLocationForm({ name: '', address: '', latitude: '', longitude: '' });
      setShowLocationModal(false);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to send location.');
    } finally {
      setSendingMeta(false);
    }
  };

  const handleSendContact = async () => {
    if (!user || !roomId) return;
    const name = contactForm.name.trim();
    if (!name) { Alert.alert('Missing field', 'Please enter a contact name.'); return; }
    setSendingMeta(true);
    try {
      await unitedChat.sendMessage(roomId, {
        sender_id:    user.userId,
        content:      name,
        message_type: 'contact',
        metadata: {
          name,
          phone: contactForm.phone.trim() || undefined,
          email: contactForm.email.trim() || undefined,
        },
      });
      setContactForm({ name: '', phone: '', email: '' });
      setShowContactModal(false);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to send contact.');
    } finally {
      setSendingMeta(false);
    }
  };

  const handleAttach = async () => {
    // Proactively ask for photo-library access so the user sees a rationale
    // before the OS prompt — mirrors the usePermissions pattern used for
    // camera/mic. On Android 13+ this maps to READ_MEDIA_IMAGES; on older
    // builds it falls back to READ_EXTERNAL_STORAGE.
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission Required',
        'Photo library access is needed to attach images. Please enable it in your device Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

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
        // cf_workers_api confirm response field is `url` (a signed CDN GET).
        // Older hb_api builds called it `cdn_url`; fall back for compat.
        content:      confirmed.url ?? (confirmed as any).cdn_url ?? '',
        message_type: 'image',
        metadata:     { url: confirmed.url, filename },
      });
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message ?? 'Could not upload file.');
    } finally {
      setUploading(false);
    }
  };

  // ── Video / File / Audio attachments ──────────────────────────────────────

  const handleAttachVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission Required',
        'Photo library access is needed to attach videos. Please enable it in your device Settings.',
        [
          { text: 'Cancel',        style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality:    0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (!user || !roomId) return;

    setUploading(true);
    try {
      const filename = asset.fileName ?? `video_${Date.now()}.mp4`;
      const mimeType = asset.mimeType ?? 'video/mp4';
      const fileSize = asset.fileSize ?? 0;
      const confirmed = await uploadFile({ uri: asset.uri, filename, mimeType, fileSize });
      await unitedChat.sendMessage(roomId, {
        sender_id:    user.userId,
        content:      confirmed.url ?? (confirmed as any).cdn_url ?? '',
        message_type: 'video',
        metadata:     { url: confirmed.url, filename, size_bytes: fileSize },
      });
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message ?? 'Could not upload video.');
    } finally {
      setUploading(false);
    }
  };

  const handleAttachFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (!user || !roomId) return;

    setUploading(true);
    try {
      const filename = asset.name;
      const mimeType = asset.mimeType ?? 'application/octet-stream';
      const fileSize = asset.size ?? 0;
      const confirmed = await uploadFile({ uri: asset.uri, filename, mimeType, fileSize });
      await unitedChat.sendMessage(roomId, {
        sender_id:    user.userId,
        content:      filename,
        message_type: 'file',
        metadata:     {
          url:        confirmed.url,
          filename,
          size_bytes: fileSize,
          mime_type:  mimeType,
        },
      });
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message ?? 'Could not upload file.');
    } finally {
      setUploading(false);
    }
  };

  const startAudioRecording = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission Required',
        'Microphone access is needed to record voice messages. Please enable it in your device Settings.',
        [
          { text: 'Cancel',        style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      audioStartedAtRef.current = Date.now();
      setAudioDurationMs(0);
      setAudioPhase('recording');
      audioTimerRef.current = setInterval(() => {
        const startedAt = audioStartedAtRef.current ?? Date.now();
        setAudioDurationMs(Date.now() - startedAt);
      }, 250);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to start recording.');
    }
  };

  const stopAudioRecording = async () => {
    if (audioTimerRef.current) {
      clearInterval(audioTimerRef.current);
      audioTimerRef.current = null;
    }
    try {
      await audioRecorder.stop();
      setAudioPhase('recorded');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to stop recording.');
      setAudioPhase('idle');
    }
  };

  const discardAudio = () => {
    if (audioTimerRef.current) {
      clearInterval(audioTimerRef.current);
      audioTimerRef.current = null;
    }
    setAudioPhase('idle');
    setAudioDurationMs(0);
    audioStartedAtRef.current = null;
  };

  // Unified modal-close handler. Cleanly stops an in-flight recording so the
  // recorder + interval don''' + "'" + '''t leak when the user dismisses by swipe / tap-X /
  // back button.
  const closeAudioModal = async () => {
    if (audioPhase === 'recording') {
      if (audioTimerRef.current) {
        clearInterval(audioTimerRef.current);
        audioTimerRef.current = null;
      }
      try { await audioRecorder.stop(); } catch { /* no-op */ }
    }
    discardAudio();
    setShowAudioModal(false);
  };

  const sendAudio = async () => {
    if (!user || !roomId) return;
    const uri = audioRecorder.uri;
    if (!uri) { Alert.alert('Error', 'No audio recorded.'); return; }
    setUploading(true);
    try {
      const filename = `voice_${Date.now()}.m4a`;
      const confirmed = await uploadFile({ uri, filename, mimeType: 'audio/m4a', fileSize: 0 });
      await unitedChat.sendMessage(roomId, {
        sender_id:    user.userId,
        content:      filename,
        message_type: 'audio',
        metadata: {
          url:         confirmed.url,
          filename,
          duration_ms: audioDurationMs,
        },
      });
      setShowAudioModal(false);
      discardAudio();
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message ?? 'Could not upload audio.');
    } finally {
      setUploading(false);
    }
  };

  const handleUseMyLocation = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission Required',
        'Location access is needed to attach your current location. Please enable it in your device Settings.',
        [
          { text: 'Cancel',        style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocationForm((prev) => ({
        ...prev,
        latitude:  loc.coords.latitude.toFixed(6),
        longitude: loc.coords.longitude.toFixed(6),
      }));
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not fetch location.');
    }
  };

  // ── Video call ────────────────────────────────────────────────────────────

  const handleStartCall = async () => {
    if (!user || !roomId || !room) return;
    // 1:1 rooms only have one peer — start immediately. Group/open rooms with
    // more than one other member open a selector so the caller picks who to
    // ring (max 4 simultaneous callees).
    const peers = (room.members ?? []).filter((m) => m.user_id !== user.userId);
    if (room.room_type === '1to1' || peers.length <= 1) {
      try {
        await unitedChat.startVideoCall(roomId, user.userId);
        router.push({ pathname: '/video-call/[roomId]', params: { roomId } });
      } catch (err: any) {
        Alert.alert('Error', err.message ?? 'Failed to start call.');
      }
      return;
    }
    // Open the picker for group / open rooms.
    setCallTargets([]);
    setMemberSearch('');
    setShowCallSelector(true);
  };

  const confirmGroupCall = async () => {
    if (!user || !roomId) return;
    if (callTargets.length === 0) {
      Alert.alert('Pick at least one member', 'Select up to 4 members to invite.');
      return;
    }
    setShowCallSelector(false);
    try {
      await unitedChat.startVideoCall(roomId, user.userId, callTargets);
      router.push({ pathname: '/video-call/[roomId]', params: { roomId } });
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to start call.');
    }
  };

  const toggleCallTarget = (userId: string) => {
    setCallTargets((prev) => {
      if (prev.includes(userId)) return prev.filter((id) => id !== userId);
      if (prev.length >= MAX_CALL_TARGETS) {
        Alert.alert('Limit reached', `You can invite up to ${MAX_CALL_TARGETS} members at once.`);
        return prev;
      }
      return [...prev, userId];
    });
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

        {/* Plus popover (anchored above the input bar) */}
        {showPlusMenu && !room?.is_frozen && (
          <View style={styles.plusMenu}>
            <TouchableOpacity
              style={styles.plusItem}
              onPress={() => { setShowPlusMenu(false); handleAttach(); }}
            >
              <Text style={styles.plusIcon}>🖼</Text>
              <Text style={styles.plusLabel}>Image</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.plusItem}
              onPress={() => { setShowPlusMenu(false); handleAttachVideo(); }}
            >
              <Text style={styles.plusIcon}>🎥</Text>
              <Text style={styles.plusLabel}>Video</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.plusItem}
              onPress={() => { setShowPlusMenu(false); handleAttachFile(); }}
            >
              <Text style={styles.plusIcon}>📎</Text>
              <Text style={styles.plusLabel}>File</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.plusItem}
              onPress={() => { setShowPlusMenu(false); setShowAudioModal(true); }}
            >
              <Text style={styles.plusIcon}>🎙</Text>
              <Text style={styles.plusLabel}>Audio</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.plusItem}
              onPress={() => { setShowPlusMenu(false); setShowLocationModal(true); }}
            >
              <Text style={styles.plusIcon}>📍</Text>
              <Text style={styles.plusLabel}>Location</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.plusItem}
              onPress={() => { setShowPlusMenu(false); setShowContactModal(true); }}
            >
              <Text style={styles.plusIcon}>👤</Text>
              <Text style={styles.plusLabel}>Contact</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          {!room?.is_frozen && (
            <TouchableOpacity
              onPress={() => setShowPlusMenu((v) => !v)}
              style={styles.attachBtn}
              disabled={uploading}
            >
              <Text style={styles.attachIcon}>{uploading ? '⏳' : (showPlusMenu ? '×' : '+')}</Text>
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

      {/* Group call member selector (group / open rooms only) */}
      <Modal
        visible={showCallSelector}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCallSelector(false)}
      >
        <SafeAreaView style={callSelectorStyles.modal}>
          <View style={callSelectorStyles.header}>
            <Text style={callSelectorStyles.title}>📹 Group Video Call</Text>
            <TouchableOpacity onPress={() => setShowCallSelector(false)}>
              <Text style={callSelectorStyles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={callSelectorStyles.counter}>
            {`Select up to ${MAX_CALL_TARGETS} members  (${callTargets.length}/${MAX_CALL_TARGETS})`}
          </Text>

          <TextInput
            style={callSelectorStyles.search}
            placeholder="Search members…"
            placeholderTextColor={colors.textMuted}
            value={memberSearch}
            onChangeText={setMemberSearch}
            autoCapitalize="none"
          />

          <ScrollView style={callSelectorStyles.list}>
            {(room?.members ?? [])
              .filter((m) => m.user_id !== user?.userId)
              .filter((m) => {
                const q = memberSearch.trim().toLowerCase();
                if (!q) return true;
                return (
                  m.user_id.toLowerCase().includes(q) ||
                  (m.user_name ?? '').toLowerCase().includes(q)
                );
              })
              .map((m) => {
                const selected = callTargets.includes(m.user_id);
                return (
                  <TouchableOpacity
                    key={m.user_id}
                    style={[callSelectorStyles.row, selected && callSelectorStyles.rowSelected]}
                    onPress={() => toggleCallTarget(m.user_id)}
                    activeOpacity={0.7}
                  >
                    <Avatar name={m.user_name ?? m.user_id} size={36} />
                    <View style={{ flex: 1, marginLeft: spacing[3] }}>
                      <Text style={callSelectorStyles.name}>{m.user_name ?? m.user_id}</Text>
                      <Text style={callSelectorStyles.meta}>{m.role}</Text>
                    </View>
                    <Text style={callSelectorStyles.checkbox}>{selected ? '☑' : '☐'}</Text>
                  </TouchableOpacity>
                );
              })}
            {(room?.members ?? []).filter((m) => m.user_id !== user?.userId).length === 0 && (
              <Text style={callSelectorStyles.empty}>No other members in this room.</Text>
            )}
          </ScrollView>

          <View style={callSelectorStyles.footer}>
            <TouchableOpacity
              style={callSelectorStyles.cancelBtn}
              onPress={() => setShowCallSelector(false)}
            >
              <Text style={callSelectorStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                callSelectorStyles.startBtn,
                callTargets.length === 0 && { opacity: 0.5 },
              ]}
              disabled={callTargets.length === 0}
              onPress={confirmGroupCall}
            >
              <Text style={callSelectorStyles.startText}>
                {`📹 Start Call (${callTargets.length})`}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Send Location modal */}
      <Modal
        visible={showLocationModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLocationModal(false)}
      >
        <SafeAreaView style={metaModalStyles.modal}>
          <View style={metaModalStyles.header}>
            <Text style={metaModalStyles.title}>📍 Send Location</Text>
            <TouchableOpacity onPress={() => setShowLocationModal(false)}>
              <Text style={metaModalStyles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={metaModalStyles.body} keyboardShouldPersistTaps="handled">
            <Text style={metaModalStyles.fieldLabel}>Name</Text>
            <TextInput
              style={metaModalStyles.input}
              placeholder="e.g. Office HQ"
              placeholderTextColor={colors.textMuted}
              value={locationForm.name}
              onChangeText={(t) => setLocationForm((p) => ({ ...p, name: t }))}
            />
            <Text style={metaModalStyles.fieldLabel}>Address (optional)</Text>
            <TextInput
              style={metaModalStyles.input}
              placeholder="Street, city, country"
              placeholderTextColor={colors.textMuted}
              value={locationForm.address}
              onChangeText={(t) => setLocationForm((p) => ({ ...p, address: t }))}
            />
            <TouchableOpacity
              style={metaModalStyles.gpsBtn}
              onPress={handleUseMyLocation}
            >
              <Text style={metaModalStyles.gpsBtnText}>📡 Use my location</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: spacing[3] }}>
              <View style={{ flex: 1 }}>
                <Text style={metaModalStyles.fieldLabel}>Latitude</Text>
                <TextInput
                  style={metaModalStyles.input}
                  placeholder="37.5665"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={locationForm.latitude}
                  onChangeText={(t) => setLocationForm((p) => ({ ...p, latitude: t }))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={metaModalStyles.fieldLabel}>Longitude</Text>
                <TextInput
                  style={metaModalStyles.input}
                  placeholder="126.9780"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={locationForm.longitude}
                  onChangeText={(t) => setLocationForm((p) => ({ ...p, longitude: t }))}
                />
              </View>
            </View>
            <TouchableOpacity
              style={[metaModalStyles.sendBtn, sendingMeta && { opacity: 0.5 }]}
              onPress={handleSendLocation}
              disabled={sendingMeta}
            >
              <Text style={metaModalStyles.sendText}>{sendingMeta ? 'Sending…' : 'Send Location'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Send Contact modal */}
      <Modal
        visible={showContactModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowContactModal(false)}
      >
        <SafeAreaView style={metaModalStyles.modal}>
          <View style={metaModalStyles.header}>
            <Text style={metaModalStyles.title}>👤 Send Contact</Text>
            <TouchableOpacity onPress={() => setShowContactModal(false)}>
              <Text style={metaModalStyles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={metaModalStyles.body} keyboardShouldPersistTaps="handled">
            <Text style={metaModalStyles.fieldLabel}>Name</Text>
            <TextInput
              style={metaModalStyles.input}
              placeholder="e.g. Alice Kim"
              placeholderTextColor={colors.textMuted}
              value={contactForm.name}
              onChangeText={(t) => setContactForm((p) => ({ ...p, name: t }))}
            />
            <Text style={metaModalStyles.fieldLabel}>Phone (optional)</Text>
            <TextInput
              style={metaModalStyles.input}
              placeholder="+1 555 1234"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              value={contactForm.phone}
              onChangeText={(t) => setContactForm((p) => ({ ...p, phone: t }))}
            />
            <Text style={metaModalStyles.fieldLabel}>Email (optional)</Text>
            <TextInput
              style={metaModalStyles.input}
              placeholder="alice@example.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              value={contactForm.email}
              onChangeText={(t) => setContactForm((p) => ({ ...p, email: t }))}
            />
            <TouchableOpacity
              style={[metaModalStyles.sendBtn, sendingMeta && { opacity: 0.5 }]}
              onPress={handleSendContact}
              disabled={sendingMeta}
            >
              <Text style={metaModalStyles.sendText}>{sendingMeta ? 'Sending…' : 'Send Contact'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Voice-message recording modal (expo-audio) */}
      <Modal
        visible={showAudioModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeAudioModal}
      >
        <SafeAreaView style={metaModalStyles.modal}>
          <View style={metaModalStyles.header}>
            <Text style={metaModalStyles.title}>🎙 Voice Message</Text>
            <TouchableOpacity onPress={closeAudioModal}>
              <Text style={metaModalStyles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={audioModalStyles.body}>
            <Text style={audioModalStyles.duration}>
              {Math.floor(audioDurationMs / 1000)
                .toString()
                .padStart(2, '0')}:
              {Math.floor((audioDurationMs % 1000) / 10)
                .toString()
                .padStart(2, '0')}
            </Text>
            <Text style={audioModalStyles.hint}>
              {audioPhase === 'idle'      && 'Tap the microphone to start recording.'}
              {audioPhase === 'recording' && 'Recording… tap stop when done.'}
              {audioPhase === 'recorded'  && 'Recording captured — send or discard.'}
            </Text>

            {audioPhase === 'idle' && (
              <TouchableOpacity style={audioModalStyles.recordBtn} onPress={startAudioRecording}>
                <Text style={audioModalStyles.recordIcon}>🎙</Text>
              </TouchableOpacity>
            )}
            {audioPhase === 'recording' && (
              <TouchableOpacity
                style={[audioModalStyles.recordBtn, audioModalStyles.recordBtnActive]}
                onPress={stopAudioRecording}
              >
                <Text style={audioModalStyles.recordIcon}>⏹</Text>
              </TouchableOpacity>
            )}
            {audioPhase === 'recorded' && (
              <View style={audioModalStyles.actions}>
                <TouchableOpacity
                  style={audioModalStyles.discardBtn}
                  onPress={discardAudio}
                  disabled={uploading}
                >
                  <Text style={audioModalStyles.discardText}>Discard</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[audioModalStyles.sendBtn, uploading && { opacity: 0.5 }]}
                  onPress={sendAudio}
                  disabled={uploading}
                >
                  <Text style={audioModalStyles.sendBtnText}>
                    {uploading ? 'Sending…' : 'Send'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Group call selector styles ────────────────────────────────────────────────

const callSelectorStyles = StyleSheet.create({
  modal:        { flex: 1, backgroundColor: colors.background },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[5], paddingVertical: spacing[4], borderBottomWidth: 1, borderBottomColor: colors.border },
  title:        { ...textPresets.h4, color: colors.text },
  close:        { ...textPresets.h4, color: colors.textMuted, fontSize: 20 },
  counter:      { ...textPresets.caption, color: colors.textSecondary, paddingHorizontal: spacing[5], paddingTop: spacing[3] },
  search:       { ...textPresets.body, color: colors.text, marginHorizontal: spacing[5], marginVertical: spacing[3], backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  list:         { flex: 1, paddingHorizontal: spacing[5] },
  row:          { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3], paddingHorizontal: spacing[3], borderRadius: borderRadius.lg, marginBottom: spacing[2], backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  rowSelected:  { borderColor: colors.primary, backgroundColor: colors.surface },
  name:         { ...textPresets.label, color: colors.text, fontWeight: '600' },
  meta:         { ...textPresets.caption, color: colors.textMuted, marginTop: 2 },
  checkbox:     { fontSize: 22, color: colors.primary },
  empty:        { ...textPresets.label, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing[6] },
  footer:       { flexDirection: 'row', gap: spacing[3], padding: spacing[5], borderTopWidth: 1, borderTopColor: colors.border },
  cancelBtn:    { flex: 1, alignItems: 'center', paddingVertical: spacing[3], borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border },
  cancelText:   { ...textPresets.label, color: colors.textSecondary },
  startBtn:     { flex: 2, alignItems: 'center', paddingVertical: spacing[3], borderRadius: borderRadius.lg, backgroundColor: colors.primary },
  startText:    { ...textPresets.label, color: colors.white, fontWeight: '700' },
});

// ── Location / Contact send modal styles ────────────────────────────────────

const metaModalStyles = StyleSheet.create({
  modal:      { flex: 1, backgroundColor: colors.background },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[5], paddingVertical: spacing[4], borderBottomWidth: 1, borderBottomColor: colors.border },
  title:      { ...textPresets.h4, color: colors.text },
  close:      { ...textPresets.h4, color: colors.textMuted, fontSize: 20 },
  body:       { padding: spacing[5] },
  fieldLabel: { ...textPresets.caption, color: colors.textSecondary, marginBottom: spacing[2], marginTop: spacing[3], fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input:      { ...textPresets.body, color: colors.text, backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing[3], paddingVertical: spacing[3] },
  sendBtn:    { marginTop: spacing[6], alignItems: 'center', paddingVertical: spacing[3], borderRadius: borderRadius.lg, backgroundColor: colors.primary },
  sendText:   { ...textPresets.label, color: colors.white, fontWeight: '700' },

  // GPS autofill button inside the Send Location modal
  gpsBtn:     { marginTop: spacing[3], alignItems: 'center', paddingVertical: spacing[2], borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.primary, backgroundColor: 'rgba(59, 130, 246, 0.08)' },
  gpsBtnText: { ...textPresets.label, color: colors.primary, fontWeight: '600' },
});

// ── Audio recording modal styles ──────────────────────────────────────────────

const audioModalStyles = StyleSheet.create({
  body:           { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing[6] },
  duration:       { ...textPresets.h2, color: colors.text, fontVariant: ['tabular-nums'], marginBottom: spacing[3] },
  hint:           { ...textPresets.label, color: colors.textSecondary, marginBottom: spacing[8], textAlign: 'center' },
  recordBtn:      { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  recordBtnActive:{ backgroundColor: '#dc2626' },
  recordIcon:     { fontSize: 40, color: colors.white },
  actions:        { flexDirection: 'row', gap: spacing[4], marginTop: spacing[6] },
  discardBtn:     { paddingVertical: spacing[3], paddingHorizontal: spacing[6], borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border },
  discardText:    { ...textPresets.label, color: colors.textSecondary, fontWeight: '600' },
  sendBtn:        { paddingVertical: spacing[3], paddingHorizontal: spacing[6], borderRadius: borderRadius.lg, backgroundColor: colors.primary },
  sendBtnText:    { ...textPresets.label, color: colors.white, fontWeight: '700' },
});

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
  attachBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.card },
  attachIcon:    { fontSize: 22, color: colors.text, lineHeight: 24 },
  input:         { flex: 1, ...textPresets.body, color: colors.text, maxHeight: 120, backgroundColor: colors.card, borderRadius: borderRadius.xl, paddingHorizontal: spacing[4], paddingVertical: spacing[3], borderWidth: 1, borderColor: colors.border },
  sendBtn:       { width: 44, height: 44, backgroundColor: colors.primary, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled:{ opacity: 0.4 },
  sendIcon:      { color: colors.white, fontSize: 20, fontWeight: '700' },

  // Plus popover (image / video / file / audio / location / contact)
  plusMenu:      { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', rowGap: spacing[3], paddingVertical: spacing[3], paddingHorizontal: spacing[3], borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  plusItem:      { alignItems: 'center', gap: spacing[1], minWidth: 64, paddingVertical: spacing[1] },
  plusIcon:      { fontSize: 26 },
  plusLabel:     { ...textPresets.caption, color: colors.textSecondary, fontWeight: '600' },

  // Location / Contact message bubble cards
  metaCard:      { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], paddingVertical: spacing[2], paddingHorizontal: spacing[2], minWidth: 200 },
  metaCardIcon:  { fontSize: 22 },
  metaCardTitle: { ...textPresets.label, color: colors.text, fontWeight: '700' },
  metaCardSub:   { ...textPresets.caption, color: colors.textSecondary, marginTop: 2 },
  metaCardCoord: { ...textPresets.caption, color: colors.textMuted, marginTop: 2, fontFamily: 'Courier' },

  // File message card
  fileCard:      { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2], paddingHorizontal: spacing[2], minWidth: 200 },
  fileCardIcon:  { fontSize: 22 },
  fileCardName:  { ...textPresets.label, color: colors.text, fontWeight: '600' },
  fileCardMeta:  { ...textPresets.caption, color: colors.textMuted, marginTop: 2 },

  // Video message bubble (inline VideoView)
  videoBubble:   { width: 220, borderRadius: borderRadius.lg, overflow: 'hidden', backgroundColor: '#000' },
  videoView:     { width: 220, height: 140 },

  // Audio message bubble (play button + filename)
  audioBubble:   { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2], paddingHorizontal: spacing[1], minWidth: 220 },
  audioPlayBtn:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  audioPlayIcon: { fontSize: 18, color: colors.white, fontWeight: '700' },
  audioFilename: { ...textPresets.label, color: colors.text, fontWeight: '600' },
  audioStatus:   { ...textPresets.caption, color: colors.textMuted, marginTop: 2 },
});
