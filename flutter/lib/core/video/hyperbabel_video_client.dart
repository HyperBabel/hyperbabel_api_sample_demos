import 'package:agora_rtc_engine/agora_rtc_engine.dart' as video_sdk;
// The vendor SDK is imported under the neutral `video_sdk` alias and never
// referenced by its raw name elsewhere in this file.

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
    _isInit = true;
    return _engine!;
  }

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
  }

  /// Tear down the engine completely. Call on screen dispose.
  Future<void> dispose() async {
    if (!_isInit) return;
    await _engine?.leaveChannel();
    await _engine?.release();
    _engine = null;
    _isInit = false;
  }
}
