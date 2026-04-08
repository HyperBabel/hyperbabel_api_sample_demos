/**
 * HyperBabel RTC Service
 *
 * Manages real-time audio/video communication for:
 *  - 1:1 and Group Video Calls (publisher + subscriber tracks)
 *  - Live Stream (host publishes; viewers subscribe only)
 *
 * Credentials are obtained from the HyperBabel Token API
 * (`POST /rtm/rtc/token`) so that no third-party keys are
 * ever exposed in application code or to end users.
 *
 * Usage (Video Call — publisher):
 *   const session = await rtcService.joinChannel(channelName, uid, 'publisher');
 *   await session.publishLocalTracks(videoEl, audioEnabled);
 *   session.onRemoteUser(({ user, videoTrack }) => { ... });
 *
 * Usage (Live Stream — viewer):
 *   const session = await rtcService.joinChannel(channelName, uid, 'subscriber');
 *   session.onRemoteUser(({ user, videoTrack, audioTrack }) => { ... });
 */

import RtcEngine from 'agora-rtc-sdk-ng';
import api from './api';

const BASE = '/rtm/rtc';

// ── Token Request ─────────────────────────────────────────────────────────

/**
 * Fetch an RTC session credential from the HyperBabel token endpoint.
 * Returns the token, channel name, UID, and the app identifier needed
 * to initialise the RTC client — all managed server-side by HyperBabel.
 *
 * @param {string}             channelName — Session / stream ID
 * @param {number}             uid         — Unique numeric participant ID
 * @param {'publisher'|'subscriber'} role
 * @param {string}             [externalUserId]
 * @param {string}             [userName]
 * @param {string}             [preferredLangCd]
 * @returns {Promise<{ rtc_token, channel_name, uid, app_id }>}
 */
export const getRtcToken = (channelName, uid, role, externalUserId, userName, preferredLangCd) =>
  api.post(`${BASE}/token`, {
    channel_name: channelName,
    uid,
    role,
    ...(externalUserId && { external_user_id: externalUserId }),
    ...(userName && { user_name: userName }),
    ...(preferredLangCd && { preferred_lang_cd: preferredLangCd }),
  });

// ── RTC Session ───────────────────────────────────────────────────────────

/**
 * Join an RTC channel with the given role.
 *
 * Internally this:
 *  1. Calls HyperBabel's token endpoint to get a signed credential
 *  2. Initialises the RTC client with HyperBabel's app identifier
 *  3. Joins the session channel
 *  4. Returns a session object with track management and event hooks
 *
 * @param {string}             channelName — Must match the session ID used in the API
 * @param {number}             uid
 * @param {'publisher'|'subscriber'} role
 * @param {object}             [userMeta]  — { externalUserId, userName, preferredLangCd }
 * @returns {Promise<RtcSession>}
 */
export const joinChannel = async (channelName, uid, role, userMeta = {}) => {
  // Step 1: Get credentials from HyperBabel
  const { rtc_token, app_id } = await getRtcToken(
    channelName,
    uid,
    role,
    userMeta.externalUserId,
    userMeta.userName,
    userMeta.preferredLangCd
  );

  // Step 2: Create the RTC client (audio+video, WebRTC)
  const client = RtcEngine.createClient({ mode: 'rtc', codec: 'vp8' });

  // Event handlers registry
  const eventHandlers = {
    onRemoteUser: null,
    onRemoteUserLeft: null,
    onConnectionChange: null,
  };

  // Step 3: Wire up remote user events before joining
  client.on('user-published', async (user, mediaType) => {
    await client.subscribe(user, mediaType);

    if (eventHandlers.onRemoteUser) {
      eventHandlers.onRemoteUser({
        user,
        videoTrack: mediaType === 'video' ? user.videoTrack : null,
        audioTrack: mediaType === 'audio' ? user.audioTrack : null,
        mediaType,
      });
    }
  });

  client.on('user-unpublished', (user) => {
    if (eventHandlers.onRemoteUserLeft) {
      eventHandlers.onRemoteUserLeft({ user });
    }
  });

  client.on('connection-state-change', (state) => {
    if (eventHandlers.onConnectionChange) {
      eventHandlers.onConnectionChange(state);
    }
  });

  // Step 4: Join the channel with the HyperBabel-issued token
  await client.join(app_id, channelName, rtc_token, uid);

  // ── Session object returned to the caller ─────────────────────────────

  let localVideoTrack = null;
  let localAudioTrack = null;

  return {
    /**
     * Create and publish local camera + microphone tracks (publisher only).
     * Pass a <video> element reference to render the local preview.
     *
     * @param {HTMLVideoElement|null} videoEl   — DOM element for local preview
     * @param {boolean} [enableAudio=true]
     * @param {boolean} [enableVideo=true]
     */
    publishLocalTracks: async (videoEl, enableAudio = true, enableVideo = true) => {
      const tracks = [];

      if (enableAudio) {
        localAudioTrack = await RtcEngine.createMicrophoneAudioTrack();
        tracks.push(localAudioTrack);
      }

      if (enableVideo) {
        localVideoTrack = await RtcEngine.createCameraVideoTrack();
        tracks.push(localVideoTrack);

        // Play local video preview
        if (videoEl) localVideoTrack.play(videoEl);
      }

      if (tracks.length > 0) {
        await client.publish(tracks);
      }

      return { videoTrack: localVideoTrack, audioTrack: localAudioTrack };
    },

    /**
     * Mute / unmute the local microphone.
     * @param {boolean} muted
     */
    setAudioMuted: async (muted) => {
      if (localAudioTrack) await localAudioTrack.setEnabled(!muted);
    },

    /**
     * Enable / disable the local camera.
     * @param {boolean} disabled
     */
    setVideoDisabled: async (disabled) => {
      if (localVideoTrack) await localVideoTrack.setEnabled(!disabled);
    },

    /**
     * Register a callback for when a remote participant publishes media.
     * @param {function} handler — ({ user, videoTrack, audioTrack, mediaType }) => void
     */
    onRemoteUser: (handler) => {
      eventHandlers.onRemoteUser = handler;
    },

    /**
     * Register a callback for when a remote participant leaves.
     * @param {function} handler — ({ user }) => void
     */
    onRemoteUserLeft: (handler) => {
      eventHandlers.onRemoteUserLeft = handler;
    },

    /**
     * Register a callback for connection state changes.
     * @param {function} handler — (state: string) => void
     */
    onConnectionChange: (handler) => {
      eventHandlers.onConnectionChange = handler;
    },

    /**
     * Get the list of currently connected remote users.
     * @returns {Array} Remote user objects
     */
    getRemoteUsers: () => client.remoteUsers,

    /**
     * Leave the channel and release all media resources.
     * Always call this when the call/stream ends.
     */
    leave: async () => {
      localVideoTrack?.close();
      localAudioTrack?.close();
      await client.leave();
    },

    /** Raw client reference (advanced use) */
    _client: client,
  };
};

