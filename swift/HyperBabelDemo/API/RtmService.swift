/*
 * HyperBabel API — Token issuance for the Real-Time and Video engines.
 *
 * The server returns short-lived signed tokens that the SDKs trade for
 * authenticated channel/RTC sessions. No raw vendor credentials are ever
 * shipped to the client.
 */
import Foundation

enum RtmService {
    static func realtimeToken(_ body: RealtimeTokenRequest) async throws -> RealtimeTokenResponse {
        try await ApiClient.shared.request("POST", "/rtm/token", body: body)
    }

    static func rtcToken(_ body: RtcTokenRequest) async throws -> RtcTokenResponse {
        try await ApiClient.shared.request("POST", "/rtm/rtc/token", body: body)
    }
}
