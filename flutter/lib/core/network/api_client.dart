import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import '../auth/auth_controller.dart';

/// HyperBabel Flutter Demo — Base HTTP Client (Customer Auth pattern B1)
///
/// The demo authenticates end-users with Firebase on device, then
/// exchanges the resulting Firebase ID token at HyperBabel for a
/// short-lived customer JWT. The customer JWT pair lives in
/// flutter_secure_storage (Keychain / KeyStore); this client reads the
/// access token on every request and transparently refreshes via
/// POST /customer/refresh on 401.
///
/// The integrator's organization API key (`hb_live_…` / `hb_test_…`)
/// MUST NOT ship in the application binary. The client throws at
/// startup if it ever sees one — that catches accidental copies from
/// server-side examples before they reach production.
class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;

  late Dio _dio;

  /// Refresh proactively when fewer than this many seconds remain.
  /// Matches https://hyperbabel.com/docs#customer-auth guidance.
  static const _refreshLeadSeconds = 300;

  /// Shared inflight future so a burst of expirations only triggers a
  /// single POST /customer/refresh round-trip.
  Future<String?>? _refreshInflight;

  ApiClient._internal() {
    _guardEnvKey();

    _dio = Dio(BaseOptions(
      baseUrl: dotenv.env['HB_API_URL'] ?? 'https://api.hyperbabel.com/api/v1',
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
      },
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest:  _onRequest,
      onError:    _onError,
    ));
  }

  Dio get client => _dio;

  /// Override the base URL (e.g. for private HyperBabel deployments).
  void updateBaseUrl(String newUrl) {
    _dio.options.baseUrl = newUrl;
  }

  // ── Guards ──────────────────────────────────────────────────────────

  void _guardEnvKey() {
    final envKey = dotenv.env['HB_API_KEY'];
    if (envKey != null && _looksLikeOrgKey(envKey)) {
      throw StateError(
        'HyperBabel security: HB_API_KEY in .env contains an org API key. '
        'This demo only accepts customer JWTs minted via Firebase Direct '
        'Exchange. Remove the variable and use the Firebase sign-in flow.',
      );
    }
  }

  bool _looksLikeOrgKey(String s) =>
      s.startsWith('hb_live_') || s.startsWith('hb_test_');

  // ── Interceptors ────────────────────────────────────────────────────

  Future<void> _onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _ensureFreshToken();
    if (token != null && token.isNotEmpty) {
      if (_looksLikeOrgKey(token)) {
        handler.reject(DioException(
          requestOptions: options,
          type: DioExceptionType.unknown,
          error: StateError(
            'HyperBabel security: refusing to send an org API key from the '
            'device. Only customer JWTs belong here.',
          ),
        ));
        return;
      }
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  Future<void> _onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    // Reactive refresh for any 401 the proactive refresh missed (clock
    // skew, server-side revocation, etc.). Retry the original request
    // once with the new access token.
    final originalReq = err.requestOptions;
    final isRetried   = originalReq.extra['retried'] == true;
    if (err.response?.statusCode == 401 && !isRetried) {
      final refreshed = await _attemptRefresh();
      if (refreshed != null) {
        originalReq.headers['Authorization'] = 'Bearer $refreshed';
        originalReq.extra['retried'] = true;
        try {
          final response = await _dio.fetch<dynamic>(originalReq);
          return handler.resolve(response);
        } catch (e) {
          // fall through to error
        }
      }
    }
    handler.next(err);
  }

  /// Refresh up-front if the cached expiry is within _refreshLeadSeconds.
  /// Returns the (possibly refreshed) access token.
  Future<String?> _ensureFreshToken() async {
    final token = await readAccessToken();
    if (token == null || token.isEmpty) return token;
    final expiresAt = await readExpiresAt();
    if (expiresAt == null) return token;
    final secondsLeft = expiresAt - (DateTime.now().millisecondsSinceEpoch ~/ 1000);
    if (secondsLeft > _refreshLeadSeconds) return token;
    return (await _attemptRefresh()) ?? token;
  }

  Future<String?> _attemptRefresh() {
    final inflight = _refreshInflight;
    if (inflight != null) return inflight;

    final future = () async {
      try {
        final refreshToken = await readRefreshToken();
        if (refreshToken == null || refreshToken.isEmpty) return null;

        // Use a bare Dio instance so this call doesn't recurse through
        // our own interceptors.
        final bare = Dio(BaseOptions(
          baseUrl: _dio.options.baseUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 10),
        ));
        final res = await bare.post<Map<String, dynamic>>(
          '/customer/refresh',
          data: {'refresh_token': refreshToken},
          options: Options(headers: {'Content-Type': 'application/json'}),
        );
        final data = res.data;
        if (data == null) return null;

        await writeRefreshedTokens(
          accessToken:  data['access_token']  as String,
          refreshToken: data['refresh_token'] as String,
          expiresAt:    data['expires_at']    as int,
        );
        return data['access_token'] as String;
      } catch (_) {
        return null;
      } finally {
        _refreshInflight = null;
      }
    }();

    _refreshInflight = future;
    return future;
  }
}
