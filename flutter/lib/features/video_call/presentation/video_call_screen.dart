import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/network/rtm_repository.dart';
import '../../../core/network/united_chat_repository.dart';
import '../../../core/video/hyperbabel_video_client.dart';
import '../../../shared/widgets/glass_container.dart';

/// Full HyperBabel Video call screen: pulls the active session for a room,
/// exchanges an RTC token, joins as broadcaster, and renders the local +
/// remote previews. Covers the lifecycle hooks customers most often need to
/// copy: mute mic / camera, swap camera, hang up.
class VideoCallScreen extends StatefulWidget {
  const VideoCallScreen({super.key, required this.roomId});

  final String roomId;

  @override
  State<VideoCallScreen> createState() => _VideoCallScreenState();
}

class _VideoCallScreenState extends State<VideoCallScreen> {
  final UnitedChatRepository _chat = UnitedChatRepository();
  final RtmRepository _rtm = RtmRepository();
  final HyperBabelVideoClient _video = HyperBabelVideoClient();

  String? _userId;
  bool _loading = true;
  String? _error;
  bool _muted = false;
  bool _cameraOff = false;
  String? _channelName;
  int? _localUid;
  int? _remoteUid;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _video.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    _userId = prefs.getString('hb_user_id');
    if (_userId == null) {
      if (mounted) context.go('/login');
      return;
    }
    await Permission.camera.request();
    await Permission.microphone.request();
    await _join();
  }

  Future<void> _join() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // Step 1 — find the active session for this room.
      final active = await _chat.getActiveVideoCall(widget.roomId);
      final session = (active?['session']) as Map<String, dynamic>?;
      if (session == null) {
        throw Exception('No active video call session for this room.');
      }
      final channelName = session['channel_name'] as String?;
      if (channelName == null) throw Exception('Session has no channel.');
      _channelName = channelName;

      // Step 2 — exchange a publisher RTC token.
      final uid = (session['uid'] as int?) ?? DateTime.now().millisecondsSinceEpoch.remainder(1 << 30);
      final token = await _rtm.rtcToken(
        channelName: channelName,
        uid: uid,
        role: 'publisher',
      );
      _localUid = (token['uid'] as int?) ?? uid;

      // Step 3 — initialise the engine and register lifecycle handlers
      // before joining so we never miss the first 'remote published' event.
      final engine = await _video.initialize(token['app_id'] as String);
      engine.registerEventHandler(VideoEngineEventHandler(
        onUserJoined: (conn, uid, _) {
          setState(() => _remoteUid = uid);
        },
        onUserOffline: (conn, uid, _) {
          if (_remoteUid == uid) setState(() => _remoteUid = null);
        },
        onError: (err, msg) {
          setState(() => _error = 'Video error: $msg');
        },
      ));

      // Step 4 — join the channel as broadcaster.
      await _video.joinRoom(
        token: token['rtc_token'] as String,
        channelName: channelName,
        uid: _localUid!,
        publisher: true,
      );

      setState(() => _loading = false);
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _hangup() async {
    try {
      if (_userId != null) {
        await _chat
            .leaveRoom(widget.roomId, _userId!) // best-effort
            .catchError((_) {});
      }
      await _video.dispose();
    } catch (_) {}
    if (!mounted) return;
    context.go('/home');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Remote view (background) ─────────────────────────────────────────
          if (_remoteUid != null && _channelName != null)
            VideoView(
              controller: VideoViewController.remote(
                rtcEngine: _video.engine,
                canvas: VideoCanvas(uid: _remoteUid),
                connection: VideoChannelConnection(channelId: _channelName!),
              ),
            )
          else
            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.person, size: 100, color: Colors.white.withOpacity(0.3)),
                  const SizedBox(height: 12),
                  Text(
                    _loading
                        ? 'Connecting…'
                        : (_error != null
                            ? _error!
                            : 'Waiting for the other side to join…'),
                    style: const TextStyle(color: Colors.white70),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),

          // Local self-preview (top-right) ──────────────────────────────────
          if (_localUid != null && !_loading && _error == null)
            Positioned(
              top: 50,
              right: 20,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                  width: 100,
                  height: 150,
                  child: VideoView(
                    controller: VideoViewController(
                      rtcEngine: _video.engine,
                      canvas: const VideoCanvas(uid: 0),
                    ),
                  ),
                ),
              ),
            ),

          // Action bar (bottom) ─────────────────────────────────────────────
          Align(
            alignment: Alignment.bottomCenter,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.only(bottom: 24.0),
                child: GlassContainer(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                  borderRadius: 30,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        icon: Icon(_muted ? Icons.mic_off : Icons.mic, color: Colors.white),
                        onPressed: () async {
                          await _video.setMicMuted(!_muted);
                          setState(() => _muted = !_muted);
                        },
                      ),
                      const SizedBox(width: 16),
                      IconButton(
                        icon: Icon(
                            _cameraOff ? Icons.videocam_off : Icons.videocam,
                            color: Colors.white),
                        onPressed: () async {
                          await _video.setCameraMuted(!_cameraOff);
                          setState(() => _cameraOff = !_cameraOff);
                        },
                      ),
                      const SizedBox(width: 16),
                      IconButton(
                        icon: const Icon(Icons.cameraswitch, color: Colors.white),
                        onPressed: _video.switchCamera,
                      ),
                      const SizedBox(width: 16),
                      Container(
                        decoration: const BoxDecoration(
                          color: Colors.redAccent,
                          shape: BoxShape.circle,
                        ),
                        child: IconButton(
                          icon: const Icon(Icons.call_end, color: Colors.white),
                          onPressed: _hangup,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
