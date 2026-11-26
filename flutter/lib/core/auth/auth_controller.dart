import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'firebase_auth_service.dart';

/// HyperBabel Flutter Demo — Auth Controller
///
/// Identity + preferences live in Riverpod state; the customer
/// JWT pair lives in flutter_secure_storage (iOS Keychain / Android
/// KeyStore) so the API client can rotate it on 401 without round-tripping
/// through the widget tree.
///
/// Single mode: Customer Auth pattern B1 (Firebase Direct Exchange).
/// See https://hyperbabel.com/docs#customer-auth for the full architecture.

class AuthUser {
  const AuthUser({
    required this.userId,
    required this.userName,
    required this.langCode,
  });

  final String userId;
  final String userName;
  final String langCode;
}

class AuthState {
  const AuthState({this.user, this.isReady = false});
  final AuthUser? user;
  final bool isReady;

  AuthState copyWith({AuthUser? user, bool? isReady, bool clearUser = false}) {
    return AuthState(
      user:    clearUser ? null : (user ?? this.user),
      isReady: isReady ?? this.isReady,
    );
  }
}

// ── Storage keys (secure) ───────────────────────────────────────────────
const _kAccessToken  = 'hb_access_token';
const _kRefreshToken = 'hb_refresh_token';
const _kExpiresAt    = 'hb_expires_at';

// ── Storage keys (preferences — non-secret) ─────────────────────────────
const _kUserId       = 'hb_user_id';
const _kUserName     = 'hb_user_name';
const _kLangCode     = 'hb_lang';

/// The FCM token this device registered with `POST /push/register` (written
/// by `PushRegistration` in push_repository.dart). Sent to
/// `POST /customer/logout` so the server deletes it on logout.
const kPushTokenPrefKey = 'hb_push_token';

/// HyperBabel accepts display names of 1–60 characters.
const _kMaxDisplayNameLength = 60;

const _secure = FlutterSecureStorage(
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
);

class AuthController extends StateNotifier<AuthState> {
  AuthController({FirebaseAuthService? authService})
      : _auth = authService ?? FirebaseAuthService(),
        super(const AuthState()) {
    _restore();
  }

  final FirebaseAuthService _auth;

  bool get isFirebaseReady => _auth.isFirebaseReady;

