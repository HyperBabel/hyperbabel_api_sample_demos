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

export const requestRtcToken = (channelName, uid, role, opts = {}) =>
  api.post('/rtm/rtc/token', {
    channel_name: channelName,
    uid,
    role,
    ...opts,
  });
