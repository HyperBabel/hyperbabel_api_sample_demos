import 'dart:io';
import 'package:dio/dio.dart';
import 'api_client.dart';

/// Repository for HyperBabel Storage APIs (presigned upload flow).
///
/// The platform-recommended upload pattern is:
///   1. POST /storage/presign  → returns a one-time PUT URL + storage key
///   2. PUT  binary bytes to the URL (no auth header — the URL is signed)
///   3. POST /storage/confirm  → server records the upload, returns CDN URL
class StorageRepository {
  final ApiClient _apiClient = ApiClient();

  /// Upload a local file by walking the 3-step presign flow. Returns the
  /// CDN-resolvable URL the chat layer should embed in `metadata.url`.
  Future<Map<String, dynamic>> uploadFile({
    required File file,
    required String filename,
    required String mimeType,
    String? channelId,
    String? folder,
  }) async {
    final fileSize = await file.length();

    // Step 1 — request a presigned URL.
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
    // cf_workers_api wraps the payload as `{ message, data: { upload_url, key, … } }`.
    // hb_api returned a flat `{ presigned_url, key }`. Tolerate both.
    final rawPresign = presignResp.data as Map<String, dynamic>;
    final presignData =
        (rawPresign['data'] as Map<String, dynamic>?) ?? rawPresign;
    final uploadUrl = (presignData['upload_url'] ??
        presignData['presigned_url']) as String;
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

    // Step 3 — confirm the upload so the server records it. Same envelope
    // unwrap — server returns `{ message, data: { url, key, … } }`.
    final confirmResp = await _apiClient.client.post(
      '/storage/confirm',
      data: {
        'key': storageKey,
        'originalName': filename,
      },
    );
    final rawConfirm = confirmResp.data as Map<String, dynamic>;
    return (rawConfirm['data'] as Map<String, dynamic>?) ?? rawConfirm;
  }
}
