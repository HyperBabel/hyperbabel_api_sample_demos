import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import '../network/api_error.dart';

/// HyperBabel Flutter Demo — Firebase Auth → Customer JWT bridge
///
/// Implements pattern B1 from https://hyperbabel.com/docs#customer-auth (Firebase Direct
/// Exchange):
///
///   1. The user signs in (or signs up) with Firebase Auth on device.
///   2. We pull the Firebase ID token from the resulting Firebase user.
///   3. POST /api/v1/customer/auth/firebase-exchange exchanges the ID
///      token for a HyperBabel customer JWT pair (access + refresh).
///   4. AuthController persists the JWT pair to secure storage; the API
///      client attaches it to every subsequent request and refreshes
///      transparently on 401. The Firebase ID token never leaves the
///      device after exchange.
///
/// The device never sees the integrator's org API key — the HyperBabel
/// API resolves the org from the Firebase project ID claim after
/// verifying the signature against Google JWKS.
///
/// Prerequisites:
///   1. `google-services.json` in `android/app/` (with the Google Services
///      Gradle plugin applied) and `GoogleService-Info.plist` added to the
///      Runner target in Xcode. See `firebase/README.md`.
///   2. Email/Password (and Anonymous if you want kiosk mode) enabled
///      in Firebase Console → Authentication → Sign-in method.
///   3. Your Firebase project ID allow-listed in HyperBabel Console
///      → Customer Auth → Add Firebase project. Without it the exchange
///      answers 401 `Firebase project "<id>" is not registered with
///      HyperBabel`.
class FirebaseExchangeResult {
  final String accessToken;
  final String refreshToken;
  final int expiresAt;
  final int refreshExpiresAt;
  final String userId;
  final String externalUserId;
  final String orgId;
  final String sessionId;
  final String? preferredLangCd;

  FirebaseExchangeResult.fromJson(Map<String, dynamic> json)
      : accessToken      = json['access_token']  as String,
        refreshToken     = json['refresh_token'] as String,
        expiresAt        = json['expires_at']    as int,
        refreshExpiresAt = json['refresh_expires_at'] as int,
        userId           = json['user_id']       as String,
        externalUserId   = json['external_user_id'] as String,
        orgId            = json['org_id']        as String,
        sessionId        = json['session_id']    as String,
        preferredLangCd  = json['preferred_lang_cd'] as String?;
}

class FirebaseAuthService {
  FirebaseAuthService({Dio? dio}) : _dio = dio ?? Dio();

  final Dio _dio;

  String get _baseUrl =>
      dotenv.env['HB_API_URL'] ?? 'https://api.hyperbabel.com/api/v1';

  /// True iff the Firebase native plugin is initialised. Returns false
  /// when the developer hasn't dropped `google-services.json` /
  /// `GoogleService-Info.plist` into the platform folders — the UI uses
  /// this to render a setup notice instead of crashing on the first
  /// auth call.
  bool get isFirebaseReady {
    try {
      // ignore: unnecessary_null_comparison
      return FirebaseAuth.instance != null;
    } catch (_) {
      return false;
    }
  }

  Future<FirebaseExchangeResult> signInWithEmail({
    required String email,
    required String password,
    String? preferredLangCd,
  }) async {
    final cred = await FirebaseAuth.instance
        .signInWithEmailAndPassword(email: email, password: password);
    return _exchange(cred.user!, preferredLangCd);
  }

  Future<FirebaseExchangeResult> signUpWithEmail({
    required String email,
    required String password,
    String? preferredLangCd,
  }) async {
    final cred = await FirebaseAuth.instance
        .createUserWithEmailAndPassword(email: email, password: password);
    return _exchange(cred.user!, preferredLangCd);
  }

  Future<FirebaseExchangeResult> signInAnonymously({
    String? preferredLangCd,
  }) async {
    final cred = await FirebaseAuth.instance.signInAnonymously();
    return _exchange(cred.user!, preferredLangCd);
  }

  Future<void> signOut() async {
    try {
      await FirebaseAuth.instance.signOut();
    } catch (_) {
      // ignore — no user signed in
    }
  }

  /// Set the name other members see. On first sign-in HyperBabel names the
  /// user after the Firebase profile — the display name, or the EMAIL when
  /// there is none — so call this right after the exchange whenever the user
  /// typed a name, or other members see their email address.
  ///
  /// `PATCH /customer/users/me { display_name }` (1–60 characters) with the
  /// access token the exchange just returned.
  Future<void> updateDisplayName({
    required String accessToken,
    required String displayName,
  }) async {
    try {
      await _dio.patch<dynamic>(
        '$_baseUrl/customer/users/me',
        data: {'display_name': displayName},
        options: Options(headers: {
          'Authorization': 'Bearer $accessToken',
          'Content-Type':  'application/json',
        }),
      );
    } on DioException catch (e) {
      throw Exception('Could not save the display name: ${apiErrorMessage(e)}');
    }
  }

  /// End the session on the server: `POST /customer/logout` revokes the
  /// refresh token and deletes the push tokens this device registered, so
  /// the next person to sign in here does not receive the previous user's
  /// notifications. No Authorization header — the refresh token in the body
  /// authenticates the call. Idempotent: an already-ended session answers 200.
  Future<void> logoutSession({
    required String refreshToken,
    List<String> pushTokens = const [],
  }) async {
    try {
      await _dio.post<dynamic>(
        '$_baseUrl/customer/logout',
        data: {
          'refresh_token': refreshToken,
          if (pushTokens.isNotEmpty) 'push_tokens': pushTokens,
        },
        options: Options(headers: {'Content-Type': 'application/json'}),
      );
    } on DioException catch (e) {
      throw Exception('Server logout failed: ${apiErrorMessage(e)}');
    }
  }

  Future<FirebaseExchangeResult> _exchange(User user, String? lang) async {
    final idToken = await user.getIdToken(true);
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '$_baseUrl/customer/auth/firebase-exchange',
        data: lang != null ? {'preferred_lang_cd': lang} : <String, dynamic>{},
        options: Options(headers: {
          'Authorization': 'Bearer $idToken',
          'Content-Type':  'application/json',
        }),
      );
      final data = res.data;
      if (data == null) {
        throw Exception('Exchange returned an empty body');
      }
      return FirebaseExchangeResult.fromJson(data);
    } on DioException catch (e) {
      // Keep the server's message — e.g. 401 "Firebase project … is not
      // registered with HyperBabel" when the allow-list step was skipped.
      throw Exception('HyperBabel sign-in failed: ${apiErrorMessage(e)}');
    }
  }
}
