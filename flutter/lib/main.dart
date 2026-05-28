import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/auth/auth_controller.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/presentation/login_screen.dart';
import 'features/auth/presentation/signup_screen.dart';
import 'features/blocks/presentation/blocks_screen.dart';
import 'features/call/presentation/incoming_call_listener.dart';
import 'features/chat/presentation/chat_screen.dart';
import 'features/home/presentation/home_screen.dart';
import 'features/live_stream/presentation/live_stream_screen.dart';
import 'features/settings/presentation/settings_screen.dart';
import 'features/video_call/presentation/video_call_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Load .env. fileNotFound is tolerated — the app still builds, and the
  // sign-in screen renders a "config missing" notice instead of crashing.
  try {
    await dotenv.load(fileName: '.env');
  } catch (_) {
    // No .env present — defaults will apply where possible.
  }

  // Firebase. Wrapped in try/catch so the developer can browse the source
  // before populating firebase/google-services.json and GoogleService-Info.plist.
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // No native Firebase config — sign-in screen surfaces a setup hint.
  }

  runApp(
    const ProviderScope(
      child: HyperBabelDemoApp(),
    ),
  );
}

class HyperBabelDemoApp extends ConsumerWidget {
  const HyperBabelDemoApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authControllerProvider);

    final GoRouter router = GoRouter(
      initialLocation: '/login',
      redirect: (context, state) {
        // Wait until the controller has restored from secure storage.
        if (!authState.isReady) return null;
        final loggedIn  = authState.user != null;
        final isAuthRoute =
            state.matchedLocation == '/login' || state.matchedLocation == '/signup';
        if (!loggedIn && !isAuthRoute) return '/login';
        if (loggedIn  &&  isAuthRoute) return '/home';
        return null;
      },
      routes: [
        GoRoute(
          path: '/login',
          builder: (context, state) => const LoginScreen(),
        ),
        GoRoute(
          path: '/signup',
          builder: (context, state) => const SignUpScreen(),
        ),
        GoRoute(
          path: '/home',
          builder: (context, state) => const HomeScreen(),
        ),
        GoRoute(
          path: '/chat/:roomId',
          builder: (context, state) =>
              ChatScreen(roomId: state.pathParameters['roomId']!),
        ),
        GoRoute(
          path: '/video/:roomId',
          builder: (context, state) =>
              VideoCallScreen(roomId: state.pathParameters['roomId']!),
        ),
        GoRoute(
          path: '/stream',
          builder: (context, state) => const LiveStreamScreen(),
        ),
        GoRoute(
          path: '/settings',
          builder: (context, state) => const SettingsScreen(),
        ),
        GoRoute(
          path: '/blocks',
          builder: (context, state) => const BlocksScreen(),
        ),
      ],
    );

    return MaterialApp.router(
      title: 'HyperBabel Sample Demo',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      routerConfig: router,
      // The listener wraps every routed screen and renders an Accept / Reject
      // overlay when a CALL_INVITE arrives on the user's private channel.
      builder: (context, child) =>
          IncomingCallListener(child: child ?? const SizedBox.shrink()),
    );
  }
}
