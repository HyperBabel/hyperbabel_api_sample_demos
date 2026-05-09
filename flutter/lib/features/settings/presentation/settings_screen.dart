import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/network/auth_repository.dart';
import '../../../core/network/push_repository.dart';
import '../../../core/network/translate_repository.dart';
import '../../../core/realtime/hyperbabel_realtime_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/glass_container.dart';

/// Settings — surfaces every account-level read endpoint the demo cares about
/// plus a small Language Detection playground. Webhooks are explicitly
/// excluded; manage those in the HyperBabel Console.
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final AuthRepository _auth = AuthRepository();
  final PushRepository _push = PushRepository();
  final TranslateRepository _translate = TranslateRepository();

  String? _userId;
  String? _apiUrl;
  String _langCode = 'en';

  Map<String, dynamic>? _usage;
  List<Map<String, dynamic>> _tokens = [];
  bool _loading = true;

  // Language playground state.
  final TextEditingController _detectInput = TextEditingController();
  String? _detectResult;
  bool _detecting = false;

  static const _languages = [
    ('en', 'English'),
    ('ko', '한국어'),
    ('ja', '日本語'),
    ('zh', '中文'),
    ('fr', 'Français'),
    ('es', 'Español'),
    ('de', 'Deutsch'),
  ];

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _detectInput.dispose();
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
    _apiUrl = prefs.getString('hb_api_url') ?? 'https://api.hyperbabel.com/api/v1';
    _langCode = prefs.getString('hb_lang_code') ?? 'en';
    await _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final results = await Future.wait([
      _auth.getUsage(),
      _push.getTokens(_userId!).catchError((_) => <Map<String, dynamic>>[]),
    ]);
    setState(() {
      _usage = results[0] as Map<String, dynamic>?;
      _tokens = results[1] as List<Map<String, dynamic>>;
      _loading = false;
    });
  }

  Future<void> _setLanguage(String code) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('hb_lang_code', code);
    setState(() => _langCode = code);
  }

  Future<void> _detect() async {
    final text = _detectInput.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _detecting = true;
      _detectResult = null;
    });
    try {
      final res = await _translate.detectLanguage(text);
      final lang = res['language'] ?? '?';
      final conf = (res['confidence'] as num?) ?? 0;
      setState(() => _detectResult = '$lang  (${(conf * 100).round()}% confidence)');
    } catch (e) {
      setState(() => _detectResult = 'Error: $e');
    } finally {
      setState(() => _detecting = false);
    }
  }

  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Logout?'),
        content: const Text('You can sign back in with your API key any time.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Logout'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('hb_user_id');
    await HyperBabelRealtimeClient().disconnect();
    if (!mounted) return;
    context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/home'),
        ),
        title: const Text('Settings'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _section('Profile'),
                GlassContainer(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      _row('User ID', _userId ?? '—'),
                      const Divider(color: Colors.white10),
                      _row('API Base URL', _apiUrl ?? '—'),
                    ],
                  ),
                ),
                _section('Language'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _languages.map((l) {
                    final active = l.$1 == _langCode;
                    return ChoiceChip(
                      label: Text(l.$2),
                      selected: active,
                      onSelected: (_) => _setLanguage(l.$1),
                    );
                  }).toList(),
                ),
                _section('Privacy'),
                _linkCard(
                  icon: Icons.block,
                  title: 'Blocked Users',
                  onTap: () => context.go('/blocks'),
                ),
                _section('API Usage'),
                GlassContainer(
                  padding: const EdgeInsets.all(16),
                  child: _usage == null
                      ? const Text('Unable to load usage stats.',
                          style: TextStyle(color: Colors.white54))
                      : Column(children: _usageRows(_usage!)),
                ),
                _section('Push Tokens'),
                GlassContainer(
                  padding: const EdgeInsets.all(16),
                  child: _tokens.isEmpty
                      ? const Text('No push tokens registered for this user yet.',
                          style: TextStyle(color: Colors.white54))
                      : Column(children: _tokens.map(_tokenRow).toList()),
                ),
                _section('Language Detection'),
                GlassContainer(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'Type any text and tap Detect to see what language the AI Translation engine identifies it as.',
                        style: TextStyle(color: Colors.white54, fontSize: 12),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _detectInput,
                              decoration: const InputDecoration(
                                hintText: 'Type something to detect…',
                              ),
                              onSubmitted: (_) => _detect(),
                            ),
                          ),
                          const SizedBox(width: 8),
                          FilledButton(
                            onPressed: _detecting ? null : _detect,
                            child: Text(_detecting ? '…' : 'Detect'),
                          ),
                        ],
                      ),
                      if (_detectResult != null) ...[
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.white10,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(_detectResult!,
                              style: const TextStyle(color: Colors.white)),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: _logout,
                  icon: const Icon(Icons.logout),
                  label: const Text('Logout'),
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.red,
                    minimumSize: const Size.fromHeight(48),
                  ),
                ),
                const SizedBox(height: 32),
              ],
            ),
    );
  }

  Widget _section(String label) => Padding(
        padding: const EdgeInsets.only(top: 24, bottom: 8),
        child: Text(
          label.toUpperCase(),
          style: const TextStyle(
            color: Colors.white60,
            fontSize: 11,
            letterSpacing: 1,
            fontWeight: FontWeight.bold,
          ),
        ),
      );

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Expanded(
              flex: 2,
              child: Text(label, style: const TextStyle(color: Colors.white60, fontSize: 13)),
            ),
            Expanded(
              flex: 5,
              child: Text(
                value,
                textAlign: TextAlign.right,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      );

  Widget _linkCard({required IconData icon, required String title, required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: GlassContainer(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(icon, color: AppTheme.primaryAccent),
            const SizedBox(width: 12),
            Expanded(
              child: Text(title,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
            ),
            const Icon(Icons.arrow_forward_ios, color: Colors.white30, size: 14),
          ],
        ),
      ),
    );
  }

  List<Widget> _usageRows(Map<String, dynamic> usage) {
    final period =
        '${usage['period_start'] ?? '—'} → ${usage['period_end'] ?? '—'}';
    final entries = <(String, dynamic, dynamic)>[
      ('Chat Messages', usage['chat_messages_sent'], usage['plan_limits']?['chat_messages']),
      ('Video Minutes', usage['video_minutes'], usage['plan_limits']?['video_minutes']),
      ('Stream Minutes', usage['stream_minutes'], usage['plan_limits']?['stream_minutes']),
      ('Translations', usage['translations'], usage['plan_limits']?['translations']),
    ];
    return [
      Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text('Period: $period',
            style: const TextStyle(color: Colors.white60, fontSize: 11)),
      ),
      ...entries.map((e) => _row(e.$1,
          '${e.$2 ?? '—'}${e.$3 != null ? '  /  ${e.$3}' : ''}')),
    ];
  }

  Widget _tokenRow(Map<String, dynamic> t) {
    final token = (t['token'] ?? '') as String;
    final platform = (t['platform'] ?? 'unknown') as String;
    final short = token.length > 24
        ? '${token.substring(0, 16)}…${token.substring(token.length - 4)}'
        : token;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: AppTheme.primaryAccent,
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(platform.toUpperCase(),
                style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(short,
                style: const TextStyle(color: Colors.white70, fontSize: 12),
                overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    );
  }
}
