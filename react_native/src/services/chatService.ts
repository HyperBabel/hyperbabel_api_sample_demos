/**
 * HyperBabel Demo — Reactions, Threads and Search
 *
 * These three features are room-scoped and live under `/unitedchat`, which is
 * the surface an END-USER token may call. Everything else about a room —
 * creating it, listing rooms, loading and sending messages — is in
 * `unitedChatService`; this file only adds what sits on top of a message.
 *
 * WHY NOTHING HERE CALLS `/chat`
 *   The `/chat/*` endpoints are the server-to-server surface: they take an
 *   organization API key, not an end-user token, and they reject end-user
 *   tokens with 403 on reads as well as writes. This demo signs in as an end
 *   user (see firebaseAuthService), and `api.ts` refuses organization keys
 *   outright, so a `/chat` call from this app can never succeed. Every helper
 *   here therefore uses a room-scoped `/unitedchat` path.
 *
 * Base path: /unitedchat
 */

import api from './api';
import { getMessages } from './unitedChatService';
import type { Message } from './unitedChatService';

/**
 * How far back to scan for thread replies.
 *
 * `/unitedchat` has no dedicated thread endpoint because a thread reply is
 * just an ordinary message with `reply_to` set, so we read the room's recent
 * messages and keep the ones pointing at the parent. 100 is the server's
 * per-page maximum. A production app would page with `next_cursor` until it
 * reaches the parent's `created_at`; a demo thread never gets that long.
 */
const THREAD_SCAN_LIMIT = 100;

// ── Reactions ─────────────────────────────────────────────────────────────

/**
 * Add an emoji reaction to a message. Emoji reactions are ROOM-SCOPED, so the
 * path carries the room id, not a channel id.
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
 * Get thread replies for a parent message.
 *
 * There is no dedicated "read thread" endpoint, for the same reason there is
 * no dedicated "post thread reply" one (see `sendThreadReply`): a reply is an
 * ordinary room message carrying `reply_to`. So read the room's recent
 * messages and keep the ones that point at this parent.
 *
 * The room messages endpoint returns NEWEST FIRST, so sort back into
 * chronological order — a thread reads top to bottom. Soft-deleted replies
 * (`deleted_at`) are dropped rather than rendered as blanks.
 */
export const getThreadReplies = async (
  roomId: string,
  parentMessageId: string,
): Promise<{ replies: Message[] }> => {
  const { messages } = await getMessages(roomId, { limit: THREAD_SCAN_LIMIT });
  const replies = messages
    .filter((m) => m.reply_to === parentMessageId && !m.deleted_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { replies };
};

/**
 * Post a reply in a thread.
 *
 * There's no dedicated "thread reply" POST endpoint — thread replies are
 * just regular messages with `reply_to` set to the parent message `id`.
 * Like any send, the response is WRAPPED: `{ message: { … } }`.
 */
export const sendThreadReply = (
  roomId: string,
  parentMessageId: string,
  data: { sender_id: string; content: string },
) =>
  api.post<{ message: Message }>(
    `/unitedchat/rooms/${roomId}/messages`,
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
 * Provided for porting; no screen in this demo calls it yet.
 */
export const searchMessages = (roomId: string, query: string, userId: string) =>
  api.get<{ messages: Message[] }>(
    `/unitedchat/rooms/${roomId}/search?q=${encodeURIComponent(query)}&user_id=${userId}`,
  );
