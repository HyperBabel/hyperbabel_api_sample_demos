import 'dart:async';
import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/network/chat_repository.dart';
import '../../../core/network/storage_repository.dart';
import '../../../core/network/united_chat_repository.dart';
import '../../../core/realtime/hyperbabel_realtime_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/time_utils.dart';
import 'members_sheet.dart';

/// Room-aware chat surface for the HyperBabel demo. Loads message history,
/// publishes new messages (text + image), and exposes long-press edit / delete
/// for the user's own messages. The Members button opens a moderation sheet
/// where owner / sub_admin can ban people and the current user can mute the
/// room.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.roomId});

  final String roomId;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final UnitedChatRepository _repo = UnitedChatRepository();
  final ChatRepository _chat = ChatRepository();
  final StorageRepository _storage = StorageRepository();
  final ImagePicker _picker = ImagePicker();
  final TextEditingController _msgController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  String? _userId;
  String _currentRole = 'member';
  bool _isFrozen = false;
  List<Map<String, dynamic>> _messages = [];
  bool _loading = true;
  bool _sending = false;
  String? _error;
  StreamSubscription? _rtSub;

  // Typing indicator (incoming): the most recent peer who pinged us, paired
  // with a timer that hides the indicator a couple of seconds after the last
  // event lands.
  String? _typingFrom;
  Timer? _typingClear;

  // Outgoing typing throttle so we don't ping the server on every keystroke.
  DateTime? _lastTypingPing;

  // Reply mode — when set, the next sendText is published with `reply_to`
  // pointing at this message.
  Map<String, dynamic>? _replyTo;

  bool get _canModerate =>
      _currentRole == 'owner' || _currentRole == 'sub_admin';

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _rtSub?.cancel();
    _typingClear?.cancel();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    final userId = prefs.getString('hb_user_id');
    if (userId == null) {
      if (mounted) context.go('/login');
      return;
    }
    _userId = userId;
    await _refresh();
  }

  Future<void> _refresh() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final raw = await _repo.getMessages(widget.roomId, userId: _userId);
      // Server returns newest-first; reverse so oldest appears at the top
      // and the latest sits at the bottom of the list view.
      final list = raw.cast<Map<String, dynamic>>().reversed.toList();
      // Resolve our role from the room's member list (best-effort).
      try {
        final members =
            (await _repo.getMembers(widget.roomId)).cast<Map<String, dynamic>>();
        final me = members.firstWhere(
          (m) => m['user_id'] == _userId,
          orElse: () => const {'role': 'member'},
        );
        _currentRole = (me['role'] as String?) ?? 'member';
      } catch (_) {
        _currentRole = 'member';
      }
      setState(() {
        _messages = list;
        _loading = false;
      });
      // Mark the latest message as read in the background.
      _repo.markAsRead(widget.roomId, _userId!);
      _scrollToBottom();
      // Subscribe to live message events on this room — only attaches once.
      _attachRealtime();
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _attachRealtime() async {
    if (_rtSub != null) return;
    try {
      // The channel name comes from the API and is used verbatim — it cannot
      // be rebuilt from the room id (see HyperBabelRealtimeClient's doc).
      final room = await _repo.getRoom(widget.roomId);
      final realtimeChannel = room['realtime_channel'] as String?;
      if (realtimeChannel == null || realtimeChannel.isEmpty) return;

      final rt = HyperBabelRealtimeClient();
      await rt.connect();
      _rtSub = await rt.subscribeRoom(realtimeChannel, (event) {
        // The HyperBabel API publishes room events as an envelope
        //   { type, timestamp, data: <payload> }
        // under the event name that matches `type`: 'message' (new message),
        // 'message.deleted' (data: { message_id, deleted_by }),
        // 'message.updated' (data: { message_id, content, edited_at }),
        // 'reaction' (data: { message_id, emoji, user_id, action }).
        // Typing is the exception: event name 'message' with a flat
        // { type: 'typing', userId, userName } payload and no `data`.
        final raw = event.data;
        final envelope = raw is Map ? Map<String, dynamic>.from(raw) : null;
        switch (event.name) {
          case 'message':
            final inner = envelope?['type'] as String?;
            if (inner == 'typing') {
              _handleIncomingTyping(envelope!);
            } else if (inner == 'message') {
              final payload = envelope?['data'];
              if (payload is Map) _handleIncomingMessage(payload);
            }
            break;
          case 'message.deleted':
            if (envelope != null) _handleMessageDeleted(envelope);
            break;
          case 'message.updated':
            if (envelope != null) _handleMessageUpdated(envelope);
            break;
          case 'reaction':
            if (envelope != null) _handleIncomingReaction(envelope);
            break;
        }
      });
    } catch (_) {
      // Real-Time is best-effort for the skeleton — fall back to manual refresh.
    }
  }

  void _handleIncomingMessage(Map payload) {
    final msg = Map<String, dynamic>.from(payload);
    // Live captions from a call ride this channel too, but the message list
    // API never returns them — appending them would show lines that vanish
    // on the next reload.
    if (msg['message_type'] == 'caption') return;
    final id = (msg['id'] ?? msg['message_id']) as String?;
    if (id == null) return;
    if (_messages.any((m) => (m['id'] ?? m['message_id']) == id)) return;
    setState(() => _messages.add(msg));
    _scrollToBottom();
  }

  /// Append a message we just sent unless the room broadcast already added
  /// it — the sender receives its own message twice (the POST response and
  /// the broadcast), in either order.
  void _appendSent(Map<String, dynamic> msg) {
    final id = msg['id'] as String?;
    if (id != null && _messages.any((m) => (m['id'] ?? m['message_id']) == id)) {
      return;
    }
    _messages.add(msg);
  }

  void _handleIncomingTyping(Map<String, dynamic> envelope) {
    // Typing payload: { type: 'typing', userId, userName }.
    final from = (envelope['userId'] ?? envelope['user_id']) as String?;
    if (from == null || from == _userId) return;
    final name =
        (envelope['userName'] ?? envelope['display_name'] ?? envelope['user_name'] ?? from)
            as String;
    setState(() => _typingFrom = name);
    _typingClear?.cancel();
    _typingClear = Timer(const Duration(seconds: 3), () {
      if (mounted) setState(() => _typingFrom = null);
    });
  }

  /// The `data` object of a room-event envelope (see [_attachRealtime]).
  static Map<String, dynamic> _eventData(Map<String, dynamic> envelope) =>
      envelope['data'] is Map
          ? Map<String, dynamic>.from(envelope['data'] as Map)
          : const <String, dynamic>{};

  void _handleMessageDeleted(Map<String, dynamic> envelope) {
    // The id sits inside `data`, not at the top of the envelope.
    final id = _eventData(envelope)['message_id'] as String?;
    if (id == null) return;
    setState(() {
      final idx = _messages.indexWhere(
          (m) => (m['id'] ?? m['message_id']) == id);
      if (idx >= 0) {
        _messages[idx] = {
          ..._messages[idx],
          'deleted_at': DateTime.now().toIso8601String(),
        };
      }
    });
  }

  void _handleMessageUpdated(Map<String, dynamic> envelope) {
    final data = _eventData(envelope);
    final id = data['message_id'] as String?;
    final content = data['content'] as String?;
    if (id == null || content == null) return;
    setState(() {
      final idx = _messages.indexWhere(
          (m) => (m['id'] ?? m['message_id']) == id);
      if (idx >= 0) {
        _messages[idx] = {
          ..._messages[idx],
          'content': content,
          'edited_at': data['edited_at'] ?? DateTime.now().toIso8601String(),
        };
      }
    });
  }

  void _handleIncomingReaction(Map<String, dynamic> envelope) {
    // The room broadcast wraps the payload as { type, data, timestamp }.
    final payload = (envelope['data'] is Map)
        ? Map<String, dynamic>.from(envelope['data'] as Map)
        : envelope;
    final messageId = (payload['message_id'] ?? payload['id']) as String?;
    final emoji = payload['emoji'] as String?;
    final userId = (payload['user_id'] ?? payload['userId']) as String?;
    // The broadcast carries `action: 'add' | 'remove'`.
    final removed = payload['action'] == 'remove';
    if (messageId == null || emoji == null || userId == null) return;
    setState(() {
      final idx = _messages.indexWhere(
          (m) => (m['id'] ?? m['message_id']) == messageId);
      if (idx < 0) return;
      _messages[idx] = _applyReactionDelta(_messages[idx], emoji, userId,
          removed: removed);
    });
  }

  /// Read a message's `reactions` field in the API's shape: a MAP of emoji to
  /// the user ids that reacted with it — `{ "👍": ["u1", "u2"] }`.
  ///
  /// It is NOT a list of `{ emoji, users, count }` objects. Casting it to a
  /// List throws at runtime, which crashed the message list as soon as any
  /// message carried a reaction.
  static Map<String, List<String>> _readReactions(dynamic raw) {
    if (raw is! Map) return <String, List<String>>{};
    final out = <String, List<String>>{};
    raw.forEach((k, v) {
      out['$k'] = ((v as List?) ?? const []).map((e) => '$e').toList();
    });
    return out;
  }

  /// Apply a reaction add / remove to a message map. The broadcast is a DELTA
  /// (one emoji, one user), so merge it into the local map instead of
  /// replacing the map wholesale.
  Map<String, dynamic> _applyReactionDelta(
    Map<String, dynamic> msg,
    String emoji,
    String userId, {
    bool removed = false,
  }) {
    final next = Map<String, dynamic>.from(msg);
    final map = _readReactions(next['reactions']);
    final users = List<String>.from(map[emoji] ?? const <String>[]);
    if (removed) {
      users.remove(userId);
      if (users.isEmpty) {
        map.remove(emoji);
      } else {
        map[emoji] = users;
      }
    } else {
      if (users.contains(userId)) return next;
      users.add(userId);
      map[emoji] = users;
    }
    next['reactions'] = map;
    return next;
  }

  Future<void> _sendText() async {
    final text = _msgController.text.trim();
    if (text.isEmpty || _userId == null) return;
    setState(() => _sending = true);
    final replyId = (_replyTo?['id'] ?? _replyTo?['message_id']) as String?;
    try {
      final saved = replyId != null
          ? await _repo.sendReply(
              widget.roomId,
              senderId: _userId!,
              content: text,
              replyTo: replyId,
            )
          : await _repo.sendMessage(
              widget.roomId,
              senderId: _userId!,
              content: text,
            );
      _msgController.clear();
      setState(() {
        _appendSent(saved);
        _replyTo = null;
      });
      _scrollToBottom();
    } catch (e) {
      _toast(e.toString());
    } finally {
      setState(() => _sending = false);
    }
  }

  /// Throttled typing notifier — fires at most once per 2 seconds while the
  /// user is actively typing.
  void _onTyping() {
    if (_userId == null) return;
    final now = DateTime.now();
    if (_lastTypingPing != null &&
        now.difference(_lastTypingPing!) < const Duration(seconds: 2)) {
      return;
    }
    _lastTypingPing = now;
    _repo.sendTypingIndicator(widget.roomId, _userId!, _userId);
  }

  Future<void> _addReaction(Map<String, dynamic> msg, String emoji) async {
    final id = (msg['id'] ?? msg['message_id']) as String?;
    if (id == null || _userId == null) return;
    // Optimistic update — the server will still send a 'reaction' event
    // back, but we suppress duplicates in _applyReactionDelta.
    setState(() {
      final idx = _messages.indexWhere((m) =>
          (m['id'] ?? m['message_id']) == id);
      if (idx >= 0) {
        _messages[idx] = _applyReactionDelta(_messages[idx], emoji, _userId!);
      }
    });
    try {
      // Server returns the full map — replace the optimistic guess with it so
      // counts stay right when several people react at the same time.
      final reactions = await _chat.addReaction(
        roomId: widget.roomId, messageId: id, userId: _userId!, emoji: emoji,
      );
      if (mounted) {
        setState(() {
          final i = _messages.indexWhere((m) => (m['id'] ?? m['message_id']) == id);
          if (i >= 0) _messages[i] = {..._messages[i], 'reactions': reactions};
        });
      }
    } catch (e) {
      _toast(e.toString());
    }
  }

  Future<void> _sendImage() async {
    if (_userId == null) return;
    final picked = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
    if (picked == null) return;

    setState(() => _sending = true);
    try {
      final file = File(picked.path);
      final filename = picked.name.isNotEmpty
          ? picked.name
          : 'photo_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final mime = picked.mimeType ?? 'image/jpeg';
      final confirmed = await _storage.uploadFile(
        file: file,
        filename: filename,
        mimeType: mime,
        channelId: widget.roomId,
      );
      final url = (confirmed['url'] ?? confirmed['cdn_url'] ?? '') as String;
      final saved = await _repo.sendMessage(
        widget.roomId,
        senderId: _userId!,
        content: url,
        messageType: 'image',
        metadata: {
          'url': url,
          'filename': filename,
          'mime_type': mime,
        },
      );
      setState(() => _appendSent(saved));
      _scrollToBottom();
    } catch (e) {
      _toast('Image upload failed: $e');
    } finally {
      setState(() => _sending = false);
    }
  }

  Future<void> _editMessage(Map<String, dynamic> msg) async {
    final id = (msg['id'] ?? msg['message_id']) as String?;
    if (id == null || _userId == null) return;
    final controller = TextEditingController(text: (msg['content'] ?? '') as String);
    final newContent = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit message'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: null,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (newContent == null || newContent.isEmpty) return;
    try {
      await _repo.editMessage(widget.roomId, id, userId: _userId!, content: newContent);
      setState(() {
        final idx = _messages.indexWhere((m) =>
            (m['id'] ?? m['message_id']) == id);
        if (idx >= 0) {
          _messages[idx] = {..._messages[idx], 'content': newContent};
        }
      });
    } catch (e) {
      _toast(e.toString());
    }
  }

  Future<void> _deleteMessage(Map<String, dynamic> msg) async {
    final id = (msg['id'] ?? msg['message_id']) as String?;
    if (id == null || _userId == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete message?'),
        content: const Text('The message is replaced with a tombstone for everyone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _repo.deleteMessage(widget.roomId, id, _userId!);
      setState(() {
        final idx = _messages.indexWhere((m) =>
            (m['id'] ?? m['message_id']) == id);
        if (idx >= 0) {
          _messages[idx] = {
            ..._messages[idx],
            'deleted_at': DateTime.now().toIso8601String(),
          };
        }
      });
    } catch (e) {
      _toast(e.toString());
    }
  }

  Future<void> _sendFile() async {
    if (_userId == null) return;
    final result = await FilePicker.platform.pickFiles(allowMultiple: false);
    final picked = result?.files.singleOrNull;
    if (picked == null || picked.path == null) return;

    setState(() => _sending = true);
    try {
      final file = File(picked.path!);
      final filename = picked.name;
      final mime = _guessMimeType(filename);
      final confirmed = await _storage.uploadFile(
        file: file,
        filename: filename,
        mimeType: mime,
        channelId: widget.roomId,
      );
      final url = (confirmed['url'] ?? confirmed['cdn_url'] ?? '') as String;
      final saved = await _repo.sendMessage(
        widget.roomId,
        senderId: _userId!,
        content: filename,
        messageType: 'file',
        metadata: {
          'url': url,
          'filename': filename,
          'mime_type': mime,
          'size': picked.size,
        },
      );
      setState(() => _appendSent(saved));
      _scrollToBottom();
    } catch (e) {
      _toast('File upload failed: $e');
    } finally {
      setState(() => _sending = false);
    }
  }

  String _guessMimeType(String filename) {
    final ext = filename.split('.').last.toLowerCase();
    switch (ext) {
      case 'pdf':  return 'application/pdf';
      case 'mp4':  return 'video/mp4';
      case 'mov':  return 'video/quicktime';
      case 'mp3':  return 'audio/mpeg';
      case 'wav':  return 'audio/wav';
      case 'm4a':  return 'audio/mp4';
      case 'doc':
      case 'docx': return 'application/msword';
      case 'xls':
      case 'xlsx': return 'application/vnd.ms-excel';
      case 'zip':  return 'application/zip';
      case 'txt':  return 'text/plain';
      default:     return 'application/octet-stream';
    }
  }

  /// A call holds at most 3 people, so a group call rings up to 2 others.
  static const _maxCallTargets = 2;

  Future<void> _startVideoCall() async {
    if (_userId == null) return;
    try {
      // 1:1 room: the server rings the other member — send no targets.
      // Group room: `target_user_ids` is required, so ask whom to call.
      final room = await _repo.getRoom(widget.roomId);
      if (!mounted) return;
      final type = room['channel_type'] as String?;
      List<String>? targets;
      if (type == 'group') {
        final others = ((room['members'] as List?) ?? const [])
            .whereType<Map>()
            .where((m) => m['user_id'] != null && m['user_id'] != _userId)
            .toList();
        if (others.isEmpty) {
          _toast('Nobody else is in this room yet.');
          return;
        }
        targets = await _pickCallTargets(others);
        if (targets == null || targets.isEmpty) return;
      } else if (type != '1to1') {
        _toast('Video calls are available in 1:1 and group rooms only.');
        return;
      }
      await _repo.startVideoCall(widget.roomId, _userId!,
          targetUserIds: targets);
      if (!mounted) return;
      // The call screen reads the new session (id, call type, who started
      // it) from GET …/video-call/active.
      context.go('/video/${widget.roomId}');
    } catch (e) {
      _toast(e.toString());
    }
  }

  /// Let the caller pick up to [_maxCallTargets] members to ring.
  Future<List<String>?> _pickCallTargets(List<Map> others) {
    final picked = <String>{};
    return showDialog<List<String>>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Call whom? (up to 2)'),
          content: SizedBox(
            width: double.maxFinite,
            child: ListView(
              shrinkWrap: true,
              children: [
                for (final m in others)
                  CheckboxListTile(
                    value: picked.contains(m['user_id']),
                    title: Text('${m['user_name'] ?? m['user_id']}'),
                    onChanged: (on) => setLocal(() {
                      final id = '${m['user_id']}';
                      if (on != true) {
                        picked.remove(id);
                      } else if (picked.length < _maxCallTargets) {
                        picked.add(id);
                      }
                    }),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            FilledButton(
              onPressed:
                  picked.isEmpty ? null : () => Navigator.pop(ctx, picked.toList()),
              child: const Text('Call'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _toggleFreeze() async {
    if (_userId == null) return;
    try {
      if (_isFrozen) {
        await _repo.unfreezeRoom(widget.roomId, _userId!);
      } else {
        await _repo.freezeRoom(widget.roomId, _userId!);
      }
      setState(() => _isFrozen = !_isFrozen);
    } catch (e) {
      _toast(e.toString());
    }
  }

  Future<void> _showMembers() async {
    if (_userId == null) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => MembersSheet(
        roomId: widget.roomId,
        currentUserId: _userId!,
        currentUserRole: _currentRole,
      ),
    );
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    });
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final shortId = widget.roomId.length > 8 ? widget.roomId.substring(0, 8) : widget.roomId;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/home'),
        ),
        title: Text('Room • $shortId…'),
        actions: [
          IconButton(
            tooltip: 'Start video call',
            icon: const Icon(Icons.videocam),
            onPressed: _startVideoCall,
          ),
          if (_canModerate)
            IconButton(
              tooltip: _isFrozen ? 'Unfreeze room' : 'Freeze room',
              icon: Icon(_isFrozen ? Icons.lock_open : Icons.lock_outline),
              onPressed: _toggleFreeze,
            ),
          IconButton(icon: const Icon(Icons.group), onPressed: _showMembers),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _refresh),
        ],
      ),
      body: Column(
        children: [
          if (_error != null)
            Container(
              width: double.infinity,
              color: Colors.red.withOpacity(0.15),
              padding: const EdgeInsets.all(8),
              child: Text(_error!, style: const TextStyle(color: Colors.redAccent)),
            ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (_, i) => _buildBubble(_messages[i]),
                  ),
          ),
          if (_isFrozen)
            Container(
              width: double.infinity,
              color: Colors.amber.withOpacity(0.15),
              padding: const EdgeInsets.all(8),
              child: Text(
                _canModerate
                    ? '🔒 This room is frozen — only you and other admins can post.'
                    : '🔒 This room is frozen — only admins can post right now.',
                style: const TextStyle(color: Colors.amber),
                textAlign: TextAlign.center,
              ),
            ),
          if (_typingFrom != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              color: AppTheme.surfaceDark,
              child: Text('$_typingFrom is typing…',
                  style: const TextStyle(
                    color: Colors.white60,
                    fontSize: 12,
                    fontStyle: FontStyle.italic,
                  )),
            ),
          if (_replyTo != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppTheme.surfaceDark,
                border: const Border(
                  left: BorderSide(color: AppTheme.primaryAccent, width: 3),
                ),
              ),
              child: Row(
                children: [
                  const Icon(Icons.reply, color: AppTheme.primaryAccent, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Replying to ${(_replyTo!['sender_name'] ?? _replyTo!['sender_id'] ?? 'someone')}',
                          style: const TextStyle(
                              color: AppTheme.primaryAccent,
                              fontSize: 11,
                              fontWeight: FontWeight.bold),
                        ),
                        Text(
                          (_replyTo!['content'] ?? '[media]') as String,
                          style: const TextStyle(color: Colors.white70, fontSize: 12),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white54, size: 18),
                    onPressed: () => setState(() => _replyTo = null),
                  ),
                ],
              ),
            ),
          SafeArea(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              color: AppTheme.surfaceDark,
              child: Row(
                children: [
                  IconButton(
                    tooltip: 'Send image',
                    icon: const Icon(Icons.image, color: AppTheme.primaryAccent),
                    onPressed: _sending ? null : _sendImage,
                  ),
                  IconButton(
                    tooltip: 'Send file',
                    icon: const Icon(Icons.attach_file, color: AppTheme.primaryAccent),
                    onPressed: _sending ? null : _sendFile,
                  ),
                  Expanded(
                    child: TextField(
                      controller: _msgController,
                      decoration: const InputDecoration(
                        hintText: 'Type a message…',
                        border: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        contentPadding: EdgeInsets.zero,
                      ),
                      maxLines: null,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _sendText(),
                      onChanged: (_) => _onTyping(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  _sending
                      ? const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 8),
                          child: SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      : IconButton(
                          onPressed: _sendText,
                          icon: const Icon(Icons.send, color: AppTheme.primaryAccent),
                        ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBubble(Map<String, dynamic> msg) {
    final senderId = (msg['sender_id'] ?? '') as String;
    final isLocal = senderId == _userId;
    final type = (msg['message_type'] ?? 'text') as String;
    final isSystem =
        senderId == 'system' || type == 'system' || type == 'video_call';
    final isDeleted = msg['deleted_at'] != null;
    final content = (msg['content'] ?? '') as String;

    if (isSystem) {
      return Center(
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 8),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.white10,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Text(type == 'video_call' ? _callNotice(msg) : content,
              style: const TextStyle(color: Colors.white70, fontSize: 12),
              textAlign: TextAlign.center),
        ),
      );
    }

    final reactions = _readReactions(msg['reactions']);
    // `reply_to` is a top-level message field holding the quoted message's id.
    final replyToId = msg['reply_to'] as String?;
    final replyParent = replyToId == null
        ? null
        : _messages.firstWhere(
            (m) => (m['id'] ?? m['message_id']) == replyToId,
            orElse: () => const <String, dynamic>{},
          );
    final createdAt = parseServerTimestamp(msg['created_at'] as String?);

    final bubble = Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
      decoration: BoxDecoration(
        color: isLocal ? AppTheme.primaryAccent : AppTheme.surfaceDark,
        borderRadius: BorderRadius.circular(16).copyWith(
          bottomRight: isLocal ? const Radius.circular(0) : null,
          bottomLeft: !isLocal ? const Radius.circular(0) : null,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isLocal)
            Text(
              (msg['sender_name'] ?? senderId) as String,
              style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold),
            ),
          if (!isLocal) const SizedBox(height: 4),
          if (replyParent != null && replyParent.isNotEmpty)
            _buildReplyQuote(replyParent),
          if (isDeleted)
            const Text('🗑 This message was deleted.',
                style: TextStyle(color: Colors.white54, fontStyle: FontStyle.italic))
          else if (type == 'image')
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.network(
                content,
                width: 220,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const Padding(
                  padding: EdgeInsets.all(12),
                  child: Text('🖼 Image (failed to load)',
                      style: TextStyle(color: Colors.white)),
                ),
              ),
            )
          else if (type == 'file')
            _buildFileCard(msg)
          else
            Text(content, style: const TextStyle(color: Colors.white, fontSize: 15), softWrap: true),
          if (reactions.isNotEmpty) _buildReactionChips(reactions),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (createdAt != null)
                  Text(
                    formatMessageTime(createdAt),
                    style: const TextStyle(color: Colors.white60, fontSize: 10),
                  ),
                if (_isEdited(msg) && !isDeleted) ...const [
                  SizedBox(width: 6),
                  Text(
                    'edited',
                    style: TextStyle(color: Colors.white60, fontSize: 10, fontStyle: FontStyle.italic),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );

    return Align(
      alignment: isLocal ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onLongPress: isDeleted ? null : () => _showMessageActions(msg, isLocal: isLocal),
        child: bubble,
      ),
    );
  }

  Widget _buildReplyQuote(Map<String, dynamic> parent) {
    final preview = (parent['content'] ?? '[media]') as String;
    final senderName = (parent['sender_name'] ?? parent['sender_id'] ?? '') as String;
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.08),
        border: const Border(left: BorderSide(color: Colors.white70, width: 2)),
        borderRadius: const BorderRadius.only(
          topRight: Radius.circular(6),
          bottomRight: Radius.circular(6),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('↩ $senderName',
              style: const TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.bold)),
          Text(preview,
              style: const TextStyle(color: Colors.white60, fontSize: 12),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }

  Widget _buildReactionChips(Map<String, List<String>> reactions) {
    // Stable order — a Map has none of its own, and re-ordering the chips on
    // every rebuild is visually noisy.
    final entries = reactions.entries.toList()
      ..sort((a, b) => a.key.compareTo(b.key));
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Wrap(
        spacing: 4,
        runSpacing: 4,
        children: entries.map((e) {
          final emoji = e.key;
          final count = e.value.length;
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: Colors.white12,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text('$emoji $count',
                style: const TextStyle(color: Colors.white, fontSize: 12)),
          );
        }).toList(),
      ),
    );
  }

  /// Messages carry `edited_at` (null until the first edit); there is no
  /// `updated_at` field.
  bool _isEdited(Map<String, dynamic> msg) => msg['edited_at'] != null;

  /// One-line notice for a call event. Call events are `video_call` system
  /// messages with an EMPTY `content`; `metadata.event` says what happened.
  static String _callNotice(Map<String, dynamic> msg) {
    final meta = msg['metadata'];
    return switch (meta is Map ? meta['event'] : null) {
      'call_started' => 'Video call started',
      'call_accepted' => 'Call answered',
      'call_ended' => 'Video call ended',
      'call_rejected' => 'Call declined',
      'call_missed' => 'Missed call',
      'call_busy' => 'Busy',
      _ => 'Video call',
    };
  }

  Widget _buildFileCard(Map<String, dynamic> msg) {
    final meta = (msg['metadata'] as Map?)?.cast<String, dynamic>() ?? const {};
    final filename = (meta['filename'] ?? msg['content'] ?? 'File') as String;
    final size = meta['size'] as int?;
    final url = (meta['url'] ?? msg['content']) as String?;
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 240),
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: Colors.white12,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            const Icon(Icons.insert_drive_file, color: Colors.white70),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    filename,
                    style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (size != null)
                    Text('${(size / 1024).round()} KB',
                        style: const TextStyle(color: Colors.white54, fontSize: 11)),
                  if (url != null)
                    Text(url,
                        style: const TextStyle(color: Colors.white38, fontSize: 10),
                        overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Long-press action sheet — adapts to whether the message is the user's
  /// own (Edit / Delete) or someone else's (Reply / React only).
  void _showMessageActions(Map<String, dynamic> msg, {required bool isLocal}) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.surfaceDark,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.reply, color: Colors.white),
              title: const Text('Reply', style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(ctx);
                setState(() => _replyTo = msg);
              },
            ),
            ListTile(
              leading: const Icon(Icons.add_reaction, color: Colors.white),
              title: const Text('React', style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(ctx);
                _showReactionPicker(msg);
              },
            ),
            if (isLocal) ...[
              ListTile(
                leading: const Icon(Icons.edit, color: Colors.white),
                title: const Text('Edit', style: TextStyle(color: Colors.white)),
                onTap: () {
                  Navigator.pop(ctx);
                  _editMessage(msg);
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete, color: Colors.redAccent),
                title: const Text('Delete',
                    style: TextStyle(color: Colors.redAccent)),
                onTap: () {
                  Navigator.pop(ctx);
                  _deleteMessage(msg);
                },
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _showReactionPicker(Map<String, dynamic> msg) {
    const choices = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '✅'];
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.surfaceDark,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
          child: Wrap(
            alignment: WrapAlignment.spaceEvenly,
            spacing: 12,
            runSpacing: 12,
            children: [
              for (final e in choices)
                InkWell(
                  onTap: () {
                    Navigator.pop(ctx);
                    _addReaction(msg, e);
                  },
                  borderRadius: BorderRadius.circular(24),
                  child: Padding(
                    padding: const EdgeInsets.all(8),
                    child: Text(e, style: const TextStyle(fontSize: 28)),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
