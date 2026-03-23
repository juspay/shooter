import Foundation
import UserNotifications
import UIKit

class NotificationManager: NSObject, ObservableObject {
    @Published var isAuthorized = false
    @Published var deviceToken: String?
    @Published var isConnected = false

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

    // MARK: - Notification Categories (Interactive Allow/Deny)

    private func setupNotificationCategories() {
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
            actions: [allowAction, denyAction],
            intentIdentifiers: [],
            options: []
        )

        UNUserNotificationCenter.current().setNotificationCategories([permissionCategory])
        print("Registered notification categories: CLAUDE_PERMISSION (Allow/Deny)")
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
            "bundleId": AppConfig.App.bundleId
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

    /// Send a permission response with exponential backoff retry (H5 fix).
    private func sendPermissionResponse(requestId: String, decision: String) {
        guard let url = URL(string: "\(serverUrl)\(AppConfig.Endpoints.response)") else {
            print("Invalid server URL for permission response")
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
            print("Failed to encode permission response: \(error)")
            return
        }

        attemptPermissionResponse(request: request, decision: decision, attempt: 1)
    }

    private func attemptPermissionResponse(request: URLRequest, decision: String, attempt: Int) {
        URLSession.shared.dataTask(with: request) { [weak self] _, response, error in
            guard let self = self else { return }

            if let error = error {
                if attempt < Self.maxRetryAttempts {
                    let delay = pow(2.0, Double(attempt)) // 2s, 4s, 8s
                    print("Permission response attempt \(attempt) failed: \(error). Retrying in \(delay)s...")
                    DispatchQueue.global().asyncAfter(deadline: .now() + delay) {
                        self.attemptPermissionResponse(request: request, decision: decision, attempt: attempt + 1)
                    }
                } else {
                    print("Permission response FAILED after \(Self.maxRetryAttempts) attempts: \(error)")
                }
                return
            }

            if let httpResponse = response as? HTTPURLResponse {
                if (200...299).contains(httpResponse.statusCode) {
                    print("Permission response sent (\(decision)): HTTP \(httpResponse.statusCode)")
                } else if attempt < Self.maxRetryAttempts {
                    let delay = pow(2.0, Double(attempt))
                    print("Permission response attempt \(attempt) got HTTP \(httpResponse.statusCode). Retrying in \(delay)s...")
                    DispatchQueue.global().asyncAfter(deadline: .now() + delay) {
                        self.attemptPermissionResponse(request: request, decision: decision, attempt: attempt + 1)
                    }
                } else {
                    print("Permission response FAILED after \(Self.maxRetryAttempts) attempts: HTTP \(httpResponse.statusCode)")
                }
            }
        }.resume()
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
        let categoryIdentifier = response.notification.request.content.categoryIdentifier

        // Handle interactive permission responses (Allow/Deny from notification)
        if categoryIdentifier == AppConfig.Notifications.Categories.permission {
            let requestId = userInfo["requestId"] as? String
            var decision: String? = nil

            switch actionIdentifier {
            case AppConfig.Notifications.Actions.allow:
                decision = "allow"
            case AppConfig.Notifications.Actions.deny:
                decision = "deny"
            case UNNotificationDismissActionIdentifier:
                // Dismissed -- hook will timeout and fall through to local dialog
                break
            default:
                // Tapped notification body (opened app) -- no decision
                break
            }

            if let decision = decision, let requestId = requestId {
                sendPermissionResponse(requestId: requestId, decision: decision)
            }
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
