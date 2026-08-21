/**
 * HyperBabel Demo — RTC Service (HyperBabel Video)
 *
 * Capabilities:
 *  - Create and manage a HyperBabel Video engine instance
 *  - Join a channel as publisher (video call) or subscriber (stream viewer)
 *  - Handle remote user tracking events
 *  - Provide control helpers: mute, camera toggle, flip, switch role
 *
 * The vendor SDK is imported by package name; specific symbols are renamed
 * via `import as` so the body of this file and every downstream consumer
 * only talks about HyperBabel concepts. Screens MUST import all video-RTC
 * symbols from this module rather than the vendor package directly.
 */

import {
  createAgoraRtcEngine as createVideoEngine,
  IRtcEngine,
  RtcConnection,
  RtcSurfaceView,
  VideoSourceType,
  ClientRoleType,
  ChannelProfileType,
  IRtcEngineEventHandler,
} from 'react-native-agora';

import { encoderConfigForRemoteCount } from './videoQuality';

export {
  createVideoEngine,
  RtcSurfaceView,
  VideoSourceType,
  ClientRoleType,
  ChannelProfileType,
};
export type { IRtcEngine, RtcConnection, IRtcEngineEventHandler };

export { declaredQuality } from './videoQuality';

export type RtcRole = 'publisher' | 'subscriber';

export interface RtcJoinOptions {
  appId:       string;
  channelName: string;
  token:       string;
  uid:         number;
  role:        RtcRole;
}

export interface RtcEventHandlers {
  onJoined?:       () => void;
  onUserJoined?:   (uid: number) => void;
  onUserLeft?:     (uid: number) => void;
  onError?:        (code: number) => void;
}

/**
 * RtcClient — lifecycle wrapper for a single HyperBabel Video engine.
 * Create one per screen, call join() to enter the channel,
 * and always call release() in the component's cleanup effect.
 */
export class RtcClient {
  private engine: IRtcEngine | null = null;

  /*
   * Remote participants currently in the channel, by uid.
   *
   * HyperBabel meters video by the total resolution each participant
   * RECEIVES, so the publishing resolution has to follow the call size —
   * see services/videoQuality.ts for the budget and the presets. This matters
   * more on mobile than on web: the SDK default (960x540) already exceeds the
   * HD ceiling from three participants up.
   *
   * Membership is tracked from onUserJoined / onUserOffline rather than from
   * who publishes video: a participant sitting in the call with the camera off
   * can switch it on at any moment, and the frames around that moment must
   * already be sized for them. Over-counting lowers the resolution (safe);
   * under-counting is what pushes a call above the tier it declared.
   */
  private remoteUids = new Set<number>();

  /**
   * Apply the publishing preset for the current call size.
   *
   * Failures are surfaced, never swallowed: if the downshift does not land the
   * call keeps publishing large, and every participant's received total moves
   * into a higher (more expensive) tier than the one declared at session
   * creation.
   */
  private applyEncoderForCurrentCall(): void {
    const engine = this.engine;
    if (!engine) return;
    const cfg = encoderConfigForRemoteCount(this.remoteUids.size);
    try {
      engine.setVideoEncoderConfiguration(cfg);
    } catch (err) {
      console.warn(
        `[rtc] could not apply ${cfg.dimensions.width}x${cfg.dimensions.height} for ` +
          `${this.remoteUids.size} remote participant(s) — the call may exceed the declared tier`,
        err,
      );
    }
  }

  async join(options: RtcJoinOptions, handlers: RtcEventHandlers = {}): Promise<void> {
    const engine = createVideoEngine();
    this.engine  = engine;
    this.remoteUids.clear();

    const profile =
      options.role === 'publisher'
        ? ChannelProfileType.ChannelProfileCommunication
        : ChannelProfileType.ChannelProfileLiveBroadcasting;

    engine.initialize({ appId: options.appId, channelProfile: profile });

    const eventHandler: IRtcEngineEventHandler = {
      onJoinChannelSuccess: (_conn: RtcConnection) => handlers.onJoined?.(),
      onUserJoined: (_conn: RtcConnection, uid: number) => {
        this.remoteUids.add(uid);
        this.applyEncoderForCurrentCall();
        handlers.onUserJoined?.(uid);
      },
      onUserOffline: (_conn: RtcConnection, uid: number) => {
        this.remoteUids.delete(uid);
        this.applyEncoderForCurrentCall();
        handlers.onUserLeft?.(uid);
      },
      onError:       (code: number) => handlers.onError?.(code),
    };
    engine.registerEventHandler(eventHandler);
    engine.enableVideo();
    // Size the first published frame before joining — a late joiner walks into
    // an already-populated channel and must not send one oversized frame.
    this.applyEncoderForCurrentCall();

    if (options.role === 'subscriber') {
      engine.setClientRole(ClientRoleType.ClientRoleAudience);
    }

    await engine.joinChannel(
      options.token,
      options.channelName,
      options.uid,
      {
        clientRoleType:
          options.role === 'publisher'
            ? ClientRoleType.ClientRoleBroadcaster
            : ClientRoleType.ClientRoleAudience,
      },
    );
  }

  muteAudio(muted: boolean): void {
    this.engine?.muteLocalAudioStream(muted);
  }

  muteVideo(muted: boolean): void {
    this.engine?.muteLocalVideoStream(muted);
  }

  flipCamera(): void {
    this.engine?.switchCamera();
  }

  async leave(): Promise<void> {
    await this.engine?.leaveChannel();
    this.remoteUids.clear();
  }

  release(): void {
    this.engine?.release();
    this.engine = null;
    this.remoteUids.clear();
  }
}
