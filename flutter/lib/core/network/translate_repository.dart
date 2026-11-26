import 'package:dio/dio.dart';
import 'api_client.dart';
import 'api_error.dart';

/// Subset of the HyperBabel AI Translation API (`/translate/*`).
///
/// ⚠️ EVERY CALL HERE NEEDS YOUR BACKEND — IT CANNOT RUN FROM THIS APP, AND
/// NOTHING IN THIS APP CALLS IT.
///
///   `/translate/*` authenticates with your ORGANIZATION API KEY only
///   (`Authorization: Bearer hb_live_…`). The end-user session token this demo
///   signs in with is rejected:
///
///       POST /api/v1/translate/detect
///       -> 401 { "error": { "code": "invalid_api_key_format" } }
///
///   …and every 401 also costs a needless session-token refresh. The API
///   client refuses to carry an org key on a device, so these calls fail here
///   by design.
///
///   Ship it as:  app -> your backend (holds hb_live_…) -> HyperBabel /translate/*
///   The paths and payloads below are accurate — implement them on your
///   server. To translate chat messages from the app itself, use the
///   end-user endpoint `UnitedChatRepository.batchTranslateMessages`.
class TranslateRepository {
  final ApiClient _apiClient = ApiClient();

  /// Detect the language of an arbitrary string. Returns a map containing
  /// `detected_language` and `confidence`.
  Future<Map<String, dynamic>> detectLanguage(String text) async {
    try {
      final response = await _apiClient.client.post(
        '/translate/detect',
        data: {'text': text},
      );
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception('Failed to detect language: ${apiErrorMessage(e)}');
    }
  }

  /// Translate a single string to the target language. Auto-detects the
  /// source language unless [sourceLanguage] is provided.
  Future<Map<String, dynamic>> translateText({
    required String text,
    required String targetLanguage,
    String? sourceLanguage,
  }) async {
    try {
      final response = await _apiClient.client.post(
        '/translate/text',
        data: {
          'text': text,
          'target_language': targetLanguage,
          if (sourceLanguage != null) 'source_language': sourceLanguage,
        },
      );
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception('Failed to translate text: ${apiErrorMessage(e)}');
    }
  }
}
