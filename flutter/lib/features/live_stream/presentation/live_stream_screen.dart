import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/network/stream_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/video/hyperbabel_video_client.dart';
import '../../../shared/widgets/glass_container.dart';

/// Tri-mode Live Stream surface:
///   - **list**: discover currently-active sessions
///   - **host**: create a new session, broadcast as publisher
///   - **viewer**: subscribe to an existing session as audience
///
/// Picks the right HyperBabel Video role based on which path the user takes,
/// then mounts the local / remote canvas accordingly.
class LiveStreamScreen extends StatefulWidget {
  const LiveStreamScreen({super.key});

  @override
  State<LiveStreamScreen> createState() => _LiveStreamScreenState();
}

enum _Mode { list, host, viewer }

class _LiveStreamScreenState extends State<LiveStreamScreen> {
  final StreamRepository _stream = StreamRepository();
  final HyperBabelVideoClient _video = HyperBabelVideoClient();

  String? _userId;
  _Mode _mode = _Mode.list;
  bool _busy = false;
  String? _error;
  String? _channelName;
  int? _localUid;
  int? _remoteUid;
  String? _activeSessionId;
  List<Map<String, dynamic>> _sessions = [];

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
    await _refreshSessions();
  }

  Future<void> _refreshSessions() async {
    try {
      final list = await _stream.listSessions();
      setState(() => _sessions = list);
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  Future<void> _startHosting() async {
    if (_userId == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await Permission.camera.request();
      await Permission.microphone.request();
      final session = await _stream.createSession(
        hostUserId: _userId!,
        hostName: _userId!,
        title: 'Live from ${_userId!}',
      );
      _activeSessionId = (session['session_id'] ?? session['id']) as String?;
      _channelName = session['channel_name'] as String?;
      final appId = session['app_id'] as String?;
      final rtcToken = session['rtc_token'] as String?;
      if (_channelName == null || appId == null || rtcToken == null) {
        throw Exception('Server did not return RTC details for the session.');
      }
      _localUid = (session['uid'] as int?) ?? 0;
      // Live broadcasting profile.
      await _video.initialize(appId, liveStream: true);
      await _video.joinRoom(
        token: rtcToken,
        channelName: _channelName!,
        uid: _localUid!,
        publisher: true,
      );
      if (_activeSessionId != null) {
        await _stream.startSession(_activeSessionId!, _userId!);
      }
      setState(() {
        _mode = _Mode.host;
        _busy = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _busy = false;
      });
    }
  }

  Future<void> _watch(Map<String, dynamic> session) async {
    if (_userId == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final sessionId = (session['session_id'] ?? session['id']) as String?;
      if (sessionId == null) throw Exception('Session has no id.');
      final tok = await _stream.viewerToken(sessionId, _userId!);
      _channelName = tok['channel_name'] as String? ?? session['channel_name'] as String?;
      final appId = tok['app_id'] as String?;
      final rtcToken = tok['rtc_token'] as String?;
      if (_channelName == null || appId == null || rtcToken == null) {
        throw Exception('Viewer token missing RTC fields.');
      }
      // Audience role on a liveBroadcasting profile.
      final engine = await _video.initialize(appId, liveStream: true);
      engine.registerEventHandler(VideoEngineEventHandler(
        onUserJoined: (conn, uid, _) => setState(() => _remoteUid = uid),
        onUserOffline: (conn, uid, _) {
          if (_remoteUid == uid) setState(() => _remoteUid = null);
        },
      ));
      await _video.joinRoom(
        token: rtcToken,
        channelName: _channelName!,
        uid: (tok['uid'] as int?) ?? 0,
        publisher: false,
      );
      _activeSessionId = sessionId;
      setState(() {
        _mode = _Mode.viewer;
        _busy = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _busy = false;
      });
    }
  }

  Future<void> _leave() async {
    try {
      if (_mode == _Mode.host && _activeSessionId != null && _userId != null) {
        await _stream.endSession(_activeSessionId!, _userId!).catchError((_) {});
      }
      await _video.dispose();
    } catch (_) {}
    setState(() {
      _mode = _Mode.list;
      _channelName = null;
      _localUid = null;
      _remoteUid = null;
      _activeSessionId = null;
    });
    await _refreshSessions();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: _mode == _Mode.list
          ? AppBar(
              backgroundColor: Colors.transparent,
              title: const Text('Live Streams'),
              leading: IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => context.go('/home'),
              ),
              actions: [
                IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: _refreshSessions,
                ),
              ],
            )
          : null,
      body: switch (_mode) {
        _Mode.list   => _buildList(),
        _Mode.host   => _buildBroadcasting(),
        _Mode.viewer => _buildWatching(),
      },
      floatingActionButton: _mode == _Mode.list
          ? FloatingActionButton.extended(
              onPressed: _busy ? null : _startHosting,
              icon: const Icon(Icons.live_tv),
              label: Text(_busy ? '…' : 'Go Live'),
            )
          : null,
    );
  }

  Widget _buildList() {
    return RefreshIndicator(
      onRefresh: _refreshSessions,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(_error!, style: const TextStyle(color: Colors.redAccent)),
            ),
          if (_sessions.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: Text(
                  'Nobody is streaming right now — tap “Go Live” to host one.',
                  style: TextStyle(color: Colors.white54),
                  textAlign: TextAlign.center,
                ),
              ),
            )
          else
            ..._sessions.map((s) => _buildSessionCard(s)),
          const SizedBox(height: 80),
        ],
      ),
    );
  }

  Widget _buildSessionCard(Map<String, dynamic> session) {
    final title = (session['title'] ?? 'Untitled stream') as String;
    final hostName = (session['host_name'] ?? session['host_user_id'] ?? '—') as String;
    final viewers = session['viewer_count'] ?? '—';
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: _busy ? null : () => _watch(session),
        borderRadius: BorderRadius.circular(14),
        child: GlassContainer(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppTheme.primaryAccent.withOpacity(0.25),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.live_tv, color: AppTheme.primaryAccent),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    Text('Host: $hostName  ·  $viewers viewers',
                        style: const TextStyle(color: Colors.white54, fontSize: 12)),
                  ],
                ),
              ),
              const Icon(Icons.play_arrow, color: Colors.white30),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBroadcasting() {
    return Stack(
      children: [
        if (_localUid != null)
          VideoView(
            controller: VideoViewController(
              rtcEngine: _video.engine,
              canvas: const VideoCanvas(uid: 0),
            ),
          )
        else
          const Center(child: CircularProgressIndicator()),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                GlassContainer(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  borderRadius: 20,
                  child: const Row(
                    children: [
                      Icon(Icons.fiber_manual_record, color: Colors.redAccent, size: 12),
                      SizedBox(width: 6),
                      Text('LIVE',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.cameraswitch, color: Colors.white),
                  onPressed: _video.switchCamera,
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.white),
                  onPressed: _leave,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildWatching() {
    return Stack(
      children: [
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
                Icon(Icons.live_tv, size: 80, color: Colors.white.withOpacity(0.3)),
                const SizedBox(height: 12),
                const Text('Waiting for the host…',
                    style: TextStyle(color: Colors.white70)),
              ],
            ),
          ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Align(
              alignment: Alignment.topRight,
              child: IconButton(
                icon: const Icon(Icons.close, color: Colors.white),
                onPressed: _leave,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
