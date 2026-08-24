import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../shared/widgets/glass_container.dart';

/// Sign up with Firebase Email/Password, then exchange the resulting ID
/// token for a HyperBabel customer JWT (pattern B1). The matching
/// `com_users` row is created server-side on first exchange, so no extra
/// "create user" call is needed.
class SignUpScreen extends ConsumerStatefulWidget {
  const SignUpScreen({super.key});

  @override
  ConsumerState<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends ConsumerState<SignUpScreen> {
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

  bool _isValidEmail(String s) =>
      RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(s);

  Future<void> _submit() async {
    final email = _emailCtrl.text.trim();
    final pass  = _passwordCtrl.text;
    if (!_isValidEmail(email)) {
      setState(() => _errorMsg = 'Please enter a valid email address.');
      return;
    }
    if (pass.length < 6) {
      setState(() => _errorMsg =
          'Password must be at least 6 characters (Firebase minimum).');
      return;
    }
    setState(() {
      _errorMsg = null;
      _loading  = true;
    });
    try {
      await ref.read(authControllerProvider.notifier).signUpWithEmail(
            email:       email,
            password:    pass,
            langCode:    _langCode,
            displayName: _displayCtrl.text,
          );
      if (mounted) context.go('/home');
    } catch (e) {
      setState(() => _errorMsg = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth         = ref.read(authControllerProvider.notifier);
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
                    const Icon(Icons.hub, size: 56, color: Colors.blueAccent),
                    const SizedBox(height: 16),
                    Text(
                      'Create your account',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(fontSize: 22),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'We use Firebase Auth on device, then exchange the '
                      'ID token for a short-lived HyperBabel customer JWT.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white54, fontSize: 13),
                    ),
                    const SizedBox(height: 24),

                    if (!firebaseReady) ...[
                      _FirebaseMissingBanner(),
                      const SizedBox(height: 16),
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
                          labelText: 'Password (min 6 chars)',
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
                        onPressed: _loading ? null : _submit,
                        child: _loading
                            ? const SizedBox(
                                height: 18, width: 18,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Text('Create account'),
                      ),
                    ],

                    const SizedBox(height: 16),
                    TextButton(
                      onPressed: () => context.go('/login'),
                      child: const Text('Already have an account? Sign in'),
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
            'GoogleService-Info.plist (iOS) via your platform tooling, '
            'and populate FIREBASE_* in .env. See firebase/README.md and '
            'the project README → Quickstart.',
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
