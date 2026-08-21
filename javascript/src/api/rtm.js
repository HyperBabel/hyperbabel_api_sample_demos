/**
 * HyperBabel API — Token issuance for the Real-Time and Video engines.
 *
 * The server returns short-lived signed tokens that the SDKs trade for
 * authenticated channel/RTC sessions. No raw vendor credentials are ever
 * shipped to the client.
 */

import { api } from './client.js';

export const requestRealtimeToken = (userId, userName, preferredLangCd) =>
  api.post('/rtm/token', {
    user_id: userId,
    user_name: userName,
    preferred_lang_cd: preferredLangCd,
  });

/**
 * Request an RTC credential.
 *
 * A `publisher` token REQUIRES `opts.session_id` — the id of a live session
 * created with `POST /video/sessions` or
 * `POST /unitedchat/rooms/:roomId/video-call`. HyperBabel reads the channel
 * name and uid from that session and signs the token with them, so the caller
 * must join with **the values in the response**, not the ones it sent.
 * `external_user_id` says which of your users the token is for; it is ignored
 * for end-user (session-token) callers, whose identity comes from their token.
 *
 * Live-stream hosts do NOT use this endpoint — `POST /stream/sessions` already
 * returns a 24-hour host token. `subscriber` tokens need no session id.
 */
export const requestRtcToken = (channelName, uid, role, opts = {}) =>
  api.post('/rtm/rtc/token', {
    channel_name: channelName,
    uid,
    role,
    ...opts,
  });
