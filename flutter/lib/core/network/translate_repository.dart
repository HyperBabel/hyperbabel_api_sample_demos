import 'package:dio/dio.dart';
import 'api_client.dart';

/// Subset of the AI Translation API used by the demo's Settings playground.
class TranslateRepository {
  final ApiClient _apiClient = ApiClient();

  /// Detect the language of an arbitrary string. Returns a map containing
  /// `language` (BCP-47 code) and `confidence` (0..1).
  Future<Map<String, dynamic>> detectLanguage(String text) async {
    try {
      final response = await _apiClient.client.post(
        '/translate/detect',
        data: {'text': text},
      );
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw Exception('Failed to detect language: ${e.message}');
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
      throw Exception('Failed to translate text: ${e.message}');
    }
  }
}
