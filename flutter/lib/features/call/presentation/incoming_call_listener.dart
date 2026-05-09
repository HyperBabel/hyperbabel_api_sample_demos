import 'dart:async';

import 'package:ably_flutter/ably_flutter.dart' as auth_realtime;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/network/united_chat_repository.dart';
import '../../../core/realtime/hyperbabel_realtime_client.dart';
import '../../../core/theme/app_theme.dart';

/// Wraps the app shell and listens on the user's HyperBabel private channel
/// for `CALL_INVITE` events. When one arrives, a fullscreen Accept / Reject
/// overlay slides in over whatever screen the user is on.
///
/// Mounted once near the root of the widget tree (see [main.dart]).
class IncomingCallListener extends StatefulWidget {
  const IncomingCallListener({super.key, required this.child});

  final Widget child;

  @override
  State<IncomingCallListener> createState() => _IncomingCallListenerState();
}

class _IncomingCallListenerState extends State<IncomingCallListener> {
  final UnitedChatRepository _repo = UnitedChatRepository();
  StreamSubscription<auth_realtime.Message>? _sub;
  Map<String, dynamic>? _incoming;
  String? _userId;

  @override
  void initState() {
    super.initState();
    _attach();
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  Future<void> _attach() async {
    final prefs = await SharedPreferences.getInstance();
    _userId = prefs.getString('hb_user_id');
    final apiKey = prefs.getString('hb_api_key');
    if (_userId == null || apiKey == null) return;

    try {
      final rt = HyperBabelRealtimeClient();
      await rt.connect();
      _sub = await rt.subscribePrivate((event) {
        if (event.name != 'CALL_INVITE' && event.name != 'video_call.started') {
          return;
        }
        final raw = event.data;
        if (raw is! Map) return;
        setState(() => _incoming = Map<String, dynamic>.from(raw));
      });
    } catch (_) {
      // Best-effort — the overlay simply never shows if Real-Time is unavailable.
    }
  }

  Future<void> _accept() async {
    final invite = _incoming;
    if (invite == null) return;
    final roomId = (invite['room_id'] ?? invite['roomId']) as String?;
    setState(() => _incoming = null);
    if (!mounted || roomId == null) return;
    // The video screen handles the RTC join. A production app would also
    // call /video-call/accept here so the server transitions the session;
    // the included video screen is a skeleton so we keep this minimal.
    context.go('/video/$roomId');
  }

  Future<void> _reject() async {
    final invite = _incoming;
    if (invite == null || _userId == null) return;
    final roomId = (invite['room_id'] ?? invite['roomId']) as String?;
    setState(() => _incoming = null);
    if (roomId == null) return;
    try {
      await _repo.rejectVideoCall(roomId, _userId!);
    } catch (_) {
      // Fire-and-forget: caller will hit timeout if the network is gone.
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        widget.child,
        if (_incoming != null) _buildOverlay(_incoming!),
      ],
    );
  }

  Widget _buildOverlay(Map<String, dynamic> invite) {
    final caller = (invite['caller_name'] ?? invite['caller_id'] ?? 'Unknown') as String;
    final roomId = (invite['room_id'] ?? invite['roomId'] ?? '') as String;
    final callType = (invite['call_type'] ?? invite['callType'] ?? '1to1') as String;
    return Material(
      color: Colors.black.withOpacity(0.85),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.videocam, size: 80, color: AppTheme.primaryAccent),
              const SizedBox(height: 16),
              Text('Incoming $callType call',
                  style: const TextStyle(color: Colors.white70, fontSize: 14)),
              const SizedBox(height: 4),
              Text(caller,
                  style: const TextStyle(
                      color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text('Room: $roomId',
                  style: const TextStyle(color: Colors.white38, fontSize: 11)),
              const SizedBox(height: 32),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _circleBtn(
                    color: Colors.red,
                    icon: Icons.call_end,
                    label: 'Reject',
                    onTap: _reject,
                  ),
                  _circleBtn(
                    color: Colors.green,
                    icon: Icons.call,
                    label: 'Accept',
                    onTap: _accept,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _circleBtn({
    required Color color,
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return Column(
      children: [
        InkWell(
          onTap: onTap,
          customBorder: const CircleBorder(),
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            child: Icon(icon, color: Colors.white, size: 32),
          ),
        ),
        const SizedBox(height: 8),
        Text(label, style: const TextStyle(color: Colors.white)),
      ],
    );
  }
}