  Future<void> _restore() async {
    final hasToken = (await _secure.read(key: _kAccessToken))?.isNotEmpty ?? false;
    if (!hasToken) {
      state = state.copyWith(isReady: true);
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    final userId   = prefs.getString(_kUserId);
    final userName = prefs.getString(_kUserName) ?? userId ?? '';
    final lang     = prefs.getString(_kLangCode) ?? 'en';
    if (userId == null || userId.isEmpty) {
      state = state.copyWith(isReady: true);
      return;
    }
    state = AuthState(
      user: AuthUser(userId: userId, userName: userName, langCode: lang),
      isReady: true,
    );
  }

  Future<void> signInWithEmail({
    required String email,
    required String password,
    required String langCode,
    String? displayName,
  }) async {
    final result = await _auth.signInWithEmail(
      email: email, password: password, preferredLangCd: langCode,
    );
    await _persist(result, displayName: displayName, langCode: langCode);
  }

  Future<void> signUpWithEmail({
    required String email,
    required String password,
    required String langCode,
    String? displayName,
  }) async {
    final result = await _auth.signUpWithEmail(
      email: email, password: password, preferredLangCd: langCode,
    );
    await _persist(result, displayName: displayName, langCode: langCode);
  }

  Future<void> signInAnonymously({required String langCode}) async {
    final result = await _auth.signInAnonymously(preferredLangCd: langCode);
    await _persist(result, displayName: null, langCode: langCode);
  }

  /// Sign out. With [notifyServer] (the default) this first calls
  /// `POST /customer/logout { refresh_token, push_tokens }` so the server
  /// revokes the session and deletes this device's push token — BEFORE the
  /// tokens are cleared locally, because the call needs the refresh token. A
  /// failed server call never blocks the logout; local state is cleared
  /// either way.
  ///
  /// Pass `notifyServer: false` when the server already ended the session
  /// (the refresh token was rejected) — there is nothing left to revoke.
  Future<void> logout({bool notifyServer = true}) async {
    final prefs = await SharedPreferences.getInstance();
    if (notifyServer) {
      final refreshToken = await _secure.read(key: _kRefreshToken);
      final pushToken = prefs.getString(kPushTokenPrefKey);
      if (refreshToken != null && refreshToken.isNotEmpty) {
        try {
          await _auth.logoutSession(
            refreshToken: refreshToken,
            pushTokens: [if (pushToken != null && pushToken.isNotEmpty) pushToken],
          );
        } catch (e) {
          debugPrint('[HyperBabel] $e — continuing with the local logout.');
        }
      }
    }
    await Future.wait([
      _secure.delete(key: _kAccessToken),
      _secure.delete(key: _kRefreshToken),
      _secure.delete(key: _kExpiresAt),
    ]);
    await prefs.remove(_kUserId);
    await prefs.remove(_kUserName);
    await prefs.remove(_kLangCode);
    await prefs.remove(kPushTokenPrefKey);
    await _auth.signOut();
    state = state.copyWith(clearUser: true);
  }

  Future<void> updateLang(String langCode) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kLangCode, langCode);
    final current = state.user;
    if (current != null) {
      state = state.copyWith(user: AuthUser(
        userId:   current.userId,
        userName: current.userName,
        langCode: langCode,
      ));
    }
  }

  Future<void> _persist(
    FirebaseExchangeResult result, {
    required String? displayName,
    required String langCode,
  }) async {
    await Future.wait([
      _secure.write(key: _kAccessToken,  value: result.accessToken),
      _secure.write(key: _kRefreshToken, value: result.refreshToken),
      _secure.write(key: _kExpiresAt,    value: result.expiresAt.toString()),
    ]);
    final typedName = _trimDisplayName(displayName);
    if (typedName != null) {
      // Save the typed name on the server too. Until this lands, other
      // members see the name HyperBabel took from the Firebase profile — for
      // an email sign-up that is the email address.
      try {
        await _auth.updateDisplayName(
          accessToken: result.accessToken,
          displayName: typedName,
        );
      } catch (e) {
        debugPrint('[HyperBabel] $e');
      }
    }
    final resolvedName = typedName ??
        result.externalUserId.substring(0, result.externalUserId.length.clamp(0, 8));
    final resolvedLang = result.preferredLangCd ?? langCode;

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kUserId,   result.externalUserId);
    await prefs.setString(_kUserName, resolvedName);
    await prefs.setString(_kLangCode, resolvedLang);

    state = AuthState(
      user: AuthUser(
        userId:   result.externalUserId,
        userName: resolvedName,
        langCode: resolvedLang,
      ),
      isReady: true,
    );
  }

  /// The typed display name, trimmed and capped at the server's limit, or
  /// null when nothing was typed.
  static String? _trimDisplayName(String? raw) {
    final name = raw?.trim() ?? '';
    if (name.isEmpty) return null;
    return name.length > _kMaxDisplayNameLength
        ? name.substring(0, _kMaxDisplayNameLength)
        : name;
  }
}

final authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>((ref) {
  return AuthController();
});

// Convenience — read access token / refresh token directly from secure
// storage. Used by api_client.dart in interceptors.
Future<String?> readAccessToken()  => _secure.read(key: _kAccessToken);
Future<String?> readRefreshToken() => _secure.read(key: _kRefreshToken);
Future<int?>    readExpiresAt() async {
  final raw = await _secure.read(key: _kExpiresAt);
  if (raw == null) return null;
  return int.tryParse(raw);
}
Future<void> writeRefreshedTokens({
  required String accessToken,
  required String refreshToken,
  required int expiresAt,
}) async {
  await Future.wait([
    _secure.write(key: _kAccessToken,  value: accessToken),
    _secure.write(key: _kRefreshToken, value: refreshToken),
    _secure.write(key: _kExpiresAt,    value: expiresAt.toString()),
  ]);
}
