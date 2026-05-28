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

export {
  createVideoEngine,
  RtcSurfaceView,
  VideoSourceType,
  ClientRoleType,
  ChannelProfileType,
};
export type { IRtcEngine, RtcConnection, IRtcEngineEventHandler };

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

  async join(options: RtcJoinOptions, handlers: RtcEventHandlers = {}): Promise<void> {
    const engine = createVideoEngine();
    this.engine  = engine;

    const profile =
      options.role === 'publisher'
        ? ChannelProfileType.ChannelProfileCommunication
        : ChannelProfileType.ChannelProfileLiveBroadcasting;

    engine.initialize({ appId: options.appId, channelProfile: profile });

    const eventHandler: IRtcEngineEventHandler = {
      onJoinChannelSuccess: (_conn: RtcConnection) => handlers.onJoined?.(),
      onUserJoined:  (_conn: RtcConnection, uid: number) => handlers.onUserJoined?.(uid),
      onUserOffline: (_conn: RtcConnection, uid: number) => handlers.onUserLeft?.(uid),
      onError:       (code: number) => handlers.onError?.(code),
    };
    engine.registerEventHandler(eventHandler);
    engine.enableVideo();

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
  }

  release(): void {
    this.engine?.release();
    this.engine = null;
  }
}
