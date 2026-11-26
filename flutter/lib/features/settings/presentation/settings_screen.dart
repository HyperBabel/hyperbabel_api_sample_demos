import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/push_repository.dart';
import '../../../core/realtime/hyperbabel_realtime_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/glass_container.dart';

/// Settings — profile, language preference, blocked users and push tokens.
/// Webhooks are explicitly excluded; manage those in the HyperBabel Console.
///
/// Organization usage and plan data are not shown: they are business data
/// for your backend, read with the organization API key, and are not
/// available to end-user apps.
///
/// There is no language-detection playground: `/translate/*` authenticates
/// with your organization API key only, so it belongs on your backend — never
/// in an app that signs in end users.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final PushRepository _push = PushRepository();

  String? _userId;
  String? _apiUrl;

  List<Map<String, dynamic>> _tokens = [];
  bool _loading = true;

  static const _languages = [
    ('en', 'English'),
    ('ko', '한국어 (Korean)'),
    ('ja', '日本語 (Japanese)'),
    ('zh', '中文 (Chinese)'),
    ('fr', 'Français (French)'),
    ('es', 'Español (Spanish)'),
    ('de', 'Deutsch (German)'),
  ];

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    final userId = prefs.getString('hb_user_id');
    if (userId == null) {
      if (mounted) context.go('/login');
      return;
    }
    _userId = userId;
    // The base URL every request actually uses (`HB_API_URL`, or the default).
    _apiUrl = ApiClient().client.options.baseUrl;
    await _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final tokens = await _push
        .getTokens(_userId!)
        .catchError((_) => <Map<String, dynamic>>[]);
    setState(() {
      _tokens = tokens;
      _loading = false;
    });
  }

  /// The language preference lives in the auth controller (stored with the
  /// signed-in user), not in a key of this screen's own.
  Future<void> _setLanguage(String code) =>
      ref.read(authControllerProvider.notifier).updateLang(code);

  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Logout?'),
        content: const Text('You can sign back in any time.'),
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
    await HyperBabelRealtimeClient().disconnect();
    await PushRegistration.reset();
    // Calls POST /customer/logout { refresh_token, push_tokens } first — the
    // server revokes the session and deletes this device's push token — then
    // clears the session tokens and the signed-in user. The auth state change
    // is what routes back to /login and stops the incoming-call listener.
    await ref.read(authControllerProvider.notifier).logout();
    if (!mounted) return;
    context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    final langCode = ref.watch(authControllerProvider).user?.langCode ?? 'en';
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
                    final active = l.$1 == langCode;
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
                _section('Push Tokens'),
                GlassContainer(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (_tokens.isEmpty)
                        const Text('No push tokens registered for this user yet.',
                            style: TextStyle(color: Colors.white54))
                      else
                        ..._tokens.map(_tokenRow),
                      // Why this device's FCM token could not be registered
                      // (usually: the native push setup from the README).
                      if (PushRegistration.lastProblem != null) ...[
                        const SizedBox(height: 8),
                        Text(PushRegistration.lastProblem!,
                            style: const TextStyle(color: Colors.amber, fontSize: 12)),
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
