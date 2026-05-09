/*
 * HyperBabel API — auth-level read endpoints. Webhook CRUD lives in the
 * HyperBabel Console at https://console.hyperbabel.com.
 */
import Foundation

/// Wire shape per cf_workers_api/src/services/auth.service.ts getUsageWithPlan.
/// `period_start` isn't returned (the server only ships `current_period_end`),
/// so we surface only the totals the UI actually renders.
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

enum AuthService {
    static func getUsage() async throws -> UsageStats {
        try await ApiClient.shared.request("GET", "/auth/usage")
    }
}
