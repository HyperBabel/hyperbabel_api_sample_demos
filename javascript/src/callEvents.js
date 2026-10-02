/**
 * Video-call events on a room's real-time channel.
 *
 * HyperBabel records every call state change as a system message in the room
 * and broadcasts it like any other message: event name `message`, payload
 * `{ type: 'message', data: <message> }` with
 *   data.message_type === 'video_call', data.sender_id === 'system',
 *   data.content === '', data.metadata === { event, session_id, … }
 * `event` is one of call_started, call_accepted, call_ended, call_rejected,
 * call_missed, call_busy. A reject does NOT end the call — `call_ended`
 * does.
 */

/**
 * The call event carried by a room broadcast, or null when it is something
 * else. Takes the `{ message, type }` object `subscribeRoom` delivers.
 */
export function callEventOf({ message, type }) {
  if (type !== 'message' || message?.type !== 'message') return null;
  const msg = message.data;
  if (msg?.message_type !== 'video_call') return null;
  const meta = msg.metadata || {};
  if (!meta.event) return null;
  return { event: meta.event, sessionId: meta.session_id, metadata: meta };
}

/** One-line label for a `video_call` system message in the chat list. */
export function callEventLabel(metadata = {}) {
  switch (metadata.event) {
    case 'call_started':  return 'Video call started';
    case 'call_accepted': return 'Video call answered';
    case 'call_ended': {
      const secs = Number(metadata.duration_seconds) || 0;
      if (secs <= 0) return 'Video call ended';
      const m = Math.floor(secs / 60);
      const s = String(secs % 60).padStart(2, '0');
      return `Video call ended · ${m}:${s}`;
    }
    case 'call_rejected': return 'Call declined';
    case 'call_missed':   return 'Missed call';
    case 'call_busy':     return 'Line busy';
    default:              return 'Video call';
  }
}
