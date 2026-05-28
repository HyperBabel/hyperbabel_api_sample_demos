/*
 * HyperBabel API — URLSession-backed HTTP client (Customer Auth B1).
 *
 * Reads the customer JWT from Keychain (see SecureStore.swift) on every
 * request, attaches it as `Authorization: Bearer …`, and refreshes
 * transparently via POST /customer/refresh on 401.
 *
 * The integrator's organization API key (`hb_live_…` / `hb_test_…`)
 * MUST NOT ship in the app binary. The client throws on any request
 * that would carry one — that catches accidental copies from
 * server-side examples before they reach production.
 */
import Foundation

enum ApiError: Error, LocalizedError {
    case http(status: Int, message: String?)
    case decoding(Error)
    case transport(Error)
    case authExpired
    case orgKeyDetected

    var errorDescription: String? {
        switch self {
        case .http(let status, let message): return message ?? "HTTP \(status)"
        case .decoding(let err): return "Failed to decode response: \(err.localizedDescription)"
        case .transport(let err): return err.localizedDescription
        case .authExpired:    return "Customer session expired — please sign in again."
        case .orgKeyDetected: return "HyperBabel security: refusing to send an org API key from the device."
        }
    }
}

struct EmptyBody: Codable {}
struct EmptyResponse: Codable {}

/// Async-safe coordinator that ensures a burst of expirations only
/// triggers a single POST /customer/refresh round-trip.
private actor RefreshCoordinator {
    private var inflight: Task<String?, Never>?

    func obtain(_ make: @escaping @Sendable () async -> String?) async -> String? {
        if let existing = inflight {
            return await existing.value
        }
        let task = Task { await make() }
        inflight = task
        let result = await task.value
        inflight = nil
        return result
    }
}

final class ApiClient {
    static let shared = ApiClient()
    static let defaultApiUrl = "https://api.hyperbabel.com/api/v1"

    /// Refresh proactively when fewer than this many seconds remain.
    /// Matches https://hyperbabel.com/docs#customer-auth guidance.
    private let refreshLeadSeconds: Int = 300

    private let urlSession: URLSession = .shared
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = []
        return e
    }()
    private let decoder: JSONDecoder = JSONDecoder()

    private let refreshCoordinator = RefreshCoordinator()

    // ── Token helpers ───────────────────────────────────────────────────

    private func assertNotOrgKey(_ token: String) throws {
        if token.hasPrefix("hb_live_") || token.hasPrefix("hb_test_") {
            throw ApiError.orgKeyDetected
        }
    }

    private func currentAccessToken() async -> String? {
        guard let token = SecureStore.read(.accessToken), !token.isEmpty else {
            return nil
        }
        guard let expiresAt = SecureStore.readInt(.expiresAt) else {
            return token
        }
        let secondsLeft = expiresAt - Int(Date().timeIntervalSince1970)
        if secondsLeft > refreshLeadSeconds {
            return token
        }
        return await attemptRefresh() ?? token
    }

    private func attemptRefresh() async -> String? {
        await refreshCoordinator.obtain { [weak self] in
            await self?.performRefresh() ?? nil
        }
    }

    private func performRefresh() async -> String? {
        guard let refreshToken = SecureStore.read(.refreshToken),
              !refreshToken.isEmpty else { return nil }
        guard let url = URL(string: "\(Session.shared.apiUrl)/customer/refresh") else {
            return nil
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: String] = ["refresh_token": refreshToken]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (data, response) = try await urlSession.data(for: req)
            guard let http = response as? HTTPURLResponse,
                  (200..<300).contains(http.statusCode) else {
                return nil
            }
            struct RefreshResponse: Decodable {
                let access_token:  String
                let refresh_token: String
                let expires_at:    Int
            }
            let decoded = try decoder.decode(RefreshResponse.self, from: data)
            SecureStore.write(.accessToken,  decoded.access_token)
            SecureStore.write(.refreshToken, decoded.refresh_token)
            SecureStore.writeInt(.expiresAt, decoded.expires_at)
            return decoded.access_token
        } catch {
            return nil
        }
    }

    // ── Request core ────────────────────────────────────────────────────

    func request<T: Decodable>(
        _ method: String,
        _ path: String,
        body: Encodable? = nil,
        query: [(String, String)] = [],
    ) async throws -> T {
        let token = await currentAccessToken()
        let (data, http) = try await send(
            method: method, path: path, body: body, query: query, token: token,
        )

        if http.statusCode == 401, token != nil {
            // Reactive fallback for any 401 the proactive refresh missed.
            if let refreshed = await attemptRefresh() {
                let (retryData, retryHttp) = try await send(
                    method: method, path: path, body: body, query: query, token: refreshed,
                )
                return try decodeOrThrow(data: retryData, http: retryHttp)
            }
            throw ApiError.authExpired
        }

        return try decodeOrThrow(data: data, http: http)
    }

    private func send(
        method: String, path: String, body: Encodable?, query: [(String, String)], token: String?,
    ) async throws -> (Data, HTTPURLResponse) {
        var components = URLComponents(string: Session.shared.apiUrl + path)
        if !query.isEmpty {
            components?.queryItems = query.map { URLQueryItem(name: $0.0, value: $0.1) }
        }
        guard let url = components?.url else {
            throw ApiError.http(status: -1, message: "Invalid URL")
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token, !token.isEmpty {
            try assertNotOrgKey(token)
            req.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.httpBody = try encoder.encode(AnyEncodable(body))
        }

        do {
            let (data, response) = try await urlSession.data(for: req)
            guard let http = response as? HTTPURLResponse else {
                throw ApiError.http(status: -1, message: nil)
            }
            return (data, http)
        } catch let err as ApiError {
            throw err
        } catch {
            throw ApiError.transport(error)
        }
    }

    private func decodeOrThrow<T: Decodable>(data: Data, http: HTTPURLResponse) throws -> T {
        guard (200..<300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8)
            throw ApiError.http(status: http.statusCode, message: message)
        }
        if T.self == EmptyResponse.self {
            return EmptyResponse() as! T
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw ApiError.decoding(error)
        }
    }
}

/// Type-erasing wrapper so we can encode any Encodable through a generic API.
private struct AnyEncodable: Encodable {
    let value: Encodable
    init(_ value: Encodable) { self.value = value }
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}
