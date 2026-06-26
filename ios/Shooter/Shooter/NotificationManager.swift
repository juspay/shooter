import Foundation
import UserNotifications
import UIKit

/// Identifiable wrapper around a String requestId so SwiftUI's
/// .sheet(item:) can drive the Decide screen from
/// `NotificationManager.decideRequestId`.
struct DecideRequestId: Identifiable {
    let value: String
    var id: String { value }
}

class NotificationManager: NSObject, ObservableObject {
    @Published var isAuthorized = false
    @Published var deviceToken: String?
    @Published var isConnected = false

    /// Request ID of a pending notification the user tapped (either the
    /// notification body or the "Open in Shooter" action). The UI
    /// observes this and presents DecideView for richer interaction
    /// than the lock-screen quick-tap buttons allow.
    ///
    /// Wrapped in DecideRequestId so SwiftUI's .sheet(item:) can use it
    /// (String isn't Identifiable on its own).
    @Published var decideRequestId: DecideRequestId?

    private var serverUrl: String {
        UserDefaults.standard.string(forKey: "serverUrl") ?? AppConfig.defaultServerURL
    }

    /// API key is stored in the Keychain (C3 fix). Falls back to empty string.
    private var apiKey: String {
        KeychainHelper.read(key: "apiKey") ?? ""
    }

    override init() {
        super.init()
        // Migrate any plaintext API key left in UserDefaults
        KeychainHelper.migrateApiKeyFromUserDefaults()
        UNUserNotificationCenter.current().delegate = self
        setupNotificationCategories()
        checkAuthorizationStatus()
    }

    // MARK: - Permission

