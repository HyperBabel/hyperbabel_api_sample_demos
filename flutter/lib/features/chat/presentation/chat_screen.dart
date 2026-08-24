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
      final rt = HyperBabelRealtimeClient();
      await rt.connect();
      _rtSub = await rt.subscribeRoom(widget.roomId, (event) {
        // The Workers backend wraps every per-room broadcast as
        //   { type: 'message' | 'typing' | …, data: <payload>, timestamp: … }
        // and publishes it under event-name 'message'. Other event names
        // ('message.deleted', 'message.updated', 'reaction', …) carry an
        // un-wrapped payload directly.
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
    final id = (msg['id'] ?? msg['message_id']) as String?;
    if (id == null) return;
    if (_messages.any((m) => (m['id'] ?? m['message_id']) == id)) return;
    setState(() => _messages.add(msg));
    _scrollToBottom();
  }

  void _handleIncomingTyping(Map<String, dynamic> envelope) {
    // Workers payload: { type: 'typing', userId, userName }.
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

  void _handleMessageDeleted(Map<String, dynamic> envelope) {
    final id = (envelope['id'] ?? envelope['message_id']) as String?;
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
    final id = (envelope['id'] ?? envelope['message_id']) as String?;
    final content = envelope['content'] as String?;
    if (id == null || content == null) return;
    setState(() {
      final idx = _messages.indexWhere(
          (m) => (m['id'] ?? m['message_id']) == id);
      if (idx >= 0) {
        _messages[idx] = {
          ..._messages[idx],
          'content': content,
          'updated_at': DateTime.now().toIso8601String(),
        };
      }
    });
  }

  void _handleIncomingReaction(Map<String, dynamic> envelope) {
    final messageId = (envelope['message_id'] ?? envelope['id']) as String?;
    final emoji = envelope['emoji'] as String?;
    final userId = (envelope['user_id'] ?? envelope['userId']) as String?;
    final removed = envelope['removed'] == true;
    if (messageId == null || emoji == null || userId == null) return;
    setState(() {
      final idx = _messages.indexWhere(
          (m) => (m['id'] ?? m['message_id']) == messageId);
      if (idx < 0) return;
      _messages[idx] = _applyReactionDelta(_messages[idx], emoji, userId,
          removed: removed);
    });
  }

  /// Apply a reaction add / remove to a message map, mutating the
  /// `reactions` list in-place. The list shape mirrors the server's:
  ///   `[{ "emoji": "👍", "users": ["u1", "u2"], "count": 2 }, …]`
  Map<String, dynamic> _applyReactionDelta(
    Map<String, dynamic> msg,
    String emoji,
    String userId, {
    bool removed = false,
  }) {
    final next = Map<String, dynamic>.from(msg);
    final reactions = (next['reactions'] as List?)?.cast<Map>() ?? [];
    final list = reactions.map((r) => Map<String, dynamic>.from(r)).toList();
    final idx = list.indexWhere((r) => r['emoji'] == emoji);
    if (removed) {
      if (idx < 0) return next;
      final users = ((list[idx]['users'] as List?) ?? []).cast<String>().toList()
        ..remove(userId);
      if (users.isEmpty) {
        list.removeAt(idx);
      } else {
        list[idx] = {...list[idx], 'users': users, 'count': users.length};
      }
    } else {
      if (idx < 0) {
        list.add({'emoji': emoji, 'users': [userId], 'count': 1});
      } else {
        final users = ((list[idx]['users'] as List?) ?? []).cast<String>().toList();
        if (!users.contains(userId)) users.add(userId);
        list[idx] = {...list[idx], 'users': users, 'count': users.length};
      }
    }
    next['reactions'] = list;
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
        _messages.add(saved);
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
      setState(() => _messages.add(saved));
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
      setState(() => _messages.add(saved));
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

  Future<void> _startVideoCall() async {
    if (_userId == null) return;
    try {
      await _repo.startVideoCall(widget.roomId, _userId!);
      if (!mounted) return;
      context.go('/video/${widget.roomId}');
    } catch (e) {
      _toast(e.toString());
    }
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
    final isSystem = senderId == 'system' || msg['message_type'] == 'system';
    final isDeleted = msg['deleted_at'] != null;
    final type = (msg['message_type'] ?? 'text') as String;
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
          child: Text(content,
              style: const TextStyle(color: Colors.white70, fontSize: 12),
              textAlign: TextAlign.center),
        ),
      );
    }

    final reactions = ((msg['reactions'] as List?) ?? const [])
        .cast<Map>()
        .map((r) => Map<String, dynamic>.from(r))
        .toList();
    final replyToId = ((msg['metadata'] is Map)
        ? (msg['metadata'] as Map)['reply_to']
        : null) as String?;
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

  Widget _buildReactionChips(List<Map<String, dynamic>> reactions) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Wrap(
        spacing: 4,
        runSpacing: 4,
        children: reactions.map((r) {
          final emoji = (r['emoji'] ?? '?') as String;
          final count = (r['count'] as num?)?.toInt() ??
              ((r['users'] as List?)?.length ?? 0);
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

  bool _isEdited(Map<String, dynamic> msg) {
    final updated = msg['updated_at'] as String?;
    final created = msg['created_at'] as String?;
    if (updated == null || created == null) return false;
    return updated != created;
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
