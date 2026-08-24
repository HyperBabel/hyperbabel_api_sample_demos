import 'dart:async' show unawaited;
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/network/push_repository.dart';
import '../../../shared/widgets/glass_container.dart';

/// HyperBabel Flutter Demo — Login Screen
///
/// Single mode: Customer Auth pattern B1 (Firebase Direct Exchange).
///
///   1. The user signs in with Firebase Auth (Email/Password by default;
///      a one-tap "Anonymous" button is also exposed for kiosk-style use).
///   2. We exchange the resulting Firebase ID token for a HyperBabel
///      customer JWT via POST /customer/auth/firebase-exchange.
///   3. AuthController persists the JWT pair to flutter_secure_storage
///      (iOS Keychain / Android KeyStore). The API client attaches it
///      to every subsequent request.
///
/// If Firebase isn't initialised (no google-services.json /
/// GoogleService-Info.plist on the device) the screen renders a
/// setup-help banner instead of the form.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailCtrl    = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _displayCtrl  = TextEditingController();
  String _langCode    = 'en';
  bool _loading       = false;
  String? _errorMsg;

  static const _languages = <(String, String)>[
    ('en', 'English'),
    ('ko', '한국어 (Korean)'),
    ('ja', '日本語 (Japanese)'),
    ('zh', '中文 (Chinese)'),
    ('es', 'Español (Spanish)'),
    ('fr', 'Français (French)'),
    ('de', 'Deutsch (German)'),
    ('pt', 'Português (Portuguese)'),
  ];

  static const _logoPath = 'assets/images/hyperbabel.png';

  Future<void> _signInEmail() async {
    final email = _emailCtrl.text.trim();
    final pass  = _passwordCtrl.text;
    if (email.isEmpty || pass.isEmpty) {
      setState(() => _errorMsg = 'Please enter your email and password.');
      return;
    }
    await _runSignIn(() async {
      await ref.read(authControllerProvider.notifier).signInWithEmail(
            email:       email,
            password:    pass,
            langCode:    _langCode,
            displayName: _displayCtrl.text,
          );
    });
  }

  Future<void> _signInAnonymous() async {
    await _runSignIn(() async {
      await ref.read(authControllerProvider.notifier)
          .signInAnonymously(langCode: _langCode);
    });
  }

  Future<void> _runSignIn(Future<void> Function() action) async {
    setState(() {
      _errorMsg = null;
      _loading  = true;
    });
    try {
      await action();
      final user = ref.read(authControllerProvider).user;
      if (user != null) {
        // Best-effort push token registration. Failures don't block sign-in
        // and don't surface to the user — the demo continues without push
        // if FCM isn't configured.
        unawaited(_autoRegisterPushToken(user.userId));
      }
      if (mounted) context.go('/home');
    } catch (e) {
      setState(() => _errorMsg = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _autoRegisterPushToken(String userId) async {
    final platform = _detectPlatform();
    final prefs = await SharedPreferences.getInstance();
    var token = prefs.getString('hb_push_token');
    if (token == null) {
      // Synthetic token placeholder — production apps replace with the
      // real FCM / APNs token from FirebaseMessaging.instance.getToken().
      token = 'demo-flutter-$platform-${DateTime.now().millisecondsSinceEpoch}';
      await prefs.setString('hb_push_token', token);
    }
    await PushRepository().registerToken(
      userId:   userId,
      token:    token,
      platform: platform,
    );
  }

  String _detectPlatform() {
    if (kIsWeb) return 'web';
    if (Platform.isIOS) return 'ios';
    if (Platform.isAndroid) return 'android';
    return 'web';
  }

  @override
  Widget build(BuildContext context) {
    final auth          = ref.read(authControllerProvider.notifier);
    final firebaseReady = auth.isFirebaseReady;

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end:   Alignment.bottomRight,
            colors: [Color(0xFF0F1115), Color(0xFF1E293B)],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: GlassContainer(
                blurStrength: 15,
                padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Image.asset(
                      _logoPath,
                      height: 72,
                      errorBuilder: (_, __, ___) =>
                          const Icon(Icons.hub, size: 72, color: Colors.blueAccent),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'HyperBabel Demo',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(fontSize: 24),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Sign in with Firebase to explore the HyperBabel API',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white54, fontSize: 13),
                    ),
                    const SizedBox(height: 28),

                    if (!firebaseReady) ...[
                      _FirebaseMissingBanner(),
                    ] else ...[
                      if (_errorMsg != null) ...[
                        _ErrorBox(message: _errorMsg!),
                        const SizedBox(height: 12),
                      ],
                      TextField(
                        controller: _emailCtrl,
                        keyboardType: TextInputType.emailAddress,
                        autocorrect: false,
                        decoration: const InputDecoration(
                          labelText: 'Email',
                          prefixIcon: Icon(Icons.email_outlined),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _passwordCtrl,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'Password',
                          prefixIcon: Icon(Icons.lock_outline),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _displayCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Display name (optional)',
                          prefixIcon: Icon(Icons.person_outline),
                        ),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        value: _langCode,
                        decoration: const InputDecoration(
                          labelText: 'Preferred language',
                          prefixIcon: Icon(Icons.translate),
                        ),
                        items: [
                          for (final (code, label) in _languages)
                            DropdownMenuItem(value: code, child: Text(label)),
                        ],
                        onChanged: (v) => setState(() => _langCode = v ?? 'en'),
                      ),
                      const SizedBox(height: 24),
                      ElevatedButton(
                        onPressed: _loading ? null : _signInEmail,
                        child: _loading
                            ? const SizedBox(
                                height: 18, width: 18,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Text('Sign in'),
                      ),
                      const SizedBox(height: 16),
                      OutlinedButton(
                        onPressed: _loading ? null : _signInAnonymous,
                        child: const Text('Continue anonymously (kiosk mode)'),
                      ),
                    ],

                    const SizedBox(height: 16),
                    TextButton(
                      onPressed: () => context.go('/signup'),
                      child: const Text('New here? Create an account'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _FirebaseMissingBanner extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0x1AF59E0B),
        border: Border.all(color: const Color(0xFFF59E0B)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Firebase config missing',
            style: TextStyle(color: Color(0xFFFCD34D), fontWeight: FontWeight.w700),
          ),
          SizedBox(height: 6),
          Text(
            'Install google-services.json (Android) and '
            'GoogleService-Info.plist (iOS), then run the app again. '
            'See firebase/README.md and the project README → Quickstart '
            'for the full setup path, including how to allow-list your '
            'Firebase project in HyperBabel Console → Customer Auth.',
            style: TextStyle(color: Color(0xFFFDE68A), fontSize: 12, height: 1.4),
          ),
        ],
      ),
    );
  }
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0x1AEF4444),
        border: Border.all(color: const Color(0xFFDC2626)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(message, style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 13)),
    );
  }
}

