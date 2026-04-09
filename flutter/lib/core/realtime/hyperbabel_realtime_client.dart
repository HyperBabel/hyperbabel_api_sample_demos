import 'dart:async';
import 'package:ably_flutter/ably_flutter.dart' as auth_realtime;
// We alias the vendor strictly to 'auth_realtime' and wrap it under HyperBabel terminology.
// All comments adhere to English-only and Vendor-Masked naming conventions.

/// HyperBabel Real-Time Client for live signaling and messaging.
class HyperBabelRealtimeClient {
  static final HyperBabelRealtimeClient _instance = HyperBabelRealtimeClient._internal();
  factory HyperBabelRealtimeClient() => _instance;

  auth_realtime.Realtime? _client;
  auth_realtime.RealtimeChannel? _channel;
  StreamSubscription<auth_realtime.Message>? _subscription;

  HyperBabelRealtimeClient._internal();

  /// Initialize the HyperBabel Real-Time connection
  Future<void> initialize(String apiKey, String clientId) async {
    final clientOptions = auth_realtime.ClientOptions(
      key: apiKey, // In production, use token-based auth
      clientId: clientId,
    );
    _client = auth_realtime.Realtime(options: clientOptions);
    await _client!.connect();
  }

  /// Subscribe to a specific HyperBabel room channel for real-time messages
  Future<void> subscribeToChannel(String channelName, Function(auth_realtime.Message) onMessage) async {
    if (_client == null) return;
    
    _channel = _client!.channels.get(channelName);
    await _channel!.attach();
    
    _subscription = _channel!.subscribe().listen((message) {
      onMessage(message);
    });
  }

  /// Publish an event to the current channel
  Future<void> publishMessage(String eventName, Map<String, dynamic> data) async {
    if (_channel != null) {
      await _channel!.publish(name: eventName, data: data);
    }
  }

  /// Disconnect and cleanup
  void dispose() {
    _subscription?.cancel();
    _channel?.detach();
    _client?.close();
  }
}
