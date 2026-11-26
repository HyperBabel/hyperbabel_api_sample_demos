import 'dart:async';
import 'dart:io' show Platform;

import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:shared_preferences/shared_preferences.dart';

import '../auth/auth_controller.dart' show kPushTokenPrefKey;
import 'api_client.dart';
import 'api_error.dart';

/// Repository for push notification token management.
///
/// HyperBabel delivers push notifications only to **FCM registration
/// tokens** — on iOS too, where the token comes from Firebase Messaging (it
/// is NOT the raw APNs device token). Tokens FCM rejects are pruned on the
/// server, so never register a placeholder value.
class PushRepository {
  final ApiClient _apiClient = ApiClient();

  Future<void> registerToken({
    required String userId,
    required String token,
    required String platform, // 'ios' | 'android'
  }) async {
    try {
      await _apiClient.client.post(
        '/push/register',
        data: {
          'user_id': userId,
          'token': token,
          'platform': platform,
          'token_type': 'fcm',
        },
      );
    } on DioException catch (e) {
      throw Exception('Failed to register push token: ${apiErrorMessage(e)}');
    }
  }

  Future<void> unregisterToken({
    required String userId,
    required String token,
  }) async {
    try {
      await _apiClient.client.delete(
        '/push/unregister',
        data: {'user_id': userId, 'token': token},
      );
    } on DioException catch (e) {
      throw Exception('Failed to unregister push token: ${apiErrorMessage(e)}');
    }
  }

  Future<List<Map<String, dynamic>>> getTokens(String userId) async {
    try {
      final response = await _apiClient.client.get(
        '/push/tokens',
        queryParameters: {'user_id': userId},
      );
      final data = response.data as Map<String, dynamic>;
      final list = (data['tokens'] ?? []) as List<dynamic>;
      return list.cast<Map<String, dynamic>>();
    } on DioException catch (e) {
      throw Exception('Failed to fetch push tokens: ${apiErrorMessage(e)}');
    }
  }
}

/// Registers this device's real FCM token for the signed-in user — once per
/// app run per user, plus again whenever Firebase Messaging rotates it.
///
/// Needs the native push setup from the README (Firebase config files on
/// both platforms; on iOS also the Push Notifications capability and an APNs
/// key uploaded to Firebase). Without it no token can be obtained: nothing is
/// registered, and [lastProblem] says why — the Settings screen shows it.
class PushRegistration {
  PushRegistration._();

  static String? _registeredFor;
  static StreamSubscription<String>? _rotation;

  /// Why the last attempt did not register a token, or null after success.
  static String? lastProblem;

  static Future<void> registerThisDevice(String userId) async {
    if (_registeredFor == userId) return;
    _registeredFor = userId;
    try {
      final messaging = FirebaseMessaging.instance;
      // Shows the notification prompt on iOS and on Android 13+. A denied
      // prompt does not block the token — the device just shows no alerts.
      final settings = await messaging.requestPermission();
      if (Platform.isIOS) {
        // On iOS the FCM token is minted from the APNs token, which exists
        // only once the app is set up for push (see the README). It can
        // take a moment to arrive after launch.
        String? apns;
        for (var i = 0; i < 5 && apns == null; i++) {
          apns = await messaging.getAPNSToken();
          if (apns == null) await Future<void>.delayed(const Duration(seconds: 1));
        }
        if (apns == null) {
          _fail('No APNs token yet — enable the Push Notifications capability '
              'and upload an APNs key to Firebase (README → iOS setup).');
          return;
        }
      }
      final token = await messaging.getToken();
      if (token == null || token.isEmpty) {
        _fail('Firebase Messaging returned no FCM token.');
        return;
      }
      await _register(userId, token);
      lastProblem = settings.authorizationStatus == AuthorizationStatus.denied
          ? 'FCM token registered, but notifications are turned off for this '
              'app in the system settings.'
          : null;
      await _rotation?.cancel();
      _rotation = messaging.onTokenRefresh.listen((fresh) async {
        // Ignore a rotation that lands after this user signed out.
        final prefs = await SharedPreferences.getInstance();
        if (prefs.getString('hb_user_id') != userId) return;
        try {
          await _register(userId, fresh);
        } catch (e) {
          debugPrint('[HyperBabel] push token rotation: $e');
        }
      });
    } catch (e) {
      _fail('Push is not set up on this build: $e');
    }
  }

  /// Forget the registration — call on logout (the token itself is deleted
  /// on the server by `POST /customer/logout`).
  static Future<void> reset() async {
    _registeredFor = null;
    lastProblem = null;
    await _rotation?.cancel();
    _rotation = null;
  }

  static Future<void> _register(String userId, String token) async {
    await PushRepository().registerToken(
      userId: userId,
      token: token,
      platform: Platform.isIOS ? 'ios' : 'android',
    );
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(kPushTokenPrefKey, token);
  }

  static void _fail(String reason) {
    _registeredFor = null; // Let the next sign-in / launch try again.
    lastProblem = reason;
    debugPrint('[HyperBabel] $reason');
  }
}
