import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/theme/app_theme.dart';

import 'features/auth/presentation/login_screen.dart';
import 'features/blocks/presentation/blocks_screen.dart';
import 'features/call/presentation/incoming_call_listener.dart';
import 'features/chat/presentation/chat_screen.dart';
import 'features/home/presentation/home_screen.dart';
import 'features/live_stream/presentation/live_stream_screen.dart';
import 'features/settings/presentation/settings_screen.dart';
import 'features/video_call/presentation/video_call_screen.dart';

void main() {
  runApp(
    const ProviderScope(
      child: HyperBabelDemoApp(),
    ),
  );
}

class HyperBabelDemoApp extends StatelessWidget {
  const HyperBabelDemoApp({super.key});

  @override
  Widget build(BuildContext context) {
    final GoRouter router = GoRouter(
      initialLocation: '/login',
      routes: [
        GoRoute(
          path: '/login',
          builder: (context, state) => const LoginScreen(),
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
