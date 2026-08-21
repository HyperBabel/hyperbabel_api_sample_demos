/**
 * HyperBabel Video client.
 *
 * Thin wrapper around the underlying video RTC SDK. The vendor package is
 * imported under the neutral `videoSdk` alias so the demo code below talks
 * about HyperBabel Video, not the raw vendor name.
 *
 * Publishing resolution is driven by `videoQuality.js` so that the pixels we
 * send and the billing tier we declare can never drift apart. Read that file
 * before changing any resolution here.
 */

import videoSdk from 'agora-rtc-sdk-ng';
import { requestRtcToken } from '../api/rtm.js';
import { encoderForRemoteCount, declaredQuality } from './videoQuality.js';

export { declaredQuality };

let _engine = null;
let _localVideoTrack = null;
/** Remote participants currently in the channel, by uid. */
const _remoteUids = new Set();
/**
 * 'call' (default) or 'broadcast'.
 *
 * This demo uses one engine for both surfaces, so the distinction has to be
 * explicit. In a CALL every participant receives every other stream, so the
 * publishing resolution has to shrink as the call grows. In a BROADCAST the
 * host publishes one stream and each viewer receives just that one — the
 * audience size never changes the tier, so the host stays on the 1:1 preset
 * however many people are watching.
 */
let _sessionKind = 'call';

function ensureEngine() {
  if (!_engine) {
    _engine = videoSdk.createClient({ mode: 'rtc', codec: 'vp8' });
    wireResolutionTracking(_engine);
  }
  return _engine;
}

/**
 * Keep the publishing resolution in step with the number of remote
 * participants. Registered once per engine, independently of whatever
 * handlers the app adds later, so the resolution is corrected even if the
 * app never subscribes to these events.
 *
 * Counting is by CHANNEL MEMBERSHIP (`user-joined`), not by who currently
 * publishes video. Someone sitting in the call with the camera off can turn it
 * on at any moment; if the resolution were only lowered once they publish,
 * the very frames around that moment would already be over budget.
 * Over-counting lowers the resolution and is safe — under-counting is what
 * pushes a call above the tier it declared.
 */
function wireResolutionTracking(engine) {
  engine.on('user-joined', (user) => {
    _remoteUids.add(user.uid);
    applyEncoderForCurrentCall();
  });
  engine.on('user-left', (user) => {
    _remoteUids.delete(user.uid);
    applyEncoderForCurrentCall();
  });
}

/**
 * Re-apply the preset for the current call size.
 *
 * Failures are surfaced, never swallowed: if the downshift does not land, the
 * call keeps publishing at the larger resolution and every participant's
 * received total moves into a higher (more expensive) tier than the one
 * declared when the session was created.
 */
function applyEncoderForCurrentCall() {
  if (!_localVideoTrack) return;
  const preset = encoderForRemoteCount(_sessionKind === 'broadcast' ? 0 : _remoteUids.size);
  Promise.resolve(_localVideoTrack.setEncoderConfiguration(preset)).catch((err) => {
    console.warn(
      '[HyperBabelVideo] could not apply the resolution for %d remote participant(s) ' +
        '(target %dx%d) — the call may exceed the HD tier you declared',
      _remoteUids.size,
      preset.width,
      preset.height,
      err,
    );
  });
}

/**
 * @param {object} opts
 * @param {'call'|'broadcast'} [opts.sessionKind='call'] — see `_sessionKind`.
 *   Defaults to 'call', the conservative choice: it shrinks the resolution as
 *   participants arrive.
 */
export async function joinCall({
  channelName,
  uid,
  role = 'publisher',
  sessionKind = 'call',
  /**
   * REQUIRED for `role: 'publisher'` — the live session this channel belongs to.
   * The server verifies you are a participant and signs the token with the
   * session's channel name and uid, so we join with the values it returns.
   */
  sessionId,
  /** Which of your users this token is for (API-key callers). */
  externalUserId,
} = {}) {
  _sessionKind = sessionKind === 'broadcast' ? 'broadcast' : 'call';
  const engine = ensureEngine();
  const tok = await requestRtcToken(channelName, uid, role, {
    ...(sessionId ? { session_id: sessionId } : {}),
    ...(externalUserId ? { external_user_id: externalUserId } : {}),
  });
  // Join with the SERVER's channel/uid — a publisher token is signed with the
  // session's values and a mismatched uid is rejected at join time.
  await engine.join(tok.app_id, tok.channel_name, tok.rtc_token, tok.uid);
  return engine;
}

/**
 * Join with a token the server already issued — no token request of our own.
 *
 * Live-stream hosts use this: `POST /stream/sessions` returns a 24-hour
 * publisher token together with the channel name and uid, so asking
 * `/rtm/rtc/token` for a second one is a wasted round-trip (and that endpoint
 * only issues publisher tokens for *video call* sessions).
 */
export async function joinWithToken({ appId, channelName, token, uid, sessionKind = 'call' }) {
  _sessionKind = sessionKind === 'broadcast' ? 'broadcast' : 'call';
  const engine = ensureEngine();
  await engine.join(appId, channelName, token, uid);
  return engine;
}

export async function publishLocalTracks() {
  const engine = ensureEngine();
  // Start from the preset for the call as it stands right now: a late joiner
  // walks into an already-populated channel, so the first frame it publishes
  // must already be sized for that many remotes.
  const preset = encoderForRemoteCount(_sessionKind === 'broadcast' ? 0 : _remoteUids.size);
  const [audio, video] = await Promise.all([
    videoSdk.createMicrophoneAudioTrack(),
    videoSdk.createCameraVideoTrack({ encoderConfig: preset }),
  ]);
  _localVideoTrack = video;
  await engine.publish([audio, video]);
  return { audio, video };
}

export async function leaveCall(localTracks) {
  if (!_engine) return;
  if (localTracks?.audio) localTracks.audio.close();
  if (localTracks?.video) localTracks.video.close();
  await _engine.leave();
  _engine = null;
  _localVideoTrack = null;
  _remoteUids.clear();
  _sessionKind = 'call';
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
