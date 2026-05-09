/*
 * App entry point and root navigation.
 *
 * Routes:
 *   .login            — sign in
 *   .home             — room list
 *   .chat(roomId)     — chat in a room (text + real-time push)
 *   .video(roomId)    — 1:1 video call
 *   .stream           — live stream list / host / viewer
 *   .settings         — usage / push tokens / language detect / logout
 *   .blocks           — global block list
 *
 * The IncomingCallOverlay sits above NavigationStack so a CALL_INVITE event
 * paints an Accept / Reject prompt over whatever screen is foregrounded.
 * Accept needs to push the .video route, so navigation state is lifted to
 * a shared NavStore that both the overlay and the stack observe.
 */
import SwiftUI

@main
struct HyperBabelDemoApp: App {
    @StateObject private var session = Session.shared
    @StateObject private var callStore = IncomingCallStore.shared
    @StateObject private var nav = NavStore.shared

    var body: some Scene {
        WindowGroup {
            ZStack {
                RootNavigation()
                    .environmentObject(session)
                    .environmentObject(callStore)
                    .environmentObject(nav)
                IncomingCallOverlay(
                    onAccept: { roomId in
                        // POST /unitedchat/rooms/:roomId/video/accept then jump
                        // to the video call screen. Both calls are best-effort;
                        // the user has already explicitly accepted, so we don't
                        // surface server failures here.
                        guard !roomId.isEmpty else { return }
                        Task {
                            _ = try? await UnitedChatService.acceptVideoCall(
                                roomId: roomId, userId: session.userId
                            )
                            await MainActor.run { nav.push(.video(roomId: roomId)) }
                        }
                    },
                    onReject: { roomId in
                        guard !roomId.isEmpty else { return }
                        Task {
                            _ = try? await UnitedChatService.rejectVideoCall(
                                roomId: roomId, userId: session.userId
                            )
                        }
                    }
                )
                .environmentObject(callStore)
            }
            .preferredColorScheme(.dark)
        }
    }
}

enum Route: Hashable {
    case home
    case chat(roomId: String)
    case video(roomId: String)
    case stream
    case settings
    case blocks
}

/// Navigation state shared between the root NavigationStack and screens
/// (or overlays) that need to push without holding a binding to `path`.
@MainActor
final class NavStore: ObservableObject {
    static let shared = NavStore()
    @Published var path: [Route] = []
    func push(_ r: Route) { path.append(r) }
    func popLast() { if !path.isEmpty { path.removeLast() } }
    func popAll() { path.removeAll() }
}

struct RootNavigation: View {
    @EnvironmentObject var session: Session
    @EnvironmentObject var nav: NavStore

    var body: some View {
        NavigationStack(path: $nav.path) {
            Group {
                if session.isSignedIn {
                    HomeScreen(
                        onOpenRoom: { nav.push(.chat(roomId: $0)) },
                        onLogout: { session.signOut() }
                    )
                    .toolbar {
                        // `.topBarTrailing` is iOS-only — `.primaryAction`
                        // is the equivalent that compiles on every Apple
                        // platform that hosts this demo.
                        ToolbarItemGroup(placement: .primaryAction) {
                            Button { nav.push(.stream)   } label: { Image(systemName: "dot.radiowaves.left.and.right") }
                            Button { nav.push(.settings) } label: { Image(systemName: "gear") }
                        }
                    }
                } else {
                    LoginScreen()
                }
            }
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .home:
                    HomeScreen(
                        onOpenRoom: { nav.push(.chat(roomId: $0)) },
                        onLogout: { session.signOut(); nav.popAll() }
                    )
                case .chat(let roomId):
                    ChatScreen(
                        roomId: roomId,
                        onBack: { nav.popLast() },
                        onStartCall: { nav.push(.video(roomId: roomId)) }
                    )
                case .video(let roomId):
                    VideoCallScreen(roomId: roomId, onHangup: { nav.popLast() })
                case .stream:
                    StreamScreen(onBack: { nav.popLast() })
                case .settings:
                    SettingsScreen(
                        onBack: { nav.popLast() },
                        onOpenBlocks: { nav.push(.blocks) }
                    )
                case .blocks:
                    BlocksScreen(onBack: { nav.popLast() })
                }
            }
        }
    }
}
