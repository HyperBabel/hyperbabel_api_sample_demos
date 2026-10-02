/*
 * HyperBabel API — auth-level read endpoints. Webhook CRUD lives in the
 * HyperBabel Console at https://console.hyperbabel.com.
 */
import Foundation

/// Wire shape per the HyperBabel Auth API (GET /auth/usage — usage + plan).
/// `period_start` isn't returned (the server only ships `current_period_end`),
/// so we surface only the totals the UI actually renders.
///
/// Some totals are 64-bit counters that arrive as numeric STRINGS
/// (`messages_sent`, `translate_chars`, …) while the minute totals are plain
/// numbers, so every count is decoded leniently (see `init(from:)` below).
struct UsageStats: Codable {
    let messagesSent: Int?
    let hdVideoMins: Int?
    let fhdVideoMins: Int?
    let hdStreamMins: Int?
    let fhdStreamMins: Int?
    let translateChars: Int?
    let planName: String?
    let currentPeriodEnd: String?

    /// Convenience: total video minutes irrespective of resolution.
    var videoMinutes: Int { (hdVideoMins ?? 0) + (fhdVideoMins ?? 0) }
    /// Convenience: total stream minutes irrespective of resolution.
    var streamMinutes: Int { (hdStreamMins ?? 0) + (fhdStreamMins ?? 0) }

    enum CodingKeys: String, CodingKey {
        case messagesSent = "messages_sent"
        case hdVideoMins = "hd_video_mins"
        case fhdVideoMins = "fhd_video_mins"
        case hdStreamMins = "hd_stream_mins"
        case fhdStreamMins = "fhd_stream_mins"
        case translateChars = "translate_chars"
        case planName = "plan_name"
        case currentPeriodEnd = "current_period_end"
    }
}

extension UsageStats {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        messagesSent     = c.decodeLossyIntIfPresent(forKey: .messagesSent)
        hdVideoMins      = c.decodeLossyIntIfPresent(forKey: .hdVideoMins)
        fhdVideoMins     = c.decodeLossyIntIfPresent(forKey: .fhdVideoMins)
        hdStreamMins     = c.decodeLossyIntIfPresent(forKey: .hdStreamMins)
        fhdStreamMins    = c.decodeLossyIntIfPresent(forKey: .fhdStreamMins)
        translateChars   = c.decodeLossyIntIfPresent(forKey: .translateChars)
        planName         = try c.decodeIfPresent(String.self, forKey: .planName)
        currentPeriodEnd = try c.decodeIfPresent(String.self, forKey: .currentPeriodEnd)
    }
}

enum AuthService {
    static func getUsage() async throws -> UsageStats {
        try await ApiClient.shared.request("GET", "/auth/usage")
    }
}
