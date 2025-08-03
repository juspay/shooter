import SwiftUI
import UserNotifications

@main
struct ClaudeNotifierApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject private var notificationManager = NotificationManager()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(notificationManager)
                .onAppear {
                    notificationManager.requestPermission()
                    // Set the notification manager in the app delegate
                    delegate.notificationManager = notificationManager
                }
        }
    }
}