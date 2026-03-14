import Foundation

struct AppConfig {
    // Server Configuration
    static let defaultServerURL = "http://localhost:5175"
    static let apiVersion = "v1"
    
    // Endpoints
    struct Endpoints {
        static let notify = "/api/notify"
        static let health = "/api/health"
        static let webhook = "/api/webhook"
        static let response = "/api/response"
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
        static let categories: [String] = ["SHOOTER", "BUILD_STATUS", "DEPLOYMENT", "CLAUDE_PERMISSION"]
        static let soundName = "default"

        // Interactive notification action identifiers
        struct Actions {
            static let allow = "ALLOW_ACTION"
            static let deny = "DENY_ACTION"
        }

        // Interactive notification category identifiers
        struct Categories {
            static let permission = "CLAUDE_PERMISSION"
        }
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