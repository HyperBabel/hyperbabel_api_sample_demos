import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final List<Map<String, String>> _messages = [
    {
      'sender_id': 'system',
      'content': 'Welcome to HyperBabel United Chat',
    },
    {
      'sender_id': 'remote_user',
      'content': 'Hello, are you receiving my translated messages?',
    }
  ];

  final TextEditingController _msgController = TextEditingController();

  void _sendMessage() {
    if (_msgController.text.trim().isEmpty) return;
    
    setState(() {
      _messages.add({
        'sender_id': 'local_user',
        'content': _msgController.text.trim(),
      });
    });
    _msgController.clear();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Translation Chat Room'),
      ),
      body: Column(
        children: [
          // Ensure messages area expands safely taking remaining space
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(16.0),
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                final msg = _messages[index];
                final isSystem = msg['sender_id'] == 'system';
                final isLocal = msg['sender_id'] == 'local_user';

                if (isSystem) {
                  return Center(
                    child: Container(
                      margin: const EdgeInsets.symmetric(vertical: 8.0),
                      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                      decoration: BoxDecoration(
                        color: Colors.white10,
                        borderRadius: BorderRadius.circular(16.0),
                      ),
                      // Text wrapped safely
                      child: Text(
                        msg['content']!,
                        style: const TextStyle(color: Colors.white70, fontSize: 12),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  );
                }

                return Align(
                  alignment: isLocal ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 12.0),
                    padding: const EdgeInsets.all(14.0),
                    // Prevent chat bubbles from overflowing the screen width limit
                    constraints: BoxConstraints(
                      maxWidth: MediaQuery.of(context).size.width * 0.75,
                    ),
                    decoration: BoxDecoration(
                      color: isLocal ? AppTheme.primaryAccent : AppTheme.surfaceDark,
                      borderRadius: BorderRadius.circular(16).copyWith(
                        bottomRight: isLocal ? const Radius.circular(0) : null,
                        bottomLeft: !isLocal ? const Radius.circular(0) : null,
                      ),
                    ),
                    child: Text(
                      msg['content']!,
                      style: const TextStyle(color: Colors.white, fontSize: 15),
                      // Automatically wraps to the next line preventing overflow
                      softWrap: true,
                    ),
                  ),
                );
              },
            ),
          ),
          
          SafeArea(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 8.0),
              color: AppTheme.surfaceDark,
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _msgController,
                      decoration: const InputDecoration(
                        hintText: 'Type a message...',
                        border: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        filled: false,
                        contentPadding: EdgeInsets.zero,
                      ),
                      // Wrapping max lines handling
                      maxLines: null,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _sendMessage(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    onPressed: _sendMessage,
                    icon: const Icon(Icons.send, color: AppTheme.primaryAccent),
                  ),
                ],
              ),
            ),
          )
        ],
      ),
    );
  }
}
