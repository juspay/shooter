import Foundation

struct AppConfig {
    // Server Configuration
    static let defaultServerURL = "https://shooter.breezehq.dev"

    // Endpoints
    struct Endpoints {
        static let health = "/api/health"
        static let response = "/api/response"
        /// GET /api/decide/<requestId> — full payload for the Decide screen.
        static let decide = "/api/decide"
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
        // Interactive notification action identifiers
        //
        // Values match the DecisionKind union on the server
        // (src/lib/types/decision.ts). Lock-screen buttons POST these
        // strings to /api/response and the server treats them as
        // DecisionKind values.
        struct Actions {
            // ─── PermissionRequest (binary) ─────────────────────────
            static let allow = "ALLOW_ACTION"
            static let deny = "DENY_ACTION"

            // ─── Generic numbered choices (MCP elicitation, AskUserQuestion) ───
            // The body text tells the user what each option means; the
            // button label itself is just "Option N". Capped at 4 per
            // iOS notification action limit.
            static let option1 = "OPTION_1_ACTION"
            static let option2 = "OPTION_2_ACTION"
            static let option3 = "OPTION_3_ACTION"
            static let option4 = "OPTION_4_ACTION"

            // ─── Plan-mode approval (ExitPlanMode) ─────────────────
            static let planAuto = "PLAN_AUTO_ACTION"
            static let planAccept = "PLAN_ACCEPT_ACTION"
            static let planReview = "PLAN_REVIEW_ACTION"
            static let planKeep = "PLAN_KEEP_ACTION"

            // ─── Fallback action present on every category ─────────
            // Opens the app to the Decide screen instead of sending a
            // decision. Used when the dynamic options don't fit lock-
            // screen buttons (>4 choices) or the user wants more
            // context before deciding.
            static let openInApp = "OPEN_IN_APP_ACTION"
        }

        // Interactive notification category identifiers
        //
        // Each category is pre-registered at app launch with a fixed
        // action set. iOS doesn't allow per-notification dynamic action
        // labels, so the server picks the right category based on the
        // event kind + option count.
        struct Categories {
            static let permission = "CLAUDE_PERMISSION"
            static let planApproval = "CLAUDE_PLAN_APPROVAL"
            static let choice2 = "CLAUDE_CHOICE_2"
            static let choice3 = "CLAUDE_CHOICE_3"
            static let choice4 = "CLAUDE_CHOICE_4"
        }
    }

    // Development/Debug settings
    struct Debug {
        #if DEBUG
        static let isDebugMode = true
        #else
        static let isDebugMode = false
        #endif
    }
}
