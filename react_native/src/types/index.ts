/**
 * HyperBabel Demo — Shared Type Definitions
 *
 * Central type file re-exporting all domain types.
 * Import from here instead of individual service files.
 */

export type { Room, RoomType, RoomMember, Message, MessageType, MemberRole, ActiveVideoCall, Reaction } from '@/services/unitedChatService';
export type { StreamSession } from '@/services/streamService';
export type { PresenceEntry, PresenceStatus } from '@/services/presenceService';
export type { PushPlatform } from '@/services/pushService';
export type { UsageStats, WebhookConfig } from '@/services/authService';
export type { RealtimeChannelService } from '@/services/realtimeService';

/** Navigation param list for typed routing */
export interface ChatRoomParams {
  roomId:    string;
  roomName?: string;
}

export interface VideoCallParams {
  roomId:      string;
  sessionId?:  string;
  isIncoming?: string;
}

export interface LiveStreamParams {
  sessionId: string;
}
