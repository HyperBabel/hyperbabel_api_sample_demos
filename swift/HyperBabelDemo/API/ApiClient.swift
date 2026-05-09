/*
 * HyperBabel API — URLSession-backed HTTP client.
 *
 * Single shared instance. Reads the current API key from Session every
 * request, so the Login screen can rotate the key without rebuilding
 * anything.
 */
import Foundation

enum ApiError: Error, LocalizedError {
    case http(status: Int, message: String?)
    case decoding(Error)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .http(let status, let message): return message ?? "HTTP \(status)"
        case .decoding(let err): return "Failed to decode response: \(err.localizedDescription)"
        case .transport(let err): return err.localizedDescription
        }
    }
}

struct EmptyBody: Codable {}
struct EmptyResponse: Codable {}

final class ApiClient {
    static let shared = ApiClient()
    static let defaultApiUrl = "https://api.hyperbabel.com/api/v1"
    static let defaultApiKey = ""

    private let urlSession: URLSession = .shared
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = []
        return e
    }()
    private let decoder: JSONDecoder = JSONDecoder()

    func request<T: Decodable>(
        _ method: String,
        _ path: String,
        body: Encodable? = nil,
        query: [(String, String)] = []
    ) async throws -> T {
        let session = Session.shared
        var components = URLComponents(string: session.apiUrl + path)
        if !query.isEmpty {
            components?.queryItems = query.map { URLQueryItem(name: $0.0, value: $0.1) }
        }
        guard let url = components?.url else {
            throw ApiError.http(status: -1, message: "Invalid URL")
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        if !session.apiKey.isEmpty {
            req.addValue("Bearer \(session.apiKey)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.httpBody = try encoder.encode(AnyEncodable(body))
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: req)
        } catch {
            throw ApiError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw ApiError.http(status: -1, message: nil)
        }
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
