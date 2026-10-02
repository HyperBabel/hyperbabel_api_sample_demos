import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/network/united_chat_repository.dart';
import '../../../core/realtime/hyperbabel_realtime_client.dart';
import '../../../core/theme/app_theme.dart';

/// Wraps the app shell and listens on the signed-in user's HyperBabel private
/// channel (`user:{orgId}:{userId}`) for incoming calls. The server publishes
/// every call signal under the real-time message name `signal`; the payload's
/// `type` tells them apart, and `CALL_INVITE` is the one that rings. When it
/// arrives, a fullscreen Accept / Reject overlay slides in over whatever
/// screen the user is on.
///
/// While it rings, the overlay follows the invite's room channel
/// (`roomSignalChannel`): it closes on `call_ended` (the caller hung up), and
/// after 45 s unanswered it records a missed call and closes.
///
/// Mounted once near the root of the widget tree (see [main.dart]), ABOVE the
/// router — so it cannot navigate with `context.go`; [onJoinCall] does that.
class IncomingCallListener extends StatefulWidget {
  const IncomingCallListener({
    super.key,
    required this.userId,
    required this.onJoinCall,
    required this.child,
  });

  /// The signed-in user's id, or null while signed out. The listener connects
  /// when it becomes non-null and tears the connection down when it goes null.
  final String? userId;

  /// Opens the call screen for the room of a call the user just accepted.
  final void Function(String roomId) onJoinCall;

  final Widget child;

  @override
  State<IncomingCallListener> createState() => _IncomingCallListenerState();
}

class _IncomingCallListenerState extends State<IncomingCallListener> {
  /// How long an unanswered invite rings before it counts as missed.
  static const _ringTimeout = Duration(seconds: 45);

  final UnitedChatRepository _repo = UnitedChatRepository();
  StreamSubscription<RealtimeMessage>? _sub;
  Map<String, dynamic>? _incoming;

  /// While ringing: the room-channel listener and the missed-call timer.
  StreamSubscription<RealtimeMessage>? _ringSub;
  Timer? _ringTimer;

  /// Bumped on every (re)attach, so a slow attach for a previous user can
  /// tell it has been superseded and drop its subscription.
  int _attachGeneration = 0;

  @override
  void initState() {
    super.initState();
    _attach(widget.userId);
  }

