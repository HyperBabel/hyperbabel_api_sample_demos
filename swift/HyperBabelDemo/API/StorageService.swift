/*
 * HyperBabel API — Storage (3-step presign upload).
 *
 *   1. POST /storage/presign  → returns a one-time PUT URL + storage key
 *   2. PUT  binary bytes to the URL (no auth — the URL is signed)
 *   3. POST /storage/confirm  → server records the upload, returns CDN URL
 *
 * The cf_workers_api responses for both presign and confirm wrap their
 * payload under `{ message, data: {…} }`, mirroring the legacy hb_api
 * controller. Decoding has to peel that envelope off.
 */
import Foundation

struct PresignEnvelope: Codable {
    let data: PresignData
}

struct PresignData: Codable {
    let uploadUrl: String
    let key: String
    let expiresIn: Int?
    let messageType: String?
    let category: String?

    enum CodingKeys: String, CodingKey {
        case uploadUrl = "upload_url"
        case key
        case expiresIn = "expires_in"
        case messageType = "message_type"
        case category
    }
}

struct ConfirmEnvelope: Codable {
    let data: ConfirmedUpload
}

struct ConfirmedUpload: Codable {
    let key: String?
    let url: String?
    let originalName: String?
    let sizeBytes: Int?
    let mimeType: String?
    let messageType: String?
    // The legacy `cdn_url` field never appeared on cf_workers_api but the
    // ChatScreen code falls back to it for compatibility with hb_api.
    let cdnUrl: String?

    enum CodingKeys: String, CodingKey {
        case key, url
        case originalName = "original_name"
        case sizeBytes = "size_bytes"
        case mimeType = "mime_type"
        case messageType = "message_type"
        case cdnUrl = "cdn_url"
    }
}

struct PresignRequest: Codable {
    let filename: String
    let mimeType: String
    let fileSize: Int

    enum CodingKeys: String, CodingKey {
        case filename
        case mimeType
        case fileSize
    }
}

struct ConfirmRequest: Codable {
    let key: String
    let originalName: String
}

enum StorageService {
    /// Walk the 3-step presign flow and return the confirm response.
    static func uploadFile(
        fileURL: URL,
        filename: String,
        mimeType: String
    ) async throws -> ConfirmedUpload {
        let data = try Data(contentsOf: fileURL)
        let envelope: PresignEnvelope = try await ApiClient.shared.request(
            "POST", "/storage/presign",
            body: PresignRequest(filename: filename, mimeType: mimeType, fileSize: data.count)
        )
        let presign = envelope.data

        // Step 2 — bare PUT, no Authorization header.
        guard let putUrl = URL(string: presign.uploadUrl) else {
            throw ApiError.http(status: -1, message: "Invalid presigned URL")
        }
        var req = URLRequest(url: putUrl)
        req.httpMethod = "PUT"
        req.setValue(mimeType, forHTTPHeaderField: "Content-Type")
        req.httpBody = data
        let (_, resp) = try await URLSession.shared.data(for: req)
        if let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw ApiError.http(status: http.statusCode, message: "Upload failed")
        }

        let confirm: ConfirmEnvelope = try await ApiClient.shared.request(
            "POST", "/storage/confirm",
            body: ConfirmRequest(key: presign.key, originalName: filename)
        )
        return confirm.data
    }
}
