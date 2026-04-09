import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Core HTTP client for HyperBabel APIs matching the React implementation.
class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  
  late Dio _dio;

  ApiClient._internal() {
    _dio = Dio(BaseOptions(
      baseUrl: 'https://api.hyperbabel.com/api/v1', // Can be overridden in settings
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final prefs = await SharedPreferences.getInstance();
        final apiKey = prefs.getString('hb_api_key');
        if (apiKey != null && apiKey.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $apiKey';
        }
        return handler.next(options);
      },
    ));
  }

  Dio get client => _dio;

  /// Update the base URL dynamically based on user settings
  void updateBaseUrl(String newUrl) {
    _dio.options.baseUrl = newUrl;
  }
}
