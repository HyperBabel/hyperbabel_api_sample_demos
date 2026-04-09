import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/network/api_client.dart';
import '../../shared/widgets/glass_container.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _apiKeyController = TextEditingController();
  final _userIdController = TextEditingController();
  
  // Hardcoded logo path based on provided artifact requirements
  final String _logoPath = 'assets/images/hyperbabel.png';

  @override
  void initState() {
    super.initState();
    _loadSavedCredentials();
  }

  Future<void> _loadSavedCredentials() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _apiKeyController.text = prefs.getString('hb_api_key') ?? '';
      _userIdController.text = prefs.getString('hb_user_id') ?? '';
    });
  }

  Future<void> _login() async {
    final apiKey = _apiKeyController.text.trim();
    final userId = _userIdController.text.trim();
    if (apiKey.isEmpty || userId.isEmpty) return;

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('hb_api_key', apiKey);
    await prefs.setString('hb_user_id', userId);

    // After setting the active credentials, navigate to home.
    if (mounted) {
      context.go('/home');
    }
  }

  @override
  Widget build(BuildContext context) {
    // Scaffold utilizing deep background
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFF0F1115),
              Color(0xFF1E293B),
            ],
          ),
        ),
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: GlassContainer(
              blurStrength: 15.0,
              padding: const EdgeInsets.symmetric(vertical: 40.0, horizontal: 24.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Image.asset(
                    _logoPath,
                    height: 80,
                    errorBuilder: (context, error, stackTrace) => 
                        const Icon(Icons.hub, size: 80, color: Colors.blueAccent),
                  ),
                  const SizedBox(height: 24),
                  
                  // Text overflow prevention using Flexible/Expanded inside rows is usually applied,
                  // but for a title, we ensure it centers and wraps cleanly.
                  Text(
                    'HyperBabel Demo',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontSize: 24,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Login strictly utilizing your Console API Key.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Colors.white54,
                    ),
                  ),
                  const SizedBox(height: 32),
                  
                  TextField(
                    controller: _apiKeyController,
                    decoration: const InputDecoration(
                      labelText: 'API Key',
                      prefixIcon: Icon(Icons.key),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _userIdController,
                    decoration: const InputDecoration(
                      labelText: 'User ID',
                      prefixIcon: Icon(Icons.person),
                    ),
                  ),
                  const SizedBox(height: 32),
                  
                  ElevatedButton(
                    onPressed: _login,
                    child: const Text('Connect'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
