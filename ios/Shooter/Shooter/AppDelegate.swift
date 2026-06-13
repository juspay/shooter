import UIKit
import UserNotifications
#if canImport(FoundationModels)
import FoundationModels
#endif

extension Notification.Name {
    /// Posted when a silent (content-available) push wakes the app so the WebView's
    /// autonomous loop can run a burst. Observed by the WebView coordinator.
    static let shooterSilentWake = Notification.Name("ShooterSilentWake")
}

class AppDelegate: NSObject, UIApplicationDelegate {
    var notificationManager: NotificationManager?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        notificationManager?.setDeviceToken(deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("Failed to register for remote notifications: \(error)")
    }

    /// Silent (content-available) background push from the autopilot engine. iOS grants a
    /// short window (~30s) here; we signal the WebView's JS loop to run a burst, then report.
    /// Requires UIBackgroundModes: remote-notification (set via INFOPLIST_KEY_UIBackgroundModes).
    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        NotificationCenter.default.post(name: .shooterSilentWake, object: nil)
        // Give the WebView loop a moment to reconnect + evaluate before we end the wake.
        DispatchQueue.main.asyncAfter(deadline: .now() + 8.0) {
            completionHandler(.newData)
        }
    }
}

/// On-device decide step using Apple's Foundation Models (iOS 26+). Exposed to the WebView
/// via the `shooterAgentDecide` bridge handler. Returns nil when the framework or the system
/// model is unavailable, so callers fall back to the server/heuristic command producer.
enum AgentDecider {
    static func decideCommand(context: String) async -> String? {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            let model = SystemLanguageModel.default
            guard case .available = model.availability else { return nil }
            let session = LanguageModelSession(
                instructions: "You are a coding-session copilot. Given the session context, reply with the SINGLE exact shell command to run next. Output ONLY the command — no prose, no backticks, no explanation."
            )
            // Race the model call against a timeout so a hung respond() can't stall the bridge
            // callback (which would leave the JS-side agentDecide Promise pending forever).
            return await withTaskGroup(of: String?.self) { group in
                group.addTask {
                    do {
                        let response = try await session.respond(to: context)
                        let text = response.content.trimmingCharacters(in: .whitespacesAndNewlines)
                        return text.isEmpty ? nil : text
                    } catch {
                        return nil
                    }
                }
                group.addTask {
                    try? await Task.sleep(nanoseconds: 20_000_000_000) // 20s guard
                    return nil
                }
                let result = await group.next() ?? nil
                group.cancelAll()
                return result
            }
        }
        #endif
        return nil
    }
}

