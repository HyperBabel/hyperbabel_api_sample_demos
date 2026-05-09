/**
 * HyperBabel Video client.
 *
 * Thin wrapper around the underlying video RTC SDK. The vendor package is
 * imported under the neutral `videoSdk` alias so the demo code below talks
 * about HyperBabel Video, not the raw vendor name.
 */

import videoSdk from 'agora-rtc-sdk-ng';
import { requestRtcToken } from '../api/rtm.js';

let _engine = null;

function ensureEngine() {
  if (!_engine) {
    _engine = videoSdk.createClient({ mode: 'rtc', codec: 'vp8' });
  }
  return _engine;
}

export async function joinCall({ channelName, uid, role = 'publisher' }) {
  const engine = ensureEngine();
  const tok = await requestRtcToken(channelName, uid, role);
  await engine.join(tok.app_id, tok.channel_name, tok.rtc_token, tok.uid);
  return engine;
}

export async function publishLocalTracks() {
  const engine = ensureEngine();
  const [audio, video] = await Promise.all([
    videoSdk.createMicrophoneAudioTrack(),
    videoSdk.createCameraVideoTrack(),
  ]);
  await engine.publish([audio, video]);
  return { audio, video };
}

export async function leaveCall(localTracks) {
  if (!_engine) return;
  if (localTracks?.audio) localTracks.audio.close();
  if (localTracks?.video) localTracks.video.close();
  await _engine.leave();
  _engine = null;
}

export function onRemoteUserPublished(handler) {
  ensureEngine().on('user-published', async (user, mediaType) => {
    await _engine.subscribe(user, mediaType);
    handler(user, mediaType);
  });
}

export function onRemoteUserLeft(handler) {
  ensureEngine().on('user-left', handler);
}
