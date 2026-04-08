/**
 * HyperBabel Demo — MembersSheet Component
 *
 * Bottom-sheet overlay listing room members with their roles.
 * Owner/sub_admin actions: ban, promote/demote sub_admin.
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Modal, Pressable, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { colors, spacing, textPresets, borderRadius } from '@/theme';
import * as unitedChat from '@/services/unitedChatService';
import type { RoomMember } from '@/services/unitedChatService';

interface MembersSheetProps {
  visible:     boolean;
  roomId:      string;
  currentUserId: string;
  currentRole: 'owner' | 'sub_admin' | 'member';
  onClose:     () => void;
}

function roleVariant(role: string) {
  if (role === 'owner')     return 'error';
  if (role === 'sub_admin') return 'warning';
  return 'default';
}

export function MembersSheet({ visible, roomId, currentUserId, currentRole, onClose }: MembersSheetProps) {
  const [members,  setMembers]  = useState<RoomMember[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    unitedChat.getMembers(roomId)
      .then(({ members: m }) => setMembers(m))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, roomId]);

  const canManage = currentRole === 'owner' || currentRole === 'sub_admin';

  const handleBan = (member: RoomMember) => {
    Alert.alert('Ban Member', `Ban ${member.user_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Ban',
        style: 'destructive',
        onPress: async () => {
          await unitedChat.banUser(roomId, currentUserId, member.user_id);
          setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
        },
      },
    ]);
  };

  const handleToggleAdmin = async (member: RoomMember) => {
    if (currentRole !== 'owner') return;
    if (member.role === 'sub_admin') {
      await unitedChat.removeSubAdmin(roomId, member.user_id);
    } else {
      await unitedChat.addSubAdmin(roomId, currentUserId, member.user_id);
    }
    const { members: m } = await unitedChat.getMembers(roomId);
    setMembers(m);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <SafeAreaView style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Members · {members.length}</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ margin: spacing[8] }} />
        ) : (
          <FlatList
            data={members}
            keyExtractor={(m) => m.user_id}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Avatar name={item.user_name} size={40} />
                <View style={styles.info}>
                  <Text style={styles.name}>{item.user_name}</Text>
                  <Text style={styles.uid}>{item.user_id}</Text>
                </View>
                <Badge label={item.role} variant={roleVariant(item.role) as any} />
                {canManage && item.user_id !== currentUserId && item.role !== 'owner' && (
                  <View style={styles.actions}>
                    {currentRole === 'owner' && (
                      <TouchableOpacity onPress={() => handleToggleAdmin(item)} style={styles.actionBtn}>
                        <Text style={styles.actionText}>
                          {item.role === 'sub_admin' ? '↓' : '↑'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => handleBan(item)} style={styles.actionBtn}>
                      <Text style={[styles.actionText, { color: colors.error }]}>🚫</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
            contentContainerStyle={{ paddingBottom: spacing[8] }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:     { backgroundColor: colors.background, borderTopLeftRadius: borderRadius['2xl'], borderTopRightRadius: borderRadius['2xl'], paddingHorizontal: spacing[5], maxHeight: '75%' },
  handle:    { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginTop: spacing[3], marginBottom: spacing[3] },
  title:     { ...textPresets.h4, color: colors.text, fontWeight: '700', marginBottom: spacing[4] },
  row:       { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: spacing[3] },
  info:      { flex: 1 },
  name:      { ...textPresets.label, color: colors.text, fontWeight: '600' },
  uid:       { ...textPresets.caption, color: colors.textMuted },
  actions:   { flexDirection: 'row', gap: spacing[2] },
  actionBtn: { padding: spacing[2] },
  actionText:{ fontSize: 18 },
});
