import SwiftUI
import UserNotifications

@main
struct ShooterApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject private var notificationManager = NotificationManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(notificationManager)
                .onAppear {
                    notificationManager.requestPermission()
                    delegate.notificationManager = notificationManager
                }
        }
    }
}
