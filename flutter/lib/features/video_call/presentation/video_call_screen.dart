import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/network/rtm_repository.dart';
import '../../../core/network/united_chat_repository.dart';
import '../../../core/realtime/hyperbabel_realtime_client.dart';
import '../../../core/video/hyperbabel_video_client.dart';
import '../../../shared/widgets/glass_container.dart';

/// Full HyperBabel Video call screen: pulls the active session for a room,
/// exchanges an RTC token, joins as broadcaster, and renders the local +
/// remote previews. Covers the lifecycle hooks customers most often need to
/// copy: mute mic / camera, swap camera, hang up (leaves the call session).
///
/// Call upkeep, once the RTC join succeeds:
///   * `joined-rtc` — tells the server the call connected (retried until it
///     lands). Billing and stale-call cleanup rely on it.
///   * `heartbeat` every 60 s — the server ends calls that stop pinging.
///   * `renew-token` when the engine reports its 1-hour token expiring.
///
/// The screen also follows the call's events on the room's real-time channel:
/// it closes on `call_ended`, and a waiting caller gives up on a 1:1 decline
/// or after a 45 s ring with nobody joining.
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

  /// How long a caller waits for anyone to join before giving up.
  static const _ringTimeout = Duration(seconds: 45);
  static const _heartbeatInterval = Duration(seconds: 60);

  /// Pause before hanging up on an emptied call, so near-simultaneous leave /
  /// join events settle first.
  static const _emptyCallGrace = Duration(seconds: 2);

  String? _userId;
  bool _loading = true;
  String? _error;
  bool _muted = false;
  bool _cameraOff = false;
  String? _sessionId;
  String? _channelName;
  int? _localUid;
  int? _remoteUid;

  bool _isCaller = false;
  String _callType = '1to1';

  /// Remote users in the RTC channel right now. Kept by this screen's own
  /// handler, so "is anyone left?" never depends on another listener.
  final Set<int> _remoteUids = <int>{};
  bool _anyRemoteJoined = false;

  /// Set once the screen starts closing — stops retries, timers and a second
  /// exit.
  bool _closing = false;
  Timer? _ringTimer;
  Timer? _heartbeatTimer;
  Timer? _emptyCallTimer;
  StreamSubscription<RealtimeMessage>? _roomSub;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    // Left without the hang-up button (system back, route change): still
    // leave the call, or the server keeps this user "in a call".
    if (!_closing) {
      final sessionId = _sessionId, userId = _userId;
      if (sessionId != null && userId != null) {
        _chat
            .leaveVideoCall(widget.roomId, userId: userId, sessionId: sessionId)
            .catchError((_) {}); // best-effort
      }
    }
    _closing = true;
    _stopUpkeep();
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
    if (!mounted) return;
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
      // Publisher tokens are session-scoped: the server checks that this user is
      // a participant and signs the token with the session's channel + uid, so
      // we join with what the response returns.
      final sessionId = (session['id'] ?? session['session_id']) as String?;
      if (sessionId == null) throw Exception('Session has no id.');
      _sessionId = sessionId;
      // `participants[]` marks who started the call (`is_caller`).
      final me = ((session['participants'] as List?) ?? const [])
          .whereType<Map>()
          .where((p) => p['user_id'] == _userId)
          .firstOrNull;
      _isCaller = me?['is_caller'] == true;
      _callType = (session['call_type'] as String?) ?? '1to1';
      _listenForCallEvents();
      // Nobody joined within 45 s — stop ringing them ("No answer"). Applies
      // to 1:1 and group calls alike.
      if (_isCaller) _startRingTimer();
      final uid = (me?['uid'] as int?) ?? DateTime.now().millisecondsSinceEpoch.remainder(1 << 30);
      final token = await _rtm.rtcToken(
        channelName: channelName,
        uid: uid,
        role: 'publisher',
        sessionId: sessionId,
      );
      if (_closing) return;
      _localUid = (token['uid'] as int?) ?? uid;
      _channelName = (token['channel_name'] as String?) ?? channelName;

      // Step 3 — initialise the engine and register lifecycle handlers
      // before joining so we never miss the first 'remote published' event.
      final engine = await _video.initialize(token['app_id'] as String);
      engine.registerEventHandler(VideoEngineEventHandler(
        onJoinChannelSuccess: (conn, elapsed) {
          // The call is connected on this device: stamp it, then keep it alive.
          _markJoinedRtc();
          _startHeartbeat();
        },
        onUserJoined: (conn, uid, _) {
          // Keep the publishing resolution in step with the call size —
          // HyperBabel meters by the total resolution each participant
          // receives (core/video/video_quality.dart).
          _video.trackRemoteJoined(uid);
          _remoteUids.add(uid);
          _anyRemoteJoined = true;
          _ringTimer?.cancel();
          _emptyCallTimer?.cancel();
          if (mounted) setState(() => _remoteUid = uid);
        },
        onUserOffline: (conn, uid, _) {
          _video.trackRemoteLeft(uid);
          _remoteUids.remove(uid);
          if (_remoteUid == uid && mounted) {
            setState(() => _remoteUid = _remoteUids.firstOrNull);
          }
          // Hang up only when NOBODY is left — a group call goes on when one
          // peer leaves. Re-check after a short grace period.
          if (_remoteUids.isEmpty) {
            _emptyCallTimer?.cancel();
            _emptyCallTimer = Timer(_emptyCallGrace, () {
              if (_remoteUids.isEmpty) _endCall(notice: 'Call ended');
            });
          }
        },
        // RTC tokens last one hour: renew ~30 s before expiry, and again if
        // the engine reports it already expired.
        onTokenPrivilegeWillExpire: (conn, token) => _renewToken(),
        onRequestToken: (conn) => _renewToken(),
        onError: (err, msg) {
          if (mounted) setState(() => _error = 'Video error: $msg');
        },
      ));
      if (_closing) return;

      // Step 4 — join the channel as broadcaster.
      await _video.joinRoom(
        token: token['rtc_token'] as String,
        channelName: channelName,
        uid: _localUid!,
        publisher: true,
      );

      if (mounted) setState(() => _loading = false);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  /// Follow this call on the room's real-time channel — the same channel the
  /// chat screen uses. Cancelling removes only this screen's listener.
  Future<void> _listenForCallEvents() async {
    try {
      final room = await _chat.getRoom(widget.roomId);
      final channel = room['realtime_channel'] as String?;
      if (channel == null || channel.isEmpty || _closing) return;
      final rt = HyperBabelRealtimeClient();
      await rt.connect();
      final sub = await rt.subscribeRoom(channel, _onRoomEvent);
      if (_closing) {
        await sub?.cancel();
        return;
      }
      _roomSub = sub;
    } catch (_) {
      // Best-effort — hang-up, the ring timeout and the engine's "user
      // offline" event still end the call.
    }
  }

  /// (Re)start the caller's 45 s wait for someone to join.
  void _startRingTimer() {
    _ringTimer?.cancel();
    _ringTimer = Timer(_ringTimeout, () {
      if (!_anyRemoteJoined) _endCall(notice: 'No answer');
    });
  }

  void _onRoomEvent(RealtimeMessage event) {
    final call = HyperBabelRealtimeClient.callEventOf(event);
    if (call == null || _sessionId == null || call['session_id'] != _sessionId) {
      return;
    }
    switch (call['event']) {
      case 'call_accepted':
        // Someone answered: give them a fresh 45 s to reach the media
        // channel, so an answer in the last seconds of the ring still
        // connects.
        if (_isCaller && !_anyRemoteJoined && !_closing) _startRingTimer();
        break;
      case 'call_ended':
        // The session is already over on the server — nothing to call.
        _closeScreen(notice: 'Call ended');
        break;
      case 'call_rejected':
      case 'call_missed':
      case 'call_busy':
        // Only a 1:1 caller still waiting gives up here. In a group call one
        // callee declining must not end the call for the others.
        if (_isCaller && _callType == '1to1' && !_anyRemoteJoined) {
          final notice = switch (call['event']) {
            'call_rejected' => 'Declined',
            'call_missed' => 'No answer',
            _ => 'Busy',
          };
          _endCall(notice: notice);
        }
        break;
    }
  }

  /// Stamp `joined_rtc_at`. `matched: false` means it did not land yet (for
  /// example the callee's accept is still being stored): retry up to 5 times,
  /// 2 s apart, unless the user has left.
  Future<void> _markJoinedRtc() async {
    for (var attempt = 0; attempt <= 5; attempt++) {
      if (attempt > 0) await Future<void>.delayed(const Duration(seconds: 2));
      final sessionId = _sessionId, userId = _userId;
      if (_closing || sessionId == null || userId == null) return;
      final matched = await _chat
          .markJoinedRtc(widget.roomId, userId: userId, sessionId: sessionId)
          .catchError((_) => false);
      if (matched) return;
    }
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _sendHeartbeat();
    _heartbeatTimer =
        Timer.periodic(_heartbeatInterval, (_) => _sendHeartbeat());
  }

  void _sendHeartbeat() {
    final sessionId = _sessionId, userId = _userId;
    if (_closing || sessionId == null || userId == null) return;
    _chat
        .sendCallHeartbeat(widget.roomId, userId: userId, sessionId: sessionId)
        .catchError((_) {}); // A missed ping is harmless; the next one follows.
  }

  Future<void> _renewToken() async {
    final sessionId = _sessionId, userId = _userId;
    if (_closing || sessionId == null || userId == null) return;
    try {
      final res = await _chat.renewCallToken(widget.roomId,
          userId: userId, sessionId: sessionId);
      final token = res['rtc_token'] as String?;
      if (token != null && !_closing) await _video.renewToken(token);
    } catch (_) {
      // 404 = the call is no longer live; its `call_ended` closes the screen.
    }
  }

  void _stopUpkeep() {
    _ringTimer?.cancel();
    _heartbeatTimer?.cancel();
    _emptyCallTimer?.cancel();
    _roomSub?.cancel();
    _roomSub = null;
  }

  Future<void> _hangup() => _endCall();

  /// Leave the call session (the server ends it once at most one active
  /// participant remains), tear down and exit. [notice] says why when the
  /// exit was automatic.
  Future<void> _endCall({String? notice}) async {
    if (_closing) return;
    _closing = true;
    final sessionId = _sessionId;
    if (_userId != null && sessionId != null) {
      // Leave the CALL session — never POST /rooms/:id/leave here, which
      // would take the user out of the chat room instead.
      await _chat
          .leaveVideoCall(widget.roomId, userId: _userId!, sessionId: sessionId)
          .catchError((_) {}); // best-effort
    }
    await _exit(notice);
  }

  /// The call already ended on the server: tear down and exit, no API call.
  Future<void> _closeScreen({String? notice}) async {
    if (_closing) return;
    _closing = true;
    await _exit(notice);
  }

  Future<void> _exit(String? notice) async {
    _stopUpkeep();
    try {
      await _video.dispose();
    } catch (_) {}
    if (!mounted) return;
    if (notice != null) {
      ScaffoldMessenger.maybeOf(context)
          ?.showSnackBar(SnackBar(content: Text(notice)));
    }
    context.go('/home');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Remote view (background) ─────────────────────────────────────────
          // Not while closing: the engine is released before navigation ends.
          if (_remoteUid != null && _channelName != null && !_closing)
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
          if (_localUid != null && !_loading && _error == null && !_closing)
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
