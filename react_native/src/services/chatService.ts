/**
 * HyperBabel Demo — Low-Level Chat Service
 *
 * The low-level Chat API provides direct channel-level control:
 * channels, messages, reactions, and thread replies.
 *
 * Use this in addition to unitedChatService when you need:
 *  - Emoji reactions on messages
 *  - Thread replies (reply chains)
 *  - Direct channel subscriptions
 *
 * Base path: /chat
 */

import api from './api';

const BASE = '/chat';

// ── Types ─────────────────────────────────────────────────────────────────

export interface ChatChannel {
  channel_id:   string;
  channel_name: string;
  created_at:   string;
}

export interface ChatMessage {
  message_id:   string;
  channel_id:   string;
  sender_id:    string;
  sender_name?: string;
  content:      string;
  message_type: string;
  reply_to?:    string | null;
  thread_count?: number;
  /** Server shape is a map: `{ "👍": ["user_1", "user_2"] }`. */
  reactions?:   Record<string, string[]>;
  deleted_at?:  string | null;
  created_at:   string;
  updated_at?:  string;
}

/** @deprecated The server returns `Record<emoji, userId[]>` — see Message.reactions. */
export interface ChatReaction {
  emoji:    string;
  user_id:  string;
  count?:   number;
}

export interface ThreadMessage {
  thread_id:    string;
  parent_id:    string;
  sender_id:    string;
  sender_name?: string;
  content:      string;
  created_at:   string;
}

// ── Channels ──────────────────────────────────────────────────────────────

/**
 * Create a channel.
 *
 * Wire shape per cf_workers_api/src/routes/chat.ts createChannelSchema:
 *   - `channel_name` is required and must match `^[a-z0-9:-]+$`
 *   - `channel_type` defaults to 'group'
 *   - `members` is optional
 */
export const createChannel = (channelName: string, members?: string[]) =>
  api.post<ChatChannel>(`${BASE}/channels`, {
    channel_name: channelName,
    ...(members ? { members } : {}),
  });

/** List channels for a user. */
export const listChannels = (userId: string) =>
  api.get<{ channels: ChatChannel[] }>(`${BASE}/channels?user_id=${userId}`);

// ── Messages ──────────────────────────────────────────────────────────────

/** Send a message to a channel. */
export const sendChannelMessage = (channelId: string, data: {
  sender_id:     string;
  content:       string;
  message_type?: string;
  reply_to?:     string;
}) => api.post<ChatMessage>(`${BASE}/channels/${channelId}/messages`, data);

/** Get paginated messages from a channel. */
export const getChannelMessages = (channelId: string, params: {
  cursor?: string;
  limit?:  number;
} = {}) => {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return api.get<{ messages: ChatMessage[]; next_cursor: string | null }>(
    `${BASE}/channels/${channelId}/messages${qs ? `?${qs}` : ''}`,
  );
};

/** Delete a channel message. */
export const deleteChannelMessage = (channelId: string, messageId: string, userId: string) =>
  api.delete(`${BASE}/channels/${channelId}/messages/${messageId}`, { user_id: userId });

// ── Reactions ─────────────────────────────────────────────────────────────

/**
 * Add an emoji reaction to a message. Reactions are message-scoped on the
 * Emoji reactions are ROOM-SCOPED.
 *
 * Use `/unitedchat/rooms/:roomId/messages/:messageId/reactions`, not the
 * `/chat/...` variant. The `/chat` route is server-to-server only and rejects
 * end-user (Session-Token) JWTs — which is exactly what this demo signs in
 * with, so it would fail with 403.
 *
 * The response is the FULL reaction map for that message:
 *   { "reactions": { "👍": ["user_1", "user_2"], "❤️": ["user_3"] } }
 * Store it as-is; do not hand-roll an optimistic array.
 */
export const addReaction = (roomId: string, messageId: string, userId: string, emoji: string) =>
  api.post<{ reactions: Record<string, string[]> }>(
    `/unitedchat/rooms/${roomId}/messages/${messageId}/reactions`,
    { user_id: userId, emoji },
  );

/** Remove an emoji reaction. Same room-scoped path; returns the updated map. */
export const removeReaction = (roomId: string, messageId: string, userId: string, emoji: string) =>
  api.delete<{ reactions: Record<string, string[]> }>(
    `/unitedchat/rooms/${roomId}/messages/${messageId}/reactions`,
    { user_id: userId, emoji },
  );

// ── Threads ───────────────────────────────────────────────────────────────

/**
 * Get thread replies for a parent message. The thread endpoint lives under
 * the low-level chat surface (`/chat/channels/:channelId/...`), and a
 * united-chat room id is the same as its channel id internally.
 */
export const getThreadReplies = (channelId: string, parentMessageId: string) =>
  api.get<{ replies: ChatMessage[] }>(
    `${BASE}/channels/${channelId}/messages/${parentMessageId}/thread`,
  );

/**
 * Post a reply in a thread.
 *
 * There's no dedicated "thread reply" POST endpoint — thread replies are
 * just regular messages with `reply_to` set to the parent message id, and
 * united-chat's room id is the same as the channel id we send to.
 */
export const sendThreadReply = (
  channelId: string,
  parentMessageId: string,
  data: { sender_id: string; content: string },
) =>
  api.post<ChatMessage>(
    `/unitedchat/rooms/${channelId}/messages`,
    {
      sender_id: data.sender_id,
      content: data.content,
      message_type: 'text',
      reply_to: parentMessageId,
    },
  );

// ── Search ────────────────────────────────────────────────────────────────

/**
 * Full-text search for messages in a room. Path is `/unitedchat/rooms/:id/search`
 * — the leading-slash variant `/messages/search` does not exist.
 */
export const searchMessages = (roomId: string, query: string, userId: string) =>
  api.get<{ messages: ChatMessage[] }>(
    `/unitedchat/rooms/${roomId}/search?q=${encodeURIComponent(query)}&user_id=${userId}`,
  );
