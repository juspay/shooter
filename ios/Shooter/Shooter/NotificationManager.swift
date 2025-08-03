import Foundation
import UserNotifications
import UIKit

class NotificationManager: NSObject, ObservableObject {
    @Published var isAuthorized = false
    @Published var deviceToken: String?
    @Published var lastNotificationMessage = ""
    
    override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
        checkAuthorizationStatus()
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
        guard let token = deviceToken,
              let url = URL(string: "\(serverUrl)\(AppConfig.Endpoints.register)") else {
            print("Invalid server URL or missing device token")
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = [
            "deviceToken": token,
            "platform": "ios"
        ]
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            print("Failed to encode request body: \(error)")
            return
        }
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("Failed to register with server: \(error)")
                return
            }
            
            if let httpResponse = response as? HTTPURLResponse {
                print("Registration response status: \(httpResponse.statusCode)")
            }
        }.resume()
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
}