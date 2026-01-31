import Foundation
import UserNotifications
import UIKit

class NotificationManager: NSObject, ObservableObject {
    @Published var isAuthorized = false
    @Published var deviceToken: String?
    @Published var lastNotificationMessage = ""
    @Published var notifications: [NotificationItem] = []
    @Published var isConnected = false
    @Published var lastUpdate: Date?
    
    private var serverUrl: String = ""
    private var apiKey: String = ""
    
    override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
        checkAuthorizationStatus()
        loadStoredNotifications()
        loadConfiguration()
    }
    
    func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            DispatchQueue.main.async {
                self.isAuthorized = granted
                if granted {
                    self.registerForRemoteNotifications()
                }
            }
        }
    }
    
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
    
    func setDeviceToken(_ tokenData: Data) {
        let token = tokenData.map { String(format: "%02.2hhx", $0) }.joined()
        DispatchQueue.main.async {
            self.deviceToken = token
            print("Device Token: \(token)")
        }
    }
    
    func registerWithServer(serverUrl: String) {
        // Note: The current server doesn't have a register endpoint
        // Device token registration happens when sending notifications
        print("Device token registered locally: \(deviceToken ?? "none")")
        print("Server URL configured: \(serverUrl)")
    }
    
    func sendTestNotification() {
        let content = UNMutableNotificationContent()
        content.title = "Test Notification"
        content.body = "This is a test notification from Claude Notifier"
        content.sound = .default
        
        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        )
        
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                print("Failed to schedule test notification: \(error)")
            }
        }
    }
}

// MARK: - UNUserNotificationCenterDelegate
extension NotificationManager: UNUserNotificationCenterDelegate {
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        handleNotification(userInfo: userInfo)
        completionHandler()
    }
    
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let userInfo = notification.request.content.userInfo
        handleNotification(userInfo: userInfo)
        completionHandler([.banner, .sound, .badge])
    }
    
    private func handleNotification(userInfo: [AnyHashable: Any]) {
        print("Received notification: \(userInfo)")
        
        DispatchQueue.main.async {
            // Create notification item from received data
            let notification = self.createNotificationItem(from: userInfo)
            self.addNotification(notification)
            
            // Update last notification message for backward compatibility
            if let aps = userInfo["aps"] as? [String: Any],
               let alert = aps["alert"] as? [String: Any],
               let body = alert["body"] as? String {
                self.lastNotificationMessage = "📱 \(body)"
            } else if let message = userInfo["message"] as? String {
                self.lastNotificationMessage = "📱 \(message)"
            } else {
                self.lastNotificationMessage = "📱 Received notification at \(Date().formatted())"
            }
        }
    }
    
    // MARK: - Notification Management
    
    private func createNotificationItem(from userInfo: [AnyHashable: Any]) -> NotificationItem {
        // Extract title and message
        var title = "📱 SHOOTER Notification"
        var message = ""
        
        if let aps = userInfo["aps"] as? [String: Any] {
            if let alert = aps["alert"] as? [String: Any] {
                title = alert["title"] as? String ?? title
                message = alert["body"] as? String ?? ""
            } else if let alertString = aps["alert"] as? String {
                message = alertString
            }
        }
        
        // Extract custom data
        let type: NotificationType
        let metadata: [String: String] = [:]
        
        if let typeString = userInfo["type"] as? String,
           let notificationType = NotificationType(rawValue: typeString) {
            type = notificationType
        } else {
            type = .manualTest
        }
        
        return NotificationItem(
            title: title,
            message: message,
            timestamp: Date(),
            type: type,
            status: .delivered,
            metadata: metadata
        )
    }
    
    private func addNotification(_ notification: NotificationItem) {
        // Add to beginning of array (newest first)
        notifications.insert(notification, at: 0)
        
        // Limit to last 50 notifications
        if notifications.count > 50 {
            notifications = Array(notifications.prefix(50))
        }
        
        lastUpdate = Date()
        saveNotifications()
    }
    
    // MARK: - New Methods for Enhanced UI
    
    func autoSetupForDevelopment() {
        // Auto-register with server if we have permission and device token
        if isAuthorized, deviceToken != nil {
            registerWithServer(serverUrl: serverUrl)
            
            // Call async method properly
            Task {
                await checkServerConnection()
            }
        }
        
        // Don't load mock data in production - only show real notifications
    }
    
    func refreshNotifications() async {
        await checkServerConnection()
        // In a real app, this would fetch notification history from the server
        lastUpdate = Date()
    }
    
    func updateConfiguration(serverUrl: String, apiKey: String) {
        self.serverUrl = serverUrl
        self.apiKey = apiKey
        
        // Save to UserDefaults
        UserDefaults.standard.set(serverUrl, forKey: "serverUrl")
        UserDefaults.standard.set(apiKey, forKey: "apiKey")
        
        // Re-register with new server
        if isAuthorized, deviceToken != nil {
            registerWithServer(serverUrl: serverUrl)
        }
    }
    
    func sendTestNotificationThroughServer(serverUrl: String, apiKey: String, completion: @escaping (Bool, String) -> Void) {
        guard !serverUrl.isEmpty,
              !apiKey.isEmpty,
              let url = URL(string: "\(serverUrl)/notify") else {
            completion(false, "❌ Invalid server URL or missing API key")
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        
        let body = [
            "title": "🧪 SHOOTER: Configuration Test",
            "message": "Test notification sent at \(Date().formatted(date: .omitted, time: .standard))",
            "data": [
                "source": "ios-config-test",
                "category": "test",
                "timestamp": "\(Int(Date().timeIntervalSince1970))"
            ]
        ] as [String: Any]
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            completion(false, "Failed to encode request body: \(error.localizedDescription)")
            return
        }
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(false, "Network error: \(error.localizedDescription)")
                    return
                }
                
                if let httpResponse = response as? HTTPURLResponse {
                    print("Test notification response: \(httpResponse.statusCode)")
                    
                    if httpResponse.statusCode == 200 {
                        completion(true, "✅ Test notification sent successfully! Check your device.")
                    } else if httpResponse.statusCode == 401 {
                        completion(false, "❌ Invalid API key - check your configuration")
                    } else if httpResponse.statusCode == 500 {
                        completion(false, "❌ Server configuration error - check APNs setup")
                    } else {
                        completion(false, "❌ Server error: HTTP \(httpResponse.statusCode)")
                    }
                } else {
                    completion(false, "❌ Invalid response from server")
                }
            }
        }.resume()
    }
    
    @MainActor
    private func checkServerConnection() async {
        guard let url = URL(string: "\(serverUrl)/api/health") else {
            isConnected = false
            return
        }
        
        do {
            let (_, response) = try await URLSession.shared.data(from: url)
            if let httpResponse = response as? HTTPURLResponse {
                isConnected = httpResponse.statusCode == 200
            } else {
                isConnected = false
            }
        } catch {
            isConnected = false
        }
    }
    
    // MARK: - Persistence
    
    private func loadStoredNotifications() {
        if let data = UserDefaults.standard.data(forKey: "storedNotifications"),
           let decodedNotifications = try? JSONDecoder().decode([NotificationItem].self, from: data) {
            notifications = decodedNotifications
        }
    }
    
    private func saveNotifications() {
        if let encoded = try? JSONEncoder().encode(notifications) {
            UserDefaults.standard.set(encoded, forKey: "storedNotifications")
        }
    }
    
    private func loadConfiguration() {
        // Load saved configuration or set defaults
        if let savedServerUrl = UserDefaults.standard.string(forKey: "serverUrl") {
            serverUrl = savedServerUrl
        } else {
            serverUrl = AppConfig.defaultServerURL
        }
        
        if let savedApiKey = UserDefaults.standard.string(forKey: "apiKey") {
            apiKey = savedApiKey
        } else {
            // No default API key - user must configure
            apiKey = ""
        }
    }
}