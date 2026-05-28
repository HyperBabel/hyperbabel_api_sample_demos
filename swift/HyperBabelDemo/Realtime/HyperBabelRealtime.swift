/*
 * HyperBabel Real-Time client.
 *
 *   1. Hit POST /rtm/token to fetch a server-signed token request and the
 *      org id we'll namespace channels with.
 *   2. Hand the payload to the underlying real-time SDK's authCallback so
 *      tokens auto-renew in the background.
 *   3. Subscribe on `hb:{compactOrgId}:room:{roomId}` for room events. Both
 *      chat messages and typing pings come through this single channel —
 *      callers should look at the payload's `type` field to disambiguate.
 *
 * Vendor SDK class names are imported under neutral aliases so the body of
 * this file talks about HyperBabel concepts only.
 */
import Foundation
import Ably

typealias RealtimeClient            = ARTRealtime
typealias RealtimeOptions           = ARTClientOptions
typealias RealtimeChannel           = ARTRealtimeChannel
typealias RealtimeEventListener     = ARTEventListener
typealias RealtimeTokenRequestSdk   = ARTTokenRequest

@MainActor
final class HyperBabelRealtime {
    static let shared = HyperBabelRealtime()

    private var client: RealtimeClient?
    private var orgId: String?

    /// Open a long-lived connection. The first token round-trip also tells
    /// us which `orgId` to namespace channels with — keep that on hand for
    /// `subscribeRoom`. Idempotent: calling twice while already connected
    /// is a no-op.
    func connect() async throws {
        if client != nil { return }
        let initial = try await RtmService.realtimeToken(
            RealtimeTokenRequest(
                userId: Session.shared.userId,
                userName: Session.shared.displayName,
                preferredLangCd: Session.shared.preferredLangCd
            )
        )
        guard let payload = initial.tokenRequest else {
            throw realtimeError("Server did not return a real-time token request payload")
        }
        let oid = initial.orgId ?? ""
        orgId = oid

        let opts = RealtimeOptions()
        opts.clientId = oid.isEmpty ? Session.shared.userId : "\(oid):\(Session.shared.userId)"
        opts.echoMessages = false
        opts.autoConnect = true
        // Local lock-guarded "first use" flag — captured by the auth callback
        // closure. Lives outside the @MainActor class so the SDK can read it
        // from its worker thread without isolation violations.
        let firstUse = FirstUseFlag()
        opts.authCallback = { _, completion in
            // First call uses the pre-fetched payload; subsequent renewals
            // request a fresh signed token request.
            if firstUse.claim() {
                Self.deliverTokenRequest(from: payload, completion: completion)
                return
            }
            Task {
                do {
                    let refreshed = try await RtmService.realtimeToken(
                        RealtimeTokenRequest(
                            userId: Session.shared.userId,
                            userName: Session.shared.displayName,
                            preferredLangCd: Session.shared.preferredLangCd
                        )
                    )
                    guard let np = refreshed.tokenRequest else {
                        completion(nil, realtimeError("Token refresh missing payload"))
                        return
                    }
                    Self.deliverTokenRequest(from: np, completion: completion)
                } catch {
                    completion(nil, error as NSError)
                }
            }
        }

        let realtime = RealtimeClient(options: opts)
        client = realtime

        // Wait for connection so the very first subscribe doesn't drop.
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            var resumed = false
            realtime.connection.on { stateChange in
                guard !resumed else { return }
                switch stateChange.current {
                case .connected:
                    resumed = true
                    cont.resume()
                case .failed, .suspended:
                    resumed = true
                    cont.resume(throwing: stateChange.reason ?? realtimeError("Realtime connect failed"))
                default:
                    break
                }
            }
        }
    }

    /// Subscribe to room-scoped events. Returns an unsubscribe closure. The
    /// channel name format (`hb:{compactOrgId}:room:{roomId}`) is fixed by
    /// the server and must be reproduced exactly. Callers receive the
    /// event name (e.g. `message`, `message.deleted`, `read_receipt`) and
    /// a Swift dictionary view of the payload.
    func subscribeRoom(_ roomId: String, onEvent: @escaping (String, Any?) -> Void) -> () -> Void {
        guard let active = client else { return { /* not connected */ } }
        let channel: RealtimeChannel = active.channels.get(channelName(for: roomId))
        let listener = channel.subscribe { msg in
            let name = msg.name ?? ""
            let data: Any? = Self.normalize(msg.data)
            Task { @MainActor in onEvent(name, data) }
        }
        return { [weak channel, weak listener] in
            if let channel, let listener {
                channel.unsubscribe(listener)
            }
        }
    }

    func disconnect() {
        client?.close()
        client = nil
        orgId = nil
    }

    // ── Internals ────────────────────────────────────────────────────────────

    nonisolated private func channelName(for roomId: String) -> String {
        // Read of @MainActor `orgId` from a nonisolated context — safe in
        // practice because `connect()` runs to completion before subscribe is
        // exposed and we never reassign during steady-state use.
        let compact = (MainActor.assumeIsolated { orgId } ?? "unknown")
            .replacingOccurrences(of: "-", with: "")
        return "hb:\(compact):room:\(roomId)"
    }

    /// Bridge our wire payload into ARTTokenRequest via the SDK's `fromJson`
    /// helper. Going through fromJson sidesteps cross-platform field-type
    /// inconsistencies (e.g. timestamp/ttl as int vs. string).
    /// `nonisolated` because the underlying SDK invokes the auth callback on
    /// its own worker thread, not the main actor.
    nonisolated private static func deliverTokenRequest(
        from payload: RealtimeTokenPayload,
        completion: @escaping (ARTTokenDetailsCompatible?, NSError?) -> Void
    ) {
        var dict: [String: Any] = [:]
        if let v = payload.keyName    { dict["keyName"]    = v }
        if let v = payload.clientId   { dict["clientId"]   = v }
        if let v = payload.nonce      { dict["nonce"]      = v }
        if let v = payload.mac        { dict["mac"]        = v }
        if let v = payload.timestamp  { dict["timestamp"]  = NSNumber(value: v) }
        if let v = payload.ttl        { dict["ttl"]        = NSNumber(value: v) }
        if let v = payload.capability { dict["capability"] = v }

        do {
            let req = try ARTTokenRequest.fromJson(dict as NSDictionary)
            completion(req, nil)
        } catch {
            completion(nil, error as NSError)
        }
    }

    /// Convert SDK-delivered `data` (typically NSDictionary/NSArray/NSString)
    /// into a Swift-native value the ChatScreen can pattern-match on.
    /// `nonisolated` because subscribe callbacks fire off the main actor.
    nonisolated private static func normalize(_ value: Any?) -> Any? {
        switch value {
        case let dict as NSDictionary:
            var out: [String: Any] = [:]
            for case let (k as String, v) in dict {
                out[k] = normalize(v) ?? NSNull()
            }
            return out
        case let arr as NSArray:
            return arr.map { normalize($0) ?? NSNull() }
        case let str as String:
            // Some publishers send a JSON-encoded string instead of a structured
            // payload. Try to decode it transparently.
            if let data = str.data(using: .utf8),
               let parsed = try? JSONSerialization.jsonObject(with: data) {
                return normalize(parsed)
            }
            return str
        case let n as NSNumber: return n
        case is NSNull, .none: return nil
        default: return value
        }
    }
}

/// Domain-specific NSError so SDK consumers see a stable error.domain
/// instead of leaking the demo's ApiError shape.
private func realtimeError(_ reason: String) -> NSError {
    NSError(domain: "HyperBabelRealtime", code: 0,
            userInfo: [NSLocalizedDescriptionKey: reason])
}

/// Lock-guarded one-shot flag used by the SDK auth callback. The SDK invokes
/// the callback on a vendor-controlled worker thread, so this lives outside
/// the @MainActor demo class.
private final class FirstUseFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var used = false
    func claim() -> Bool {
        lock.lock(); defer { lock.unlock() }
        if used { return false }
        used = true
        return true
    }
}
