// ShooterActivityAttributes.swift
//
// Shared between the main app (which starts/ends activities) and the widget
// extension (which renders them). The nested `ContentState` MUST stay in lockstep
// with `LiveActivityContentState` in src/lib/types/live-activity.ts — the server
// pushes exactly this shape as the ActivityKit `content-state`.
//
// Requires iOS 16.1+ (ActivityKit). Add this file to BOTH the app target and the
// widget-extension target (Target Membership).

import ActivityKit
import Foundation

struct ShooterActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var title: String        // session / terminal name
        var status: String       // "Running", "Awaiting input", "Done"
        var detail: String?      // last tool or message
        var progress: Double?    // 0...1 optional
        var updatedAt: String    // ISO timestamp
    }

    // Static attributes fixed for the life of the activity.
    var sessionId: String
}
