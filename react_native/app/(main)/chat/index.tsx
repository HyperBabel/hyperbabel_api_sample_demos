/**
 * HyperBabel Demo — Chat Hub (Room List)
 *
 * Shows:
 *  - My Rooms (1:1, group, open) with unread count, last message, presence
 *  - Open Rooms discovery list with auto-translated descriptions
 *  - Create Room bottom sheet (1:1, group, open)
 *  - Join by invite code
 *  - Full-text search (toggled from header)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, UnreadBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton, RoomItemSkeleton } from '@/components/ui/Skeleton';
import { colors, spacing, textPresets, borderRadius } from '@/theme';
import * as unitedChat from '@/services/unitedChatService';
import type { Room, RoomType } from '@/services/unitedChatService';

dayjs.extend(relativeTime);

// ── Room list item ────────────────────────────────────────────────────────

function RoomItem({ room, onPress }: { room: Room; onPress: () => void }) {
  const lastMsg = room.last_message;
  const memberCount = room.members?.length ?? 0;
  const displayName = room.room_name ?? (room.members?.[0]?.user_name ?? room.room_id);

  return (
    <TouchableOpacity style={styles.roomItem} onPress={onPress} activeOpacity={0.75}>
      <Avatar name={displayName} size={48} />
      <View style={styles.roomItemContent}>
        <View style={styles.roomItemRow}>
          <Text style={styles.roomItemName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.roomItemTime}>
            {lastMsg ? dayjs(lastMsg.created_at).fromNow(true) : ''}
          </Text>
        </View>
        <View style={styles.roomItemRow}>
          <Text style={styles.roomItemLast} numberOfLines={1}>
            {lastMsg
              ? (lastMsg.message_type === 'text' ? lastMsg.content : `[${lastMsg.message_type}]`)
              : 'No messages yet'}
          </Text>
          <View style={styles.roomItemBadges}>
            {room.is_frozen && <Badge label="Frozen" variant="info" />}
            {!!room.unread_count && <UnreadBadge count={room.unread_count} />}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Open room card ────────────────────────────────────────────────────────

function OpenRoomCard({ room, onJoin }: { room: Room; onJoin: () => void }) {
  return (
    <View style={styles.openCard}>
      <Text style={styles.openCardName} numberOfLines={1}>{room.room_name}</Text>
      {room.description && (
        <Text style={styles.openCardDesc} numberOfLines={2}>{room.description}</Text>
      )}
      <View style={styles.openCardFooter}>
        <Text style={styles.openCardMembers}>{room.members?.length ?? 0} members</Text>
        <TouchableOpacity style={styles.joinBtn} onPress={onJoin}>
          <Text style={styles.joinBtnText}>Join</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Create Room modal ─────────────────────────────────────────────────────

interface CreateRoomModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (type: RoomType, name: string, memberId: string) => Promise<void>;
}

function CreateRoomModal({ visible, onClose, onCreate }: CreateRoomModalProps) {
  const [roomType, setRoomType] = useState<RoomType>('group');
  const [roomName, setRoomName] = useState('');
  const [memberId, setMemberId] = useState('');
  const [loading,  setLoading]  = useState(false);

  const TYPES: { id: RoomType; label: string; icon: string }[] = [
    { id: '1to1',  label: '1:1',   icon: '👤' },
    { id: 'group', label: 'Group', icon: '👥' },
    { id: 'open',  label: 'Open',  icon: '🌐' },
  ];

  const handleCreate = async () => {
    setLoading(true);
    try {
      await onCreate(roomType, roomName.trim(), memberId.trim());
      setRoomName('');
      setMemberId('');
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to create room.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Create Room</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalClose}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
          {/* Room type */}
          <Text style={styles.fieldLabel}>Room Type</Text>
          <View style={styles.typeRow}>
            {TYPES.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.typeChip, roomType === t.id && styles.typeChipActive]}
                onPress={() => setRoomType(t.id)}
              >
                <Text style={styles.typeChipIcon}>{t.icon}</Text>
                <Text style={[styles.typeChipLabel, roomType === t.id && { color: colors.white }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Room name (group/open) */}
          {roomType !== '1to1' && (
            <>
              <Text style={styles.fieldLabel}>Room Name</Text>
              <TextInput style={styles.modalInput} placeholder="e.g. Team Chat" placeholderTextColor={colors.textMuted} value={roomName} onChangeText={setRoomName} />
            </>
          )}

          {/* Member ID (1:1) */}
          {roomType === '1to1' && (
            <>
              <Text style={styles.fieldLabel}>Recipient User ID</Text>
              <TextInput style={styles.modalInput} placeholder="e.g. user_bob" placeholderTextColor={colors.textMuted} autoCapitalize="none" value={memberId} onChangeText={setMemberId} />
            </>
          )}

          <Button label={loading ? 'Creating...' : 'Create Room'} onPress={handleCreate} disabled={loading} fullWidth style={{ marginTop: spacing[4] }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────

type Tab = 'my' | 'open';

export default function ChatHubScreen() {
  const { user } = useAuth();
  const [tab,          setTab]          = useState<Tab>('my');
  const [rooms,        setRooms]        = useState<Room[]>([]);
  const [openRooms,    setOpenRooms]    = useState<Room[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [showCreate,   setShowCreate]   = useState(false);
  const [showCodeInput,setShowCodeInput]= useState(false);
  const [inviteCode,   setInviteCode]   = useState('');
  const [searchMode,   setSearchMode]   = useState(false);
  const [searchQuery,  setSearchQuery]  = useState('');

  const loadRooms = useCallback(async () => {
    if (!user) return;
    try {
      const data = await unitedChat.listRooms(user.userId, { lang: user.langCode });
      setRooms(data.rooms ?? []);
      setOpenRooms(data.open_rooms ?? []);
    } catch (err: any) {
      const msg = err?.message ?? 'Failed to load rooms.';
      // Don't spam alerts on background refresh
      if (!refreshing) Alert.alert('Error', msg);
    }
  }, [user, refreshing]);

  useEffect(() => {
    setLoading(true);
    loadRooms().finally(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadRooms();
    setRefreshing(false);
  };

  const handleCreateRoom = async (type: RoomType, name: string, memberId: string) => {
    if (!user) return;
    const created = await unitedChat.createRoom({
      room_type:  type,
      creator_id: user.userId,
      room_name:  name || undefined,
      members:    type === '1to1' ? [user.userId, memberId] : [user.userId],
    });
    await loadRooms();
    router.push(`/(main)/chat/${created.room_id}`);
  };

  const handleJoinByCode = async () => {
    if (!user || !inviteCode.trim()) return;
    try {
      const room = await unitedChat.joinByCode(inviteCode.trim(), user.userId, user.userName);
      setInviteCode('');
      setShowCodeInput(false);
      await loadRooms();
      router.push(`/(main)/chat/${room.room_id}`);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Invalid invite code.');
    }
  };

  const handleJoinOpen = async (room: Room) => {
    if (!user) return;
    try {
      await unitedChat.joinRoom(room.room_id, user.userId, user.userName);
      await loadRooms();
      router.push(`/(main)/chat/${room.room_id}`);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to join room.');
    }
  };

  const filteredRooms = searchQuery
    ? rooms.filter((r) =>
        r.room_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.last_message?.content?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : rooms;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        {searchMode ? (
          <TextInput
            style={styles.searchInput}
            placeholder="Search rooms or messages..."
            placeholderTextColor={colors.textMuted}
            autoFocus
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        ) : (
          <Text style={styles.headerTitle}>Messages</Text>
        )}
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => { setSearchMode((v) => !v); setSearchQuery(''); }}>
            <Text style={styles.headerIcon}>{searchMode ? '✕' : '🔍'}</Text>
          </TouchableOpacity>
          {!searchMode && (
            <TouchableOpacity onPress={() => setShowCreate(true)}>
              <Text style={styles.headerIcon}>✏️</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      {!searchMode && (
        <View style={styles.tabs}>
          {(['my', 'open'] as Tab[]).map((t) => (
            <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
              <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
                {t === 'my' ? 'My Rooms' : 'Open Rooms'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* My Rooms tab */}
      {(tab === 'my' || searchMode) && (
        <>
          {loading ? (
            <View>
              {[1, 2, 3].map((i) => <RoomItemSkeleton key={i} />)}
            </View>
          ) : (
            <FlatList
              data={filteredRooms}
              keyExtractor={(r) => r.room_id}
              renderItem={({ item }) => (
                <RoomItem
                  room={item}
                  onPress={() => router.push(`/(main)/chat/${item.room_id}`)}
                />
              )}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyIcon}>💬</Text>
                  <Text style={styles.emptyText}>No rooms yet</Text>
                  <Text style={styles.emptyHint}>Tap ✏️ to start a conversation</Text>
                </View>
              }
            />
          )}
        </>
      )}

      {/* Open Rooms tab */}
      {tab === 'open' && !searchMode && (
        <ScrollView
          style={styles.openScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          {/* Join by code */}
          <TouchableOpacity style={styles.joinByCode} onPress={() => setShowCodeInput((v) => !v)}>
            <Text style={styles.joinByCodeText}>🔑  Join by Invite Code</Text>
          </TouchableOpacity>

          {showCodeInput && (
            <View style={styles.codeRow}>
              <TextInput
                style={styles.codeInput}
                placeholder="8-character code"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                maxLength={8}
                value={inviteCode}
                onChangeText={setInviteCode}
              />
              <Button label="Join" onPress={handleJoinByCode} size="sm" />
            </View>
          )}

          {/* Open room cards */}
          {openRooms.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🌐</Text>
              <Text style={styles.emptyText}>No open rooms</Text>
            </View>
          ) : (
            openRooms.map((r) => (
              <OpenRoomCard key={r.room_id} room={r} onJoin={() => handleJoinOpen(r)} />
            ))
          )}
        </ScrollView>
      )}

      {/* Create Room modal */}
      <CreateRoomModal visible={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreateRoom} />

      {/* FAB */}
      {!searchMode && tab === 'my' && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)} activeOpacity={0.85}>
          <LinearGradient colors={colors.gradientBrand} style={styles.fabGradient}>
            <Text style={styles.fabIcon}>+</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: colors.background },

  header:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[5], paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle:       { ...textPresets.h3, color: colors.text },
  headerActions:     { flexDirection: 'row', gap: spacing[4] },
  headerIcon:        { fontSize: 20 },
  searchInput:       { flex: 1, ...textPresets.body, color: colors.text, backgroundColor: colors.surface, borderRadius: borderRadius.lg, paddingHorizontal: spacing[4], paddingVertical: spacing[2] },

  tabs:              { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab:               { flex: 1, alignItems: 'center', paddingVertical: spacing[3] },
  tabActive:         { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabLabel:          { ...textPresets.label, color: colors.textMuted },
  tabLabelActive:    { color: colors.primary, fontWeight: '700' },

  roomItem:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[5], paddingVertical: spacing[3], gap: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  roomItemContent:   { flex: 1, gap: spacing[1] },
  roomItemRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] },
  roomItemName:      { ...textPresets.label, color: colors.text, fontWeight: '700', flex: 1 },
  roomItemTime:      { ...textPresets.caption, color: colors.textMuted },
  roomItemLast:      { ...textPresets.caption, color: colors.textSecondary, flex: 1 },
  roomItemBadges:    { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },

  openScroll:        { flex: 1, padding: spacing[5] },
  openCard:          { backgroundColor: colors.card, borderRadius: borderRadius.xl, padding: spacing[4], marginBottom: spacing[3], borderWidth: 1, borderColor: colors.glassBorder },
  openCardName:      { ...textPresets.label, color: colors.text, fontWeight: '700', marginBottom: spacing[1] },
  openCardDesc:      { ...textPresets.caption, color: colors.textSecondary, marginBottom: spacing[3] },
  openCardFooter:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  openCardMembers:   { ...textPresets.caption, color: colors.textMuted },
  joinBtn:           { backgroundColor: colors.primary, paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: borderRadius.lg },
  joinBtnText:       { ...textPresets.caption, color: colors.white, fontWeight: '700' },

  joinByCode:        { backgroundColor: colors.card, borderRadius: borderRadius.xl, padding: spacing[4], marginBottom: spacing[3], borderWidth: 1, borderColor: colors.primary, flexDirection: 'row', alignItems: 'center' },
  joinByCodeText:    { ...textPresets.label, color: colors.primary, fontWeight: '700' },
  codeRow:           { flexDirection: 'row', gap: spacing[3], marginBottom: spacing[4], alignItems: 'center' },
  codeInput:         { flex: 1, ...textPresets.body, color: colors.text, backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing[4], paddingVertical: spacing[3] },

  empty:             { alignItems: 'center', paddingVertical: spacing[16] },
  emptyIcon:         { fontSize: 48, marginBottom: spacing[4] },
  emptyText:         { ...textPresets.h4, color: colors.textSecondary, marginBottom: spacing[2] },
  emptyHint:         { ...textPresets.label, color: colors.textMuted },

  modal:             { flex: 1, backgroundColor: colors.background },
  modalHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing[5], borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle:        { ...textPresets.h3, color: colors.text },
  modalClose:        { ...textPresets.h4, color: colors.textMuted, fontSize: 20 },
  modalBody:         { padding: spacing[5] },
  fieldLabel:        { ...textPresets.caption, color: colors.textSecondary, marginBottom: spacing[2], fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing[4] },
  modalInput:        { ...textPresets.body, color: colors.text, backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  typeRow:           { flexDirection: 'row', gap: spacing[3] },
  typeChip:          { flex: 1, alignItems: 'center', paddingVertical: spacing[3], borderRadius: borderRadius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing[1] },
  typeChipActive:    { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipIcon:      { fontSize: 20 },
  typeChipLabel:     { ...textPresets.caption, color: colors.textSecondary, fontWeight: '600' },

  fab:               { position: 'absolute', bottom: spacing[6], right: spacing[5], borderRadius: borderRadius.full, overflow: 'hidden' },
  fabGradient:       { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  fabIcon:           { color: colors.white, fontSize: 28, fontWeight: '300', lineHeight: 32 },
});