  @override
  void didUpdateWidget(covariant IncomingCallListener oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.userId != widget.userId) _attach(widget.userId);
  }

  @override
  void dispose() {
    _attachGeneration++;
    _sub?.cancel();
    _stopRinging();
    _incoming = null; // Lets an in-flight ring attach see it was superseded.
    super.dispose();
  }

  Future<void> _attach(String? userId) async {
    final generation = ++_attachGeneration;
    final previous = _sub;
    _sub = null;
    await previous?.cancel();
    if (generation != _attachGeneration) return;
    _close();

    final rt = HyperBabelRealtimeClient();
    if (userId == null) {
      // Signed out — close the connection so the next user starts clean.
      await rt.disconnect();
      return;
    }
    try {
      // Authenticates with the user's session token (see the client's doc).
      await rt.connect();
      if (generation != _attachGeneration) return;
      final sub = await rt.subscribePrivate(_onSignal);
      if (generation != _attachGeneration) {
        await sub?.cancel();
        return;
      }
      _sub = sub;
    } catch (_) {
      // Best-effort — the overlay simply never shows if Real-Time is unavailable.
    }
  }

  void _onSignal(RealtimeMessage event) {
    // Every call signal shares the name `signal`; `data.type` says which one
    // it is. Only CALL_INVITE rings this device — others (e.g. CALL_BUSY) are
    // meant for the caller's screen.
    if (event.name != 'signal') return;
    final raw = event.data;
    if (raw is! Map) return;
    final data = Map<String, dynamic>.from(raw);
    if (data['type'] != 'CALL_INVITE' || !mounted) return;
    _stopRinging(); // A newer invite replaces the one on screen.
    setState(() => _incoming = data);
    _startRinging(data);
  }

  /// Follow the invite's room while it rings: close on `call_ended` for this
  /// session (the caller hung up), and give up after [_ringTimeout].
  Future<void> _startRinging(Map<String, dynamic> invite) async {
    _ringTimer = Timer(_ringTimeout, () => _missed(invite));
    // The room's real-time channel, the same one the chat screen subscribes
    // to — passed through verbatim.
    final channel = invite['roomSignalChannel'] as String?;
    if (channel == null || channel.isEmpty) return;
    try {
      final sub = await HyperBabelRealtimeClient().subscribeRoom(channel, (event) {
        final call = HyperBabelRealtimeClient.callEventOf(event);
        if (call != null &&
            call['event'] == 'call_ended' &&
            call['session_id'] == invite['sessionId'] &&
            identical(_incoming, invite)) {
          _close();
        }
      });
      // Answered, declined or replaced while the channel was attaching.
      if (!identical(_incoming, invite)) {
        await sub?.cancel();
        return;
      }
      _ringSub = sub;
    } catch (_) {
      // Best-effort — the missed-call timer still closes the overlay.
    }
  }

  /// Stop following the ringing call. Cancelling removes only this listener:
  /// a chat screen open on the same room keeps its own.
  void _stopRinging() {
    _ringTimer?.cancel();
    _ringTimer = null;
    _ringSub?.cancel();
    _ringSub = null;
  }

  /// Hide the overlay and stop ringing.
  void _close() {
    _stopRinging();
    if (_incoming == null) return;
    if (mounted) {
      setState(() => _incoming = null);
    } else {
      _incoming = null;
    }
  }

  /// Unanswered for [_ringTimeout]: report a missed call (the caller's screen
  /// stops ringing) and close.
  Future<void> _missed(Map<String, dynamic> invite) async {
    final userId = widget.userId;
    if (!identical(_incoming, invite) || userId == null) return;
    _close();
    final roomId = invite['roomId'] as String?;
    final sessionId = invite['sessionId'] as String?;
    if (roomId == null || sessionId == null) return;
    try {
      await _repo.rejectVideoCall(roomId,
          userId: userId, sessionId: sessionId, reason: 'missed');
    } catch (_) {
      // Best-effort, like a decline.
    }
  }

  Future<void> _accept() async {
    final invite = _incoming;
    final userId = widget.userId;
    if (invite == null || userId == null) return;
    _close();
    final roomId = invite['roomId'] as String?;
    final sessionId = invite['sessionId'] as String?;
    if (roomId == null || sessionId == null) return;
    try {
      // Accept first: it marks this user active in the session. A call that
      // ended while it was ringing is rejected here and there is nothing to
      // join.
      await _repo.acceptVideoCall(roomId, userId: userId, sessionId: sessionId);
    } catch (e) {
      _toast(e.toString());
      return;
    }
    if (!mounted) return;
    // The video screen looks up the session for this room and joins it.
    widget.onJoinCall(roomId);
  }

  Future<void> _reject() async {
    final invite = _incoming;
    final userId = widget.userId;
    if (invite == null || userId == null) return;
    _close();
    final roomId = invite['roomId'] as String?;
    final sessionId = invite['sessionId'] as String?;
    if (roomId == null || sessionId == null) return;
    try {
      await _repo.rejectVideoCall(roomId, userId: userId, sessionId: sessionId);
    } catch (_) {
      // Fire-and-forget: caller will hit timeout if the network is gone.
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.maybeOf(context)
        ?.showSnackBar(SnackBar(content: Text(msg)));
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
    // Field names follow the server's CALL_INVITE payload (camelCase).
    final caller = (invite['callerName'] ?? invite['callerId'] ?? 'Unknown') as String;
    final roomId = (invite['roomId'] ?? '') as String;
    final callType = (invite['callType'] ?? '1to1') as String;
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
