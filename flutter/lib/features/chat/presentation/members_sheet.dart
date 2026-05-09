import 'package:flutter/material.dart';
import '../../../core/network/united_chat_repository.dart';
import '../../../core/theme/app_theme.dart';

/// Bottom sheet that lists every member of a room with their role and lets
/// owner / sub_admin moderate them (ban, mute self).
class MembersSheet extends StatefulWidget {
  const MembersSheet({
    super.key,
    required this.roomId,
    required this.currentUserId,
    required this.currentUserRole,
  });

  final String roomId;
  final String currentUserId;
  final String currentUserRole;

  @override
  State<MembersSheet> createState() => _MembersSheetState();
}

class _MembersSheetState extends State<MembersSheet> {
  final UnitedChatRepository _repo = UnitedChatRepository();
  List<Map<String, dynamic>> _members = [];
  bool _loading = true;
  bool _isMuted = false;

  bool get _canModerate =>
      widget.currentUserRole == 'owner' || widget.currentUserRole == 'sub_admin';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final raw = await _repo.getMembers(widget.roomId);
      final muteStatus = await _repo
          .getMuteStatus(widget.roomId, widget.currentUserId)
          .catchError((_) => <String, dynamic>{'is_muted': false});
      setState(() {
        _members = raw.cast<Map<String, dynamic>>();
        _isMuted = (muteStatus['is_muted'] as bool?) ?? false;
        _loading = false;
      });
    } catch (e) {
      setState(() => _loading = false);
      if (mounted) _toast(e.toString());
    }
  }

  bool get _isOwner => widget.currentUserRole == 'owner';

  Future<void> _promote(Map<String, dynamic> member) async {
    final userId = member['user_id'] as String?;
    if (userId == null || !_isOwner) return;
    try {
      await _repo.addSubAdmin(widget.roomId, widget.currentUserId, userId);
      _toast('$userId promoted to sub_admin');
      await _load();
    } catch (e) {
      _toast(e.toString());
    }
  }

  Future<void> _demote(Map<String, dynamic> member) async {
    final userId = member['user_id'] as String?;
    if (userId == null || !_isOwner) return;
    try {
      await _repo.removeSubAdmin(widget.roomId, userId);
      _toast('$userId demoted to member');
      await _load();
    } catch (e) {
      _toast(e.toString());
    }
  }

  Future<void> _ban(Map<String, dynamic> member) async {
    final userId = member['user_id'] as String?;
    if (userId == null || userId == widget.currentUserId) return;
    final ok = await _confirm(
      title: 'Ban member?',
      body: 'Banning ${member['user_name'] ?? userId} removes them from the '
          'room and prevents them from rejoining until you unban.',
      destructive: true,
    );
    if (ok != true) return;
    try {
      await _repo.banUser(widget.roomId, widget.currentUserId, userId);
      _toast('Banned $userId');
      await _load();
    } catch (e) {
      _toast(e.toString());
    }
  }

  Future<void> _toggleMute() async {
    try {
      if (_isMuted) {
        await _repo.unmuteRoom(widget.roomId, widget.currentUserId);
      } else {
        // Open a small picker for duration.
        final mins = await _pickMuteDuration();
        if (mins == null) return;
        await _repo.muteRoom(
          widget.roomId,
          widget.currentUserId,
          durationMinutes: mins == 0 ? null : mins,
        );
      }
      await _load();
    } catch (e) {
      _toast(e.toString());
    }
  }

  Future<int?> _pickMuteDuration() async {
    return showModalBottomSheet<int>(
      context: context,
      backgroundColor: AppTheme.surfaceDark,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(
              title: Text('Mute for…',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
            for (final entry in const [
              ('1 hour', 60),
              ('8 hours', 480),
              ('24 hours', 1440),
              ('Forever', 0),
            ])
              ListTile(
                title: Text(entry.$1, style: const TextStyle(color: Colors.white)),
                onTap: () => Navigator.pop(ctx, entry.$2),
              ),
          ],
        ),
      ),
    );
  }

  Future<bool?> _confirm({
    required String title,
    required String body,
    bool destructive = false,
  }) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: destructive
                ? FilledButton.styleFrom(backgroundColor: Colors.red)
                : null,
            child: Text(destructive ? 'Confirm' : 'OK'),
          ),
        ],
      ),
    );
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (ctx, scrollController) => Container(
        decoration: const BoxDecoration(
          color: AppTheme.surfaceDark,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 12),
            const Text('Members',
                style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _isMuted
                          ? 'Notifications are muted for this room.'
                          : 'Notifications are on.',
                      style: const TextStyle(color: Colors.white54, fontSize: 12),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: _toggleMute,
                    icon: Icon(_isMuted ? Icons.notifications_active : Icons.notifications_off,
                        size: 18),
                    label: Text(_isMuted ? 'Unmute' : 'Mute'),
                  ),
                ],
              ),
            ),
            const Divider(color: Colors.white12, height: 1),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _members.isEmpty
                      ? const Center(
                          child: Text('No members.', style: TextStyle(color: Colors.white54)))
                      : ListView.builder(
                          controller: scrollController,
                          itemCount: _members.length,
                          itemBuilder: (_, i) => _buildMember(_members[i]),
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMember(Map<String, dynamic> m) {
    final userId = m['user_id'] as String? ?? '';
    final userName = (m['user_name'] ?? userId) as String;
    final role = (m['role'] ?? 'member') as String;
    final isSelf = userId == widget.currentUserId;
    final canActOnThisRow = _canModerate && !isSelf && role != 'owner';
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: AppTheme.primaryAccent.withOpacity(0.25),
        child: Text(userName.isNotEmpty ? userName.substring(0, 1).toUpperCase() : '?',
            style: const TextStyle(color: Colors.white)),
      ),
      title: Text(userName, style: const TextStyle(color: Colors.white)),
      subtitle: Text(role, style: const TextStyle(color: Colors.white54)),
      trailing: canActOnThisRow
          ? PopupMenuButton<String>(
              tooltip: 'Manage member',
              icon: const Icon(Icons.more_vert, color: Colors.white70),
              onSelected: (action) {
                switch (action) {
                  case 'promote':
                    _promote(m);
                    break;
                  case 'demote':
                    _demote(m);
                    break;
                  case 'ban':
                    _ban(m);
                    break;
                }
              },
              itemBuilder: (_) => [
                if (_isOwner && role == 'member')
                  const PopupMenuItem(
                    value: 'promote',
                    child: Row(children: [
                      Icon(Icons.shield, size: 18),
                      SizedBox(width: 8),
                      Text('Promote to sub_admin'),
                    ]),
                  ),
                if (_isOwner && role == 'sub_admin')
                  const PopupMenuItem(
                    value: 'demote',
                    child: Row(children: [
                      Icon(Icons.remove_moderator, size: 18),
                      SizedBox(width: 8),
                      Text('Demote to member'),
                    ]),
                  ),
                const PopupMenuItem(
                  value: 'ban',
                  child: Row(children: [
                    Icon(Icons.block, color: Colors.redAccent, size: 18),
                    SizedBox(width: 8),
                    Text('Ban from room'),
                  ]),
                ),
              ],
            )
          : null,
    );
  }
}
