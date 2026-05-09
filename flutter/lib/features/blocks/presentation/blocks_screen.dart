import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/network/users_repository.dart';
import '../../../core/theme/app_theme.dart';

/// Block management — lists every user the signed-in account has globally
/// blocked, with search + simple pagination. Tap "Unblock" to lift a block.
class BlocksScreen extends StatefulWidget {
  const BlocksScreen({super.key});

  @override
  State<BlocksScreen> createState() => _BlocksScreenState();
}

class _BlocksScreenState extends State<BlocksScreen> {
  static const int _pageSize = 10;

  final UsersRepository _repo = UsersRepository();
  final TextEditingController _search = TextEditingController();

  String? _userId;
  List<Map<String, dynamic>> _blocked = [];
  bool _loading = true;
  String? _error;
  String _query = '';
  int _page = 0;
  String? _unblocking;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _search.dispose();
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
    await _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await _repo.getBlockList(_userId!);
      setState(() {
        _blocked = list;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _unblock(Map<String, dynamic> row) async {
    final blockedId = row['blocked_id'] as String?;
    if (blockedId == null || _userId == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Unblock user?'),
        content: Text(
          'Unblocking $blockedId will let their messages reach you in every room.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Unblock'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _unblocking = blockedId);
    try {
      await _repo.unblockUser(_userId!, blockedId);
      setState(() => _blocked.removeWhere((b) => b['blocked_id'] == blockedId));
    } catch (e) {
      _toast(e.toString());
    } finally {
      setState(() => _unblocking = null);
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _query.isEmpty
        ? _blocked
        : _blocked.where((b) =>
                ((b['blocked_id'] ?? '') as String).toLowerCase().contains(_query.toLowerCase()))
            .toList();
    final totalPages = (filtered.length / _pageSize).ceil().clamp(1, 999);
    final start = _page * _pageSize;
    final pageItems = filtered.skip(start).take(_pageSize).toList();

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/settings'),
        ),
        title: const Text('Blocked Users'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              controller: _search,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: 'Search by user ID…',
              ),
              onChanged: (v) {
                setState(() {
                  _query = v;
                  _page = 0;
                });
              },
            ),
            const SizedBox(height: 8),
            const Align(
              alignment: Alignment.centerLeft,
              child: Text(
                '⚠️ Blocks apply to every room, not just one.',
                style: TextStyle(color: Colors.white54, fontSize: 12),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                      ? Center(child: Text(_error!, style: const TextStyle(color: Colors.redAccent)))
                      : filtered.isEmpty
                          ? Center(
                              child: Text(
                                _query.isEmpty
                                    ? 'You haven’t blocked anyone yet.'
                                    : 'No matches.',
                                style: const TextStyle(color: Colors.white54),
                              ),
                            )
                          : ListView.builder(
                              itemCount: pageItems.length,
                              itemBuilder: (_, i) => _buildRow(pageItems[i]),
                            ),
            ),
            if (totalPages > 1)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    TextButton(
                      onPressed: _page > 0 ? () => setState(() => _page--) : null,
                      child: const Text('← Prev'),
                    ),
                    const SizedBox(width: 8),
                    Text('${_page + 1} / $totalPages',
                        style: const TextStyle(color: Colors.white70)),
                    const SizedBox(width: 8),
                    TextButton(
                      onPressed: _page < totalPages - 1 ? () => setState(() => _page++) : null,
                      child: const Text('Next →'),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildRow(Map<String, dynamic> row) {
    final blockedId = (row['blocked_id'] ?? '') as String;
    final createdAt = row['created_at'] as String?;
    return Card(
      color: AppTheme.surfaceDark,
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(blockedId, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
        subtitle: createdAt != null
            ? Text('Blocked at: $createdAt', style: const TextStyle(color: Colors.white54, fontSize: 11))
            : null,
        trailing: FilledButton(
          onPressed: _unblocking == blockedId ? null : () => _unblock(row),
          style: FilledButton.styleFrom(backgroundColor: Colors.red),
          child: Text(_unblocking == blockedId ? '…' : 'Unblock'),
        ),
      ),
    );
  }
}
