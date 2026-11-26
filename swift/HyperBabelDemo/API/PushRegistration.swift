/*
 * Push registration — gets this device's FCM registration token from Firebase
 * Messaging and registers it with HyperBabel (POST /push/register).
 *
 * HyperBabel push is delivered to FCM registration tokens only — on iOS too.
 * Firebase Messaging turns the APNs device token into an FCM registration
 * token; the FCM token is what you register. One-time setup:
 *   1. Xcode → target → Signing & Capabilities → add "Push Notifications".
 *   2. Firebase Console → Project settings → Cloud Messaging → upload your
 *      APNs authentication key.
 *   3. Link the FirebaseMessaging product (listed in Package.swift).
 * Without these the token request fails, nothing is registered, and the rest
 * of the demo works as before.
 *
 * Flow: RootNavigation calls `registerIfSignedIn()` after sign-in and on
 * launch with a saved session. It asks for notification permission, registers
 * for remote notifications, then asks Firebase Messaging for the FCM token.
 * When the APNs token is not there yet, the MessagingDelegate callback below
 * registers the FCM token as soon as Firebase has it, and again whenever it
 * rotates. The registered token is remembered so logout can pass it to
 * POST /customer/logout, which deletes it on the server.
 */
import Foundation
import FirebaseCore
import FirebaseMessaging
#if os(iOS)
import UIKit
import UserNotifications
#endif

@MainActor
final class PushRegistration: NSObject {
    static let shared = PushRegistration()

    private static let tokenKey = "hb_registered_push_token"
    private var started = false

    /// The FCM token this device registered for the signed-in user, if any.
    var registeredToken: String? {
        UserDefaults.standard.string(forKey: Self.tokenKey)
    }

    func registerIfSignedIn() async {
        guard FirebaseApp.app() != nil, Session.shared.isSignedIn else { return }
        startIfNeeded()
        do {
            let token = try await Messaging.messaging().token()
            await register(token)
        } catch {
            // Usually "no APNs token yet": the delegate callback registers the
            // FCM token once Firebase Messaging has it.
            print("[Push] FCM token not available yet: \(error.localizedDescription)")
        }
    }

    /// Forget the registered token once POST /customer/logout has deleted it.
    func forget() {
        UserDefaults.standard.removeObject(forKey: Self.tokenKey)
    }

    private func startIfNeeded() {
        guard !started else { return }
        started = true
        Messaging.messaging().delegate = self
        #if os(iOS)
        Task {
            _ = try? await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .badge, .sound])
        }
        UIApplication.shared.registerForRemoteNotifications()
        #endif
    }

    fileprivate func register(_ token: String) async {
        let userId = Session.shared.userId
        guard !token.isEmpty, !userId.isEmpty, Session.shared.isSignedIn else { return }
        do {
            _ = try await PushService.register(userId: userId, token: token, platform: "ios")
            UserDefaults.standard.set(token, forKey: Self.tokenKey)
        } catch {
            print("[Push] register failed: \(error.localizedDescription)")
        }
    }
}

extension PushRegistration: MessagingDelegate {
    /// Called with the FCM token after launch and whenever it changes.
    nonisolated func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken else { return }
        Task { @MainActor in await self.register(fcmToken) }
    }
}

#if os(iOS)
/// Hands the APNs device token to Firebase Messaging, which maps it to the FCM
/// registration token above. Firebase's app-delegate swizzling does the same
/// automatically; setting it here keeps the step visible and also works with
/// swizzling turned off. Installed by `HyperBabelDemoApp` via
/// `@UIApplicationDelegateAdaptor`.
final class PushAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        guard FirebaseApp.app() != nil else { return }
        Messaging.messaging().apnsToken = deviceToken
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[Push] remote notification registration failed: \(error.localizedDescription)")
    }
}
#endif
