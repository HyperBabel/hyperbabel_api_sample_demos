import 'package:agora_rtc_engine/agora_rtc_engine.dart' as video_sdk;
// The vendor SDK is imported under the neutral `video_sdk` alias and never
// referenced by its raw name elsewhere in this file.

import 'video_quality.dart';

export 'video_quality.dart' show VideoQuality, VideoQualityTier, VideoQualityTierWire;

// Re-exports — every other file uses these neutral names instead of the
// vendor's so the demo body never mentions the SDK directly.
typedef VideoView                 = video_sdk.AgoraVideoView;
typedef VideoViewController       = video_sdk.VideoViewController;
typedef VideoCanvas               = video_sdk.VideoCanvas;
typedef VideoChannelConnection    = video_sdk.RtcConnection;
typedef VideoEngineEventHandler   = video_sdk.RtcEngineEventHandler;

/// HyperBabel Video Client for managing live 1:1 / group video calls and
/// stream sessions. The wrapper exposes only HyperBabel concepts (publisher /
/// subscriber, broadcaster role, channel name) — the underlying RTC SDK is
/// never named in callers.
class HyperBabelVideoClient {
  static final HyperBabelVideoClient _instance = HyperBabelVideoClient._internal();
  factory HyperBabelVideoClient() => _instance;

  video_sdk.RtcEngine? _engine;
  bool _isInit = false;

  /// Remote participants currently in the channel, by uid.
  ///
  /// HyperBabel meters video by the total resolution each participant
  /// RECEIVES, so the publishing resolution has to follow the call size — see
  /// `video_quality.dart` for the budget and the presets. This matters more on
  /// mobile than on web: the SDK default (960x540) already exceeds the HD
  /// ceiling from three participants up.
  ///
  /// Membership is tracked by channel presence, not by who publishes video: a
  /// participant sitting in the call with the camera off can switch it on at
  /// any moment, and the frames around that moment must already be sized for
  /// them. Over-counting lowers the resolution (safe); under-counting is what
  /// pushes a call above the tier it declared.
  final Set<int> _remoteUids = <int>{};

  HyperBabelVideoClient._internal();

  /// Allocate the underlying RTC engine. Wrapped so the vendor entry point
  /// stays out of the call sites below.
  video_sdk.RtcEngine _createVideoEngine() => video_sdk.createAgoraRtcEngine();

  /// Initialize the HyperBabel Video engine with the given app id and
  /// channel profile (`communication` for 1:1 calls, `liveBroadcasting` for
  /// streams).
  Future<video_sdk.RtcEngine> initialize(
    String appId, {
    bool liveStream = false,
  }) async {
    if (_isInit && _engine != null) return _engine!;
    _engine = _createVideoEngine();
    await _engine!.initialize(video_sdk.RtcEngineContext(
      appId: appId,
      channelProfile: liveStream
          ? video_sdk.ChannelProfileType.channelProfileLiveBroadcasting
          : video_sdk.ChannelProfileType.channelProfileCommunication,
    ));
    await _engine!.enableVideo();
    // Size the first published frame before anyone joins. `applyEncoder` is
    // called again whenever the roster changes — see [trackRemoteJoined] /
    // [trackRemoteLeft], which callers must wire into their event handler.
    await applyEncoder();
    _isInit = true;
    return _engine!;
  }

  /// Re-apply the publishing preset for the current call size.
  ///
  /// Failures are surfaced, never swallowed: if the downshift does not land the
  /// call keeps publishing large, and every participant's received total moves
  /// into a higher (more expensive) tier than the one declared at session
  /// creation.
  Future<void> applyEncoder() async {
    final e = _engine;
    if (e == null) return;
    final cfg = VideoQuality.encoderForRemoteCount(_remoteUids.length);
    try {
      await e.setVideoEncoderConfiguration(cfg);
    } catch (err) {
      // ignore: avoid_print
      print(
        '[HyperBabelVideo] could not apply '
        '${cfg.dimensions?.width}x${cfg.dimensions?.height} for '
        '${_remoteUids.length} remote participant(s) — '
        'the call may exceed the declared tier: $err',
      );
    }
  }

  /// Call from `onUserJoined`. Keeps the publishing resolution in step with
  /// the call size.
  Future<void> trackRemoteJoined(int uid) async {
    if (_remoteUids.add(uid)) await applyEncoder();
  }

  /// Call from `onUserOffline`.
  Future<void> trackRemoteLeft(int uid) async {
    if (_remoteUids.remove(uid)) await applyEncoder();
  }

  /// The billing tier to declare when creating a session, derived from the
  /// same presets this client publishes with.
  String declaredQuality() => VideoQuality.declaredQualityWire();

  video_sdk.RtcEngine get engine {
    final e = _engine;
    if (e == null) {
      throw StateError('HyperBabelVideo not initialised — call initialize first.');
    }
    return e;
  }

  /// Join a session as broadcaster (publish video) or audience (subscribe).
  Future<void> joinRoom({
    required String token,
    required String channelName,
    required int uid,
    bool publisher = true,
  }) async {
    final e = engine;
    final role = publisher
        ? video_sdk.ClientRoleType.clientRoleBroadcaster
        : video_sdk.ClientRoleType.clientRoleAudience;
    await e.joinChannel(
      token: token,
      channelId: channelName,
      uid: uid,
      options: video_sdk.ChannelMediaOptions(
        clientRoleType: role,
        publishCameraTrack: publisher,
        publishMicrophoneTrack: publisher,
        autoSubscribeAudio: true,
        autoSubscribeVideo: true,
      ),
    );
    if (publisher) {
      await e.startPreview();
    }
  }

  /// Toggle the local microphone.
  Future<void> setMicMuted(bool muted) async {
    await engine.muteLocalAudioStream(muted);
  }

  /// Toggle the local camera.
  Future<void> setCameraMuted(bool muted) async {
    await engine.muteLocalVideoStream(muted);
  }

  /// Swap front / back cameras.
  Future<void> switchCamera() async {
    await engine.switchCamera();
  }

  /// Leave the channel without releasing the engine — useful when going
  /// from one session straight into another.
  Future<void> leaveRoom() async {
    if (_isInit) await _engine?.leaveChannel();
    _remoteUids.clear();
  }

  /// Tear down the engine completely. Call on screen dispose.
  Future<void> dispose() async {
    if (!_isInit) return;
    await _engine?.leaveChannel();
    await _engine?.release();
    _engine = null;
    _isInit = false;
    _remoteUids.clear();
  }
}
