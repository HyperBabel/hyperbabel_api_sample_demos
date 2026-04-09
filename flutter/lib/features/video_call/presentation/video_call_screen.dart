import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/glass_container.dart';

class VideoCallScreen extends StatelessWidget {
  const VideoCallScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Background representing remote user video stream placeholder
          Center(
            child: Icon(Icons.person, size: 100, color: Colors.white.withOpacity(0.3)),
          ),
          
          // Foreground localized view camera
          Positioned(
            top: 50,
            right: 20,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Container(
                width: 100,
                height: 150,
                color: Colors.grey.shade800,
                child: const Center(child: Icon(Icons.videocam, color: Colors.white54)),
              ),
            ),
          ),
          
          // Action Buttons overlay on bottom, wrapped to prevent bounds issues
          Align(
            alignment: Alignment.bottomCenter,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.only(bottom: 24.0),
                child: GlassContainer(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                  borderRadius: 30,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.mic_off, color: Colors.white),
                        onPressed: () {},
                      ),
                      const SizedBox(width: 16),
                      IconButton(
                        icon: const Icon(Icons.videocam_off, color: Colors.white),
                        onPressed: () {},
                      ),
                      const SizedBox(width: 16),
                      Container(
                        decoration: const BoxDecoration(
                          color: Colors.redAccent,
                          shape: BoxShape.circle,
                        ),
                        child: IconButton(
                          icon: const Icon(Icons.call_end, color: Colors.white),
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