// ── Live Stream Helpers ───────────────────────────────────────────────────

/**
 * Join as a live stream host (publisher mode, LIVE broadcasting codec).
 * Uses 'live' mode for low-latency broadcast optimisation.
 *
 * @param {string} channelName — Stream session ID
 * @param {number} uid
 * @param {object} [userMeta]
 */
export const joinAsHost = async (channelName, uid, userMeta = {}) => {
  const { rtc_token, app_id } = await getRtcToken(
    channelName, uid, 'publisher',
    userMeta.externalUserId, userMeta.userName, userMeta.preferredLangCd
  );

  const client = RtcEngine.createClient({ mode: 'live', codec: 'vp8' });
  await client.setClientRole('host');

  client.on('connection-state-change', () => {});

  await client.join(app_id, channelName, rtc_token, uid);

  let videoTrack = null;
  let audioTrack = null;

  return {
    /** Publish local camera + microphone and optionally preview in a DOM element */
    startBroadcast: async (videoEl) => {
      audioTrack = await RtcEngine.createMicrophoneAudioTrack();
      videoTrack = await RtcEngine.createCameraVideoTrack();

      if (videoEl) videoTrack.play(videoEl);
      await client.publish([audioTrack, videoTrack]);
    },

    setAudioMuted: async (muted) => {
      if (audioTrack) await audioTrack.setEnabled(!muted);
    },

    setVideoDisabled: async (disabled) => {
      if (videoTrack) await videoTrack.setEnabled(!disabled);
    },

    leave: async () => {
      videoTrack?.close();
      audioTrack?.close();
      await client.leave();
    },

    _client: client,
  };
};

/**
 * Join as a live stream viewer (subscriber mode).
 *
 * @param {string} channelName — Stream session ID
 * @param {number} uid
 * @param {function} onHostPublished — ({ videoTrack, audioTrack }) => void — render the stream
 * @param {object}  [userMeta]
 */
export const joinAsViewer = async (channelName, uid, onHostPublished, userMeta = {}) => {
  const { rtc_token, app_id } = await getRtcToken(
    channelName, uid, 'subscriber',
    userMeta.externalUserId, userMeta.userName, userMeta.preferredLangCd
  );

  const client = RtcEngine.createClient({ mode: 'live', codec: 'vp8' });
  await client.setClientRole('audience');

  // When the host publishes their stream, subscribe and surface it
  client.on('user-published', async (user, mediaType) => {
    await client.subscribe(user, mediaType);

    if (mediaType === 'video' || mediaType === 'audio') {
      onHostPublished({
        videoTrack: user.videoTrack || null,
        audioTrack: user.audioTrack || null,
        mediaType,
        user,
      });
    }
  });

  await client.join(app_id, channelName, rtc_token, uid);

  return {
    leave: async () => {
      await client.leave();
    },
    _client: client,
  };
};

export default { joinChannel, joinAsHost, joinAsViewer, getRtcToken };
