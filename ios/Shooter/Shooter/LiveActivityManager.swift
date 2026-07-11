// LiveActivityManager.swift
//
// App-side controller: starts a Live Activity for a coding session, forwards its
// APNs push token to the Shooter server (so the server can push updates), and
// ends the activity. Belongs to the MAIN APP target.
//
// The server pushes updates to `POST /api/live-activity` using the token this
// registers. Requires iOS 16.1+; push-token updates require iOS 16.2+.

import ActivityKit
import Foundation

@available(iOS 16.2, *)
final class LiveActivityManager {
    static let shared = LiveActivityManager()
    private var current: Activity<ShooterActivityAttributes>?
    private var tokenTask: Task<Void, Never>?

    /// Start a Live Activity for a session and stream its push token to the server.
    func start(sessionId: String, title: String, status: String, detail: String? = nil) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let attributes = ShooterActivityAttributes(sessionId: sessionId)
        let state = ShooterActivityAttributes.ContentState(
            title: title, status: status, detail: detail, progress: nil,
            updatedAt: ISO8601DateFormatter().string(from: Date())
        )
        do {
            let activity = try Activity.request(
                attributes: attributes,
                content: .init(state: state, staleDate: nil),
                pushType: .token
            )
            current = activity
            // Stream the push token to the server as ActivityKit rotates it.
            tokenTask = Task {
                for await tokenData in activity.pushTokenUpdates {
                    let token = tokenData.map { String(format: "%02x", $0) }.joined()
                    await self.registerToken(token, sessionId: sessionId)
                }
            }
        } catch {
            print("[LiveActivity] start failed: \(error)")
        }
    }

    /// End the current activity (optionally showing a final state briefly).
    func end(finalStatus: String = "Done") {
        tokenTask?.cancel()
        guard let activity = current else { return }
        let state = ShooterActivityAttributes.ContentState(
            title: activity.content.state.title, status: finalStatus, detail: nil,
            progress: nil, updatedAt: ISO8601DateFormatter().string(from: Date())
        )
        Task {
            await activity.end(.init(state: state, staleDate: nil), dismissalPolicy: .default)
            current = nil
        }
    }

    /// POST the activity push token to the Shooter server. Server URL + API key
    /// come from the same runtime stores the rest of the app uses (UserDefaults +
    /// Keychain), not the AppConfig constants.
    private func registerToken(_ token: String, sessionId: String) async {
        let baseURL = UserDefaults.standard.string(forKey: "serverUrl") ?? AppConfig.defaultServerURL
        let apiKey = KeychainHelper.read(key: "apiKey") ?? ""
        guard !apiKey.isEmpty,
              let url = URL(string: "\(baseURL)/api/live-activity/register") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: [
            "activityPushToken": token, "sessionId": sessionId,
        ])
        _ = try? await URLSession.shared.data(for: req)
    }
}
