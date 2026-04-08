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
  reactions?:   ChatReaction[];
  deleted_at?:  string | null;
  created_at:   string;
  updated_at?:  string;
}

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

/** Create or get a channel. */
export const createChannel = (name: string, members?: string[]) =>
  api.post<ChatChannel>(`${BASE}/channels`, { name, members });

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
 * Add an emoji reaction to a message.
 * Idempotent — calling again removes the reaction (toggle).
 */
export const addReaction = (roomId: string, messageId: string, userId: string, emoji: string) =>
  api.post(`/unitedchat/rooms/${roomId}/messages/${messageId}/reactions`, {
    user_id: userId,
    emoji,
  });

/**
 * Remove an emoji reaction from a message.
 */
export const removeReaction = (roomId: string, messageId: string, userId: string, emoji: string) =>
  api.delete(`/unitedchat/rooms/${roomId}/messages/${messageId}/reactions`, {
    user_id: userId,
    emoji,
  });

// ── Threads ───────────────────────────────────────────────────────────────

/**
 * Get thread replies for a parent message.
 */
export const getThreadReplies = (roomId: string, parentMessageId: string) =>
  api.get<{ replies: ChatMessage[] }>(
    `/unitedchat/rooms/${roomId}/messages/${parentMessageId}/thread`,
  );

/**
 * Post a reply in a thread.
 */
export const sendThreadReply = (roomId: string, parentMessageId: string, data: {
  sender_id:  string;
  content:    string;
}) =>
  api.post<ChatMessage>(
    `/unitedchat/rooms/${roomId}/messages/${parentMessageId}/thread`,
    data,
  );

// ── Search ────────────────────────────────────────────────────────────────

/**
 * Full-text search for messages in a room.
 * @param roomId   - Room to search in
 * @param query    - Search text
 * @param userId   - Requesting user ID
 */
export const searchMessages = (roomId: string, query: string, userId: string) =>
  api.get<{ messages: ChatMessage[] }>(
    `/unitedchat/rooms/${roomId}/messages/search?q=${encodeURIComponent(query)}&user_id=${userId}`,
  );
