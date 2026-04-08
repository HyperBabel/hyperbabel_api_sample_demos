/**
 * HyperBabel Demo — RTC Service (HyperBabel Video RTC)
 *
 * Capabilities:
 *  - Create and manage an Agora engine instance
 *  - Join a channel as publisher (video call) or subscriber (stream viewer)
 *  - Handle remote user tracking events
 *  - Provide control helpers: mute, camera toggle, flip, switch role
 */

import {
  createAgoraRtcEngine,
  IRtcEngine,
  RtcConnection,
  RtcSurfaceView,
  VideoSourceType,
  ClientRoleType,
  ChannelProfileType,
  IRtcEngineEventHandler,
} from 'react-native-agora';

export { RtcSurfaceView, VideoSourceType, ClientRoleType, ChannelProfileType };

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
 * RtcClient — lifecycle wrapper for a single Agora engine instance.
 * Create one per screen, call join() to enter the channel,
 * and always call release() in the component's cleanup effect.
 */
export class RtcClient {
  private engine: IRtcEngine | null = null;

  async join(options: RtcJoinOptions, handlers: RtcEventHandlers = {}): Promise<void> {
    const engine = createAgoraRtcEngine();
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