    func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            DispatchQueue.main.async {
                self.isAuthorized = granted
                if granted {
                    self.setupNotificationCategories()
                    self.registerForRemoteNotifications()
                }
            }
        }
    }

    // MARK: - Notification Categories
    //
    // iOS requires categories to be pre-registered with a fixed action
    // set; per-notification dynamic labels are not supported. We
    // register one category per supported event shape (binary
    // permission, plan-mode 4-way, generic numbered choices 2/3/4) and
    // the server picks which one to use in each push's aps.category.
    //
    // Every category includes an "Open in Shooter" action as a
    // fallback so the user can always reach the in-app Decide screen
    // for richer context.

    private func setupNotificationCategories() {
        let openInAppAction = UNNotificationAction(
            identifier: AppConfig.Notifications.Actions.openInApp,
            title: "Open in Shooter",
            options: [.foreground]
        )

        // ─── CLAUDE_PERMISSION ──────────────────────────────────────
        let allowAction = UNNotificationAction(
            identifier: AppConfig.Notifications.Actions.allow,
            title: "Allow",
            options: [.authenticationRequired]
        )
        let denyAction = UNNotificationAction(
            identifier: AppConfig.Notifications.Actions.deny,
            title: "Deny",
            options: [.destructive]
        )
        let permissionCategory = UNNotificationCategory(
            identifier: AppConfig.Notifications.Categories.permission,
            actions: [allowAction, denyAction, openInAppAction],
            intentIdentifiers: [],
            options: []
        )

        // ─── CLAUDE_PLAN_APPROVAL ───────────────────────────────────
        let planAutoAction = UNNotificationAction(
            identifier: AppConfig.Notifications.Actions.planAuto,
            title: "Auto Mode",
            options: [.authenticationRequired]
        )
        let planAcceptAction = UNNotificationAction(
            identifier: AppConfig.Notifications.Actions.planAccept,
            title: "Accept Edits",
            options: [.authenticationRequired]
        )
        let planReviewAction = UNNotificationAction(
            identifier: AppConfig.Notifications.Actions.planReview,
            title: "Review Each",
            options: [.authenticationRequired]
        )
        let planKeepAction = UNNotificationAction(
            identifier: AppConfig.Notifications.Actions.planKeep,
            title: "Keep Planning",
            options: []
        )
        let planApprovalCategory = UNNotificationCategory(
            identifier: AppConfig.Notifications.Categories.planApproval,
            // iOS caps lock-screen action buttons at 4 — when adding a
            // 5th the OS hides actions behind the contextual menu. We
            // chose Auto/Accept/Review + Open-in-app to keep the
            // common-case taps surfaced; "Keep planning" is reachable
            // via Open-in-app's Decide screen.
            actions: [planAutoAction, planAcceptAction, planReviewAction, openInAppAction],
            intentIdentifiers: [],
            options: []
        )

        // ─── CLAUDE_CHOICE_2 / 3 / 4 ────────────────────────────────
        // Numbered options. The body text tells the user what each
        // option means (e.g. "1. Use frontend  2. Use backend").
        let option1 = numberedAction(id: AppConfig.Notifications.Actions.option1, title: "Option 1")
        let option2 = numberedAction(id: AppConfig.Notifications.Actions.option2, title: "Option 2")
        let option3 = numberedAction(id: AppConfig.Notifications.Actions.option3, title: "Option 3")
        let option4 = numberedAction(id: AppConfig.Notifications.Actions.option4, title: "Option 4")

        let choice2Category = UNNotificationCategory(
            identifier: AppConfig.Notifications.Categories.choice2,
            actions: [option1, option2, openInAppAction],
            intentIdentifiers: [],
            options: []
        )
        let choice3Category = UNNotificationCategory(
            identifier: AppConfig.Notifications.Categories.choice3,
            actions: [option1, option2, option3, openInAppAction],
            intentIdentifiers: [],
            options: []
        )
        // For 4 choices we exceed the lock-screen quick-tap limit when
        // including Open-in-app — iOS will collapse extras into "..."
        // automatically. Listing all 4 + Open-in-app keeps the in-app
        // path always reachable.
        let choice4Category = UNNotificationCategory(
            identifier: AppConfig.Notifications.Categories.choice4,
            actions: [option1, option2, option3, option4, openInAppAction],
            intentIdentifiers: [],
            options: []
        )

        UNUserNotificationCenter.current().setNotificationCategories([
            permissionCategory,
            planApprovalCategory,
            choice2Category,
            choice3Category,
            choice4Category
        ])
        print("Registered notification categories: PERMISSION, PLAN_APPROVAL, CHOICE_2/3/4")
    }

    private func numberedAction(id: String, title: String) -> UNNotificationAction {
        UNNotificationAction(
            identifier: id,
            title: title,
            options: [.authenticationRequired]
        )
    }

    // MARK: - Authorization Status

    private func checkAuthorizationStatus() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                self.isAuthorized = settings.authorizationStatus == .authorized
                if self.isAuthorized {
                    self.registerForRemoteNotifications()
                }
            }
        }
    }

    private func registerForRemoteNotifications() {
        DispatchQueue.main.async {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    // MARK: - Device Token

    func setDeviceToken(_ tokenData: Data) {
        let token = tokenData.map { String(format: "%02.2hhx", $0) }.joined()
        DispatchQueue.main.async {
            self.deviceToken = token
            print("Device Token: \(token)")
            self.registerTokenWithServer(token)
        }
    }

    /// POST the device token to the server so APNs can target this device (M6 fix).
    private func registerTokenWithServer(_ token: String) {
        guard let url = URL(string: "\(serverUrl)/api/device-token") else { return }
        guard !apiKey.isEmpty else {
            print("Skipping token registration: no API key configured")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let body: [String: Any] = [
            "deviceToken": token,
            "platform": "ios",
            "bundleId": AppConfig.App.bundleId,
            "deviceId": Self.stableDeviceId(),
            "deviceName": Self.deviceDisplayName(),
            "appEnv": Self.apnsEnvironment()
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            print("Failed to encode device token body: \(error)")
            return
        }

        URLSession.shared.dataTask(with: request) { _, response, error in
            if let error = error {
                print("Failed to register device token with server: \(error)")
                return
            }
            if let httpResponse = response as? HTTPURLResponse {
                if (200...299).contains(httpResponse.statusCode) {
                    print("Device token registered with server: HTTP \(httpResponse.statusCode)")
                } else {
                    print("Device token registration FAILED: HTTP \(httpResponse.statusCode)")
                }
            }
        }.resume()
    }

    // MARK: - Device Identity (multi-device registry)

    /// A stable per-device identifier sent on registration so the server can
    /// upsert by device on token rotation instead of accumulating duplicate
    /// rows. Prefers a Keychain-persisted UUID (survives an identifierForVendor
    /// reset); seeds it from identifierForVendor, falling back to a fresh UUID.
    static func stableDeviceId() -> String {
        if let existing = KeychainHelper.read(key: "deviceId"), !existing.isEmpty {
            return existing
        }
        let id = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        if !KeychainHelper.save(key: "deviceId", value: id) {
            // Persist failed (e.g. device locked before first unlock). The id is
            // still used for this call, but won't survive — surface it so a
            // duplicate-row situation on the server is diagnosable.
            print("[stableDeviceId] Keychain save failed; device id may not persist until next unlock")
        }
        return id
    }

    /// Human-friendly name for the registered-devices list (e.g. "Sachin's iPhone").
    static func deviceDisplayName() -> String {
        UIDevice.current.name
    }

    /// APNs gateway this build registers with — a DEBUG build's token belongs to
    /// the sandbox gateway, a release build's to production. The server filters
    /// fan-out by this so a sandbox token is never sent to the production gateway.
    static func apnsEnvironment() -> String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    // MARK: - Server Health Check

    @discardableResult
    func checkServerConnection() async -> Bool {
        guard let url = URL(string: "\(serverUrl)/api/health") else {
            await MainActor.run { isConnected = false }
            return false
        }

        do {
            let (_, response) = try await URLSession.shared.data(from: url)
            let connected = (response as? HTTPURLResponse)?.statusCode == 200
            await MainActor.run { isConnected = connected }
            return connected
        } catch {
            await MainActor.run { isConnected = false }
            return false
        }
    }

    // MARK: - Permission Response

    /// Maximum retry attempts for permission responses.
    private static let maxRetryAttempts = 3

    /// Send a decision response with exponential backoff retry (H5 fix).
    /// Used both by lock-screen action taps and the in-app Decide screen.
    func sendDecisionResponse(requestId: String, decision: String) {
        guard let url = URL(string: "\(serverUrl)\(AppConfig.Endpoints.response)") else {
            print("Invalid server URL for decision response")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let body: [String: Any] = [
            "requestId": requestId,
            "decision": decision
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            print("Failed to encode decision response: \(error)")
            return
        }

        attemptDecisionResponse(request: request, decision: decision, attempt: 1)
    }

    private func attemptDecisionResponse(request: URLRequest, decision: String, attempt: Int) {
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { return }

            if let error = error {
                if attempt < Self.maxRetryAttempts {
                    let delay = pow(2.0, Double(attempt)) // 2s, 4s (3 total attempts; attempt 3 is terminal)
                    print("Decision response attempt \(attempt) failed: \(error). Retrying in \(delay)s...")
                    DispatchQueue.global().asyncAfter(deadline: .now() + delay) {
                        self.attemptDecisionResponse(request: request, decision: decision, attempt: attempt + 1)
                    }
                } else {
                    print("Decision response FAILED after \(Self.maxRetryAttempts) attempts: \(error)")
                }
                return
            }

            if let httpResponse = response as? HTTPURLResponse {
                if (200...299).contains(httpResponse.statusCode) {
                    print("Decision response sent (\(decision)): HTTP \(httpResponse.statusCode)")
                } else if httpResponse.statusCode == 404,
                    (String(data: data ?? Data(), encoding: .utf8) ?? "").lowercased().contains("request not found or expired") {
                    // Server's own "Request not found or expired" 404: first-
                    // responder-wins (another device answered) or the request
                    // expired. Terminal — do NOT retry. An infrastructure 404
                    // (tunnel down, wrong host) has a different body and falls
                    // through to the retry path below, so a real decision is not
                    // silently dropped.
                    print("Decision response: request already resolved (HTTP 404 — another device answered)")
                } else if attempt < Self.maxRetryAttempts {
                    let delay = pow(2.0, Double(attempt))
                    print("Decision response attempt \(attempt) got HTTP \(httpResponse.statusCode). Retrying in \(delay)s...")
                    DispatchQueue.global().asyncAfter(deadline: .now() + delay) {
                        self.attemptDecisionResponse(request: request, decision: decision, attempt: attempt + 1)
                    }
                } else {
                    print("Decision response FAILED after \(Self.maxRetryAttempts) attempts: HTTP \(httpResponse.statusCode)")
                }
            }
        }.resume()
    }
}

// MARK: - Action ID → DecisionKind mapping

/// Translate an iOS notification action identifier into the DecisionKind
/// string the server expects on POST /api/response. Returns nil for
/// non-decision actions (Open in Shooter, dismiss, default-tap) — those
/// route to the Decide screen instead of sending a response.
private func decisionFor(actionIdentifier: String) -> String? {
    switch actionIdentifier {
    case AppConfig.Notifications.Actions.allow:       return "allow"
    case AppConfig.Notifications.Actions.deny:        return "deny"
    case AppConfig.Notifications.Actions.option1:     return "option_1"
    case AppConfig.Notifications.Actions.option2:     return "option_2"
    case AppConfig.Notifications.Actions.option3:     return "option_3"
    case AppConfig.Notifications.Actions.option4:     return "option_4"
    case AppConfig.Notifications.Actions.planAuto:    return "plan_auto"
    case AppConfig.Notifications.Actions.planAccept:  return "plan_accept"
    case AppConfig.Notifications.Actions.planReview:  return "plan_review"
    case AppConfig.Notifications.Actions.planKeep:    return "plan_keep"
    default: return nil
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension NotificationManager: UNUserNotificationCenterDelegate {

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        let actionIdentifier = response.actionIdentifier
        let requestId = userInfo["requestId"] as? String

        if actionIdentifier == AppConfig.Notifications.Actions.openInApp,
           let requestId = requestId {
            // User explicitly asked to make the decision in-app — show
            // the Decide screen for richer context / unlimited options.
            DispatchQueue.main.async { self.decideRequestId = DecideRequestId(value: requestId) }
        } else if actionIdentifier == UNNotificationDefaultActionIdentifier,
                  let requestId = requestId {
            // User tapped the notification body (not an action button).
            // Open the Decide screen so they see context before
            // choosing.
            DispatchQueue.main.async { self.decideRequestId = DecideRequestId(value: requestId) }
        } else if actionIdentifier == UNNotificationDismissActionIdentifier {
            // Dismissed -- hook will timeout and fall through to the
            // local CC permission dialog. No-op on our side.
        } else if let decision = decisionFor(actionIdentifier: actionIdentifier),
                  let requestId = requestId {
            sendDecisionResponse(requestId: requestId, decision: decision)
        }

        completionHandler()
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Show the banner even when the app is in the foreground
        completionHandler([.banner, .sound, .badge])
    }
}
