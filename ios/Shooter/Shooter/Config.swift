import Foundation

struct AppConfig {
    // Server Configuration
    static let defaultServerURL = "https://shooter-dtufsplzq-sachin-sharmas-projects-7dbbe7a8.vercel.app"
    static let apiVersion = "v1"
    
    // Endpoints
    struct Endpoints {
        static let notify = "/api/notify"
        static let health = "/api/health"
        static let register = "/api/register"
        static let webhook = "/api/webhook"
    }
    
    // App Information
    struct App {
        static let name = "Shooter"
        static let bundleId = "in.juspay.shooter"
        static let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        static let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }
    
    // Notification Configuration
    struct Notifications {
        static let categories: [String] = ["SHOOTER", "BUILD_STATUS", "DEPLOYMENT"]
        static let soundName = "default"
    }
    
    // Development/Debug settings
    struct Debug {
        #if DEBUG
        static let isDebugMode = true
        static let logLevel = "verbose"
        #else
        static let isDebugMode = false
        static let logLevel = "error"
        #endif
    }
}