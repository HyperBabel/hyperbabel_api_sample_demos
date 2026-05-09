import 'package:dio/dio.dart';
import 'api_client.dart';

/// Auth & account-level read endpoints exposed in the public Swagger.
///
/// Webhook CRUD is intentionally not surfaced here — it is a tenant-admin
/// operation that lives in the HyperBabel Console.
class AuthRepository {
  final ApiClient _apiClient = ApiClient();

  /// Monthly API usage breakdown by service.
  Future<Map<String, dynamic>?> getUsage() async {
    try {
      final response = await _apiClient.client.get('/auth/usage');
      return (response.data as Map<String, dynamic>?);
    } on DioException catch (_) {
      return null;
    }
  }
}
