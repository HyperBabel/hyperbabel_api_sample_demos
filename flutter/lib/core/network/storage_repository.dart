import 'dart:io';
import 'package:dio/dio.dart';
import 'api_client.dart';
import 'api_error.dart';

/// Repository for HyperBabel Storage APIs (presigned upload flow).
///
/// The platform-recommended upload pattern is:
///   1. POST /storage/presign  → a one-time PUT URL + storage key. The PUT
///      URL is presigned (the signature is in its query string) and expires
///      after 15 minutes.
///   2. PUT  binary bytes to that URL — no Authorization header, and the
///      same Content-Type that was presigned.
///   3. POST /storage/confirm  → the server records the upload and returns
///      the file's `url`: a public HyperBabel Storage CDN address, NOT a
///      signed or expiring one — anyone who has the link can open the file,
///      so share it only inside the room it belongs to.
class StorageRepository {
  final ApiClient _apiClient = ApiClient();

  /// Upload a local file by walking the 3-step presign flow. Returns the
  /// confirm payload — `{ key, url, original_name, size_bytes, mime_type,
  /// message_type }`; the chat layer embeds `url` in `metadata.url`.
  Future<Map<String, dynamic>> uploadFile({
    required File file,
    required String filename,
    required String mimeType,
    String? channelId,
    String? folder,
  }) async {
    final fileSize = await file.length();
    try {
      // Step 1 — request a presigned URL. The API wraps the payload as
      // `{ message, data: { upload_url, key, expires_in, … } }`.
      final presignResp = await _apiClient.client.post(
        '/storage/presign',
        data: {
          'filename': filename,
          'mimeType': mimeType,
          'fileSize': fileSize,
          if (channelId != null) 'channelId': channelId,
          if (folder != null) 'folder': folder,
        },
      );
      final presignData = Map<String, dynamic>.from(
          (presignResp.data as Map)['data'] as Map);
      final uploadUrl = presignData['upload_url'] as String;
      final storageKey = presignData['key'] as String;

      // Step 2 — upload the binary to the presigned URL. We use a fresh Dio
      // instance because the presigned URL must NOT carry our Bearer auth.
      final upload = Dio();
      await upload.put(
        uploadUrl,
        data: file.openRead(),
        options: Options(
          headers: {
            Headers.contentLengthHeader: fileSize,
            Headers.contentTypeHeader: mimeType,
          },
        ),
      );

      // Step 3 — confirm the upload so the server records it. Same envelope:
      // `{ message, data: { key, url, … } }`.
      final confirmResp = await _apiClient.client.post(
        '/storage/confirm',
        data: {
          'key': storageKey,
          'originalName': filename,
        },
      );
      return Map<String, dynamic>.from(
          (confirmResp.data as Map)['data'] as Map);
    } on DioException catch (e) {
      throw Exception(apiErrorMessage(e));
    }
  }
}
