/*
 * Global incoming-call overlay. Subscribes to the user's HyperBabel private
 * channel and shows a fullscreen Accept / Reject prompt when a CALL_INVITE
 * arrives. Mounted near the root of the SwiftUI scene.
 *
 * `onAccept` and `onReject` are wired by the App entry point to call the
 * server's accept/reject endpoints and (for accept) push the .video route
 * via the shared NavStore.
 */
import SwiftUI

@MainActor
final class IncomingCallStore: ObservableObject {
    static let shared = IncomingCallStore()
    @Published var invite: [String: String]?

    func show(_ invite: [String: String]) { self.invite = invite }
    func clear() { self.invite = nil }
}

struct IncomingCallOverlay: View {
    @EnvironmentObject var store: IncomingCallStore
    let onAccept: (String) -> Void
    let onReject: (String) -> Void

    var body: some View {
        if let invite = store.invite {
            let roomId   = invite["room_id"]    ?? invite["roomId"]    ?? ""
            let caller   = invite["caller_name"] ?? invite["caller_id"] ?? "Unknown"
            let callType = invite["call_type"]  ?? invite["callType"]  ?? "1to1"
            ZStack {
                Color.black.opacity(0.85).ignoresSafeArea()
                VStack(spacing: 12) {
                    Image(systemName: "video.fill")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 80, height: 80)
                        .foregroundStyle(Color.accentColor)
                    Text("Incoming \(callType) call")
                        .foregroundStyle(.white.opacity(0.7))
                    Text(caller)
                        .font(.title)
                        .foregroundStyle(.white)
                    Text("Room: \(roomId)")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.4))
                    HStack(spacing: 48) {
                        Button {
                            store.clear()
                            onReject(roomId)
                        } label: {
                            Image(systemName: "phone.down.fill")
                                .resizable().scaledToFit()
                                .frame(width: 28, height: 28)
                                .padding(20)
                                .background(Color.red, in: Circle())
                                .foregroundStyle(.white)
                        }
                        Button {
                            store.clear()
                            onAccept(roomId)
                        } label: {
                            Image(systemName: "phone.fill")
                                .resizable().scaledToFit()
                                .frame(width: 28, height: 28)
                                .padding(20)
                                .background(Color.green, in: Circle())
                                .foregroundStyle(.white)
                        }
                    }.padding(.top, 24)
                }
                .padding(32)
            }
        }
    }
}
