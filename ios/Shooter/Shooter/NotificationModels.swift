import Foundation
import SwiftUI

// MARK: - Notification Models

struct NotificationItem: Identifiable, Codable {
    let id: String
    let title: String
    let message: String
    let timestamp: Date
    let type: NotificationType
    let status: NotificationStatus
    let metadata: [String: String]
    
    init(id: String = UUID().uuidString,
         title: String,
         message: String,
         timestamp: Date = Date(),
         type: NotificationType,
         status: NotificationStatus = .delivered,
         metadata: [String: String] = [:]) {
        self.id = id
        self.title = title
        self.message = message
        self.timestamp = timestamp
        self.type = type
        self.status = status
        self.metadata = metadata
    }
}

enum NotificationType: String, Codable, CaseIterable {
    case toolStart = "tool_start"
    case toolComplete = "tool_complete"
    case userPrompt = "user_prompt"
    case sessionStart = "session_start"
    case sessionEnd = "session_end"
    case manualTest = "manual_test"
    case error = "error"
    
    var iconName: String {
        switch self {
        case .toolStart: return "wrench.fill"
        case .toolComplete: return "checkmark.circle.fill"
        case .userPrompt: return "bubble.left.fill"
        case .sessionStart: return "play.circle.fill"
        case .sessionEnd: return "stop.circle.fill"
        case .manualTest: return "flask.fill"
        case .error: return "xmark.circle.fill"
        }
    }
    
    var iconColor: Color {
        switch self {
        case .toolStart: return .blue
        case .toolComplete: return .green
        case .userPrompt: return .purple
        case .sessionStart: return .cyan
        case .sessionEnd: return .orange
        case .manualTest: return .yellow
        case .error: return .red
        }
    }
}

enum NotificationStatus: String, Codable, CaseIterable {
    case delivered = "delivered"
    case sent = "sent"
    case pending = "pending"
    case failed = "failed"
    
    var color: Color {
        switch self {
        case .delivered: return .green
        case .sent: return .blue
        case .pending: return .orange
        case .failed: return .red
        }
    }
}

// MARK: - Extensions

extension NotificationItem {
    var iconName: String { type.iconName }
    var iconColor: Color { type.iconColor }
    var statusColor: Color { status.color }
}

// MARK: - Mock Data for Development

extension NotificationItem {
    static let mockNotifications: [NotificationItem] = [
        NotificationItem(
            title: "🔧 SHOOTER: Editing config.js",
            message: "09:42:15 • Starting code edit in shooter",
            timestamp: Date().addingTimeInterval(-120),
            type: .toolStart,
            status: .delivered,
            metadata: ["tool": "Edit", "file": "config.js", "project": "shooter"]
        ),
        NotificationItem(
            title: "✅ SHOOTER: Edit Complete",
            message: "09:42:18 • config.js updated successfully",
            timestamp: Date().addingTimeInterval(-117),
            type: .toolComplete,
            status: .delivered,
            metadata: ["tool": "Edit", "file": "config.js", "success": "true"]
        ),
        NotificationItem(
            title: "🚀 SHOOTER: New Feature",
            message: "09:45:33 • Working on: Create notification system UI",
            timestamp: Date().addingTimeInterval(-300),
            type: .userPrompt,
            status: .delivered,
            metadata: ["prompt_preview": "Create notification system UI", "category": "feature"]
        ),
        NotificationItem(
            title: "⚡ SHOOTER: Running Command",
            message: "09:46:12 • Executing: npm run build",
            timestamp: Date().addingTimeInterval(-30),
            type: .toolStart,
            status: .delivered,
            metadata: ["tool": "Bash", "command": "npm run build"]
        ),
        NotificationItem(
            title: "🎯 SHOOTER: Session Started",
            message: "09:40:00 • Claude Code session active in shooter",
            timestamp: Date().addingTimeInterval(-480),
            type: .sessionStart,
            status: .delivered,
            metadata: ["project": "shooter", "cwd": "/Users/user/shooter"]
        )
    ]
}