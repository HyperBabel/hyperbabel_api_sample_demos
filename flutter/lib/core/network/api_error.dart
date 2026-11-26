import 'package:dio/dio.dart';

/// A readable message for a failed HyperBabel API call.
///
/// The HyperBabel API answers errors in two shapes, and this reads both so
/// the server's own message is never lost:
///
///     { "error": { "code": "forbidden", "message": "Only owner or sub_admin can ban users" } }
///     { "error": "Firebase project \"my-app\" is not registered with HyperBabel" }
///
/// The second shape is what the most common setup mistake returns — a
/// Firebase project that is not allow-listed in the HyperBabel Console
/// (HTTP 401). Reading only `error.message` would reduce it to "HTTP 401".
String apiErrorMessage(Object error) {
  if (error is! DioException) return error.toString();
  final status = error.response?.statusCode;
  final message = _serverMessage(error.response?.data);
  if (message != null) {
    return status == null ? message : '$message (HTTP $status)';
  }
  if (status != null) return 'HTTP $status';
  // No response at all — timeout, DNS failure, no network.
  return error.message ?? 'Network error (${error.type.name})';
}

String? _serverMessage(dynamic body) {
  if (body is String) {
    final text = body.trim();
    if (text.isEmpty) return null;
    return text.length > 200 ? '${text.substring(0, 200)}…' : text;
  }
  if (body is! Map) return null;
  final err = body['error'];
  if (err is String && err.isNotEmpty) return err;
  if (err is Map) {
    // `{ code, message }`; a few validation errors carry `{ code, issues }`
    // without a message — the code is still more useful than nothing.
    final msg = err['message'] ?? err['code'];
    if (msg != null) return '$msg';
  }
  if (err is List && err.isNotEmpty) {
    // A few endpoints answer a validation failure with a list of issues.
    final first = err.first;
    final msg = first is Map ? first['message'] : first;
    if (msg != null) return '$msg';
  }
  final msg = body['message'];
  return msg == null ? null : '$msg';
}
