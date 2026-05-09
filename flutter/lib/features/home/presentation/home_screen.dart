import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/network/united_chat_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/glass_container.dart';

/// HyperBabel demo home — lists rooms the signed-in user belongs to and
/// links out to the demo's other surfaces (Video, Stream).
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final UnitedChatRepository _repo = UnitedChatRepository();
  String? _userId;
  List<Map<String, dynamic>> _rooms = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    final userId = prefs.getString('hb_user_id');
    if (userId == null || userId.isEmpty) {
      if (mounted) context.go('/login');
      return;
    }
    _userId = userId;
    await _loadRooms();
  }

  Future<void> _loadRooms() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final raw = await _repo.getRooms(_userId!);
      setState(() {
        _rooms = raw.cast<Map<String, dynamic>>();
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _createRoom() async {
    final name = await _promptText(
      title: 'Create Group Room',
      hint: 'Room name (e.g. Team Chat)',
    );
    if (name == null || name.isEmpty || _userId == null) return;
    try {
      final room = await _repo.createRoom(
        roomType: 'group',
        creatorId: _userId!,
        roomName: name,
        members: [_userId!],
      );
      await _loadRooms();
      if (!mounted) return;
      context.go('/chat/${room['id'] ?? room['room_id']}');
    } catch (e) {
      if (!mounted) return;
      _toast(e.toString());
    }
  }

  Future<void> _confirmLeave(Map<String, dynamic> room) async {
    final id = (room['id'] ?? room['room_id']) as String?;
    if (id == null || _userId == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Leave room?'),
        content: Text(
          'You will stop receiving messages from "${room['room_name'] ?? id}". '
          'Owners must transfer ownership before leaving.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Leave'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _repo.leaveRoom(id, _userId!);
      await _loadRooms();
    } catch (e) {
      if (!mounted) return;
      _toast(e.toString());
    }
  }

  Future<String?> _promptText({required String title, required String hint}) async {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: InputDecoration(hintText: hint),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadRooms),
          IconButton(icon: const Icon(Icons.settings), onPressed: () => context.go('/settings')),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _createRoom,
        icon: const Icon(Icons.add),
        label: const Text('New Room'),
      ),
      body: RefreshIndicator(
        onRefresh: _loadRooms,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Video sessions are launched from inside a chat room (Start call
            // button), not from the home screen — keeping this card removed
            // avoids a routing dead-end.
            const SizedBox(height: 12),
            _buildActionCard(
              context,
              title: 'Live Streams',
              description: 'Broadcast or spectate live streams within the platform.',
              icon: Icons.live_tv_outlined,
              onTap: () => context.go('/stream'),
            ),
            const SizedBox(height: 12),
            _buildActionCard(
              context,
              title: 'Settings',
              description: 'API usage, push tokens, language detection, blocked users.',
              icon: Icons.settings_outlined,
              onTap: () => context.go('/settings'),
            ),
            const SizedBox(height: 24),
            Text('Your Rooms',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(color: Colors.white70)),
            const SizedBox(height: 8),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null)
              Text(_error!, style: const TextStyle(color: Colors.redAccent))
            else if (_rooms.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Text(
                  'No rooms yet — tap “New Room” below to create one.',
                  style: TextStyle(color: Colors.white54),
                  textAlign: TextAlign.center,
                ),
              )
            else
              ..._rooms.map((room) => _buildRoomTile(room)),
            const SizedBox(height: 80),
          ],
        ),
      ),
    );
  }

  Widget _buildRoomTile(Map<String, dynamic> room) {
    final id = (room['id'] ?? room['room_id'] ?? '').toString();
    final name = (room['room_name'] ?? id).toString();
    final type = (room['room_type'] ?? 'group').toString();
    final memberCount = room['member_count'] ?? room['members']?.length;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: () => context.go('/chat/$id'),
        onLongPress: () => _confirmLeave(room),
        borderRadius: BorderRadius.circular(12),
        child: GlassContainer(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor: AppTheme.primaryAccent.withOpacity(0.25),
                child: Text(name.substring(0, 1).toUpperCase(),
                    style: const TextStyle(color: Colors.white)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name,
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 2),
                    Text(
                      '$type · ${memberCount ?? '—'} members  ·  long-press to leave',
                      style: const TextStyle(color: Colors.white54, fontSize: 12),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.arrow_forward_ios, color: Colors.white30, size: 14),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActionCard(
    BuildContext context, {
    required String title,
    required String description,
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: GlassContainer(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.primaryAccent.withOpacity(0.2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: AppTheme.primaryAccent, size: 32),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(fontSize: 18),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    description,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.white60),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            const Icon(Icons.arrow_forward_ios, color: Colors.white30, size: 16),
          ],
        ),
      ),
    );
  }
}
