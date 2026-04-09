import 'package:agora_rtc_engine/agora_rtc_engine.dart';
// Abstracting the vendor into HyperBabel terminology.

/// HyperBabel Video Client for managing live 1:1 and group video calls.
class HyperBabelVideoClient {
  static final HyperBabelVideoClient _instance = HyperBabelVideoClient._internal();
  factory HyperBabelVideoClient() => _instance;

  late RtcEngine _engine;
  bool _isInit = false;

  HyperBabelVideoClient._internal();

  /// Initialize the HyperBabel Video engine.
  Future<void> initialize(String appId) async {
    if (_isInit) return;
    _engine = createAgoraRtcEngine();
    await _engine.initialize(RtcEngineContext(
      appId: appId,
      channelProfile: ChannelProfileType.channelProfileCommunication,
    ));
    await _engine.enableVideo();
    _isInit = true;
  }

  RtcEngine get engine => _engine;

  /// Join a session room
  Future<void> joinRoom({
    required String token,
    required String channelName,
    required int uid,
  }) async {
    await _engine.joinChannel(
      token: token,
      channelId: channelName,
      uid: uid,
      options: const ChannelMediaOptions(
        clientRoleType: ClientRoleType.clientRoleBroadcaster,
      ),
    );
  }

  /// Leave and cleanup
  Future<void> leaveRoom() async {
    await _engine.leaveChannel();
  }

  /// Destroys the engine upon completion
  Future<void> dispose() async {
    if (_isInit) {
      await _engine.release();
      _isInit = false;
    }
  }
}
