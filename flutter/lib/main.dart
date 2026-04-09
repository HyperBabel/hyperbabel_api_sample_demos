import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/theme/app_theme.dart';

import 'features/auth/presentation/login_screen.dart';
import 'features/home/presentation/home_screen.dart';
import 'features/chat/presentation/chat_screen.dart';
import 'features/video_call/presentation/video_call_screen.dart';
import 'features/live_stream/presentation/live_stream_screen.dart';

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
    // Defines standard application navigation map using 2026 standard go_router
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
          path: '/chat',
          builder: (context, state) => const ChatScreen(),
        ),
        GoRoute(
          path: '/video',
          builder: (context, state) => const VideoCallScreen(),
        ),
        GoRoute(
          path: '/stream',
          builder: (context, state) => const LiveStreamScreen(),
        ),
      ],
    );

    return MaterialApp.router(
      title: 'HyperBabel Sample Demo',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      routerConfig: router,
    );
  }
}
