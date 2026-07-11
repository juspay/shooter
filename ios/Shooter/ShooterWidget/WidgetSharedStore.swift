// WidgetSharedStore.swift
//
// A tiny session snapshot shared between the main app (writer) and the widget
// extension (reader) via an App Group UserDefaults. The app writes the latest
// session state as notifications arrive; the home-screen widget reads it. Keeps
// the widget network- and credential-free.
//
// Add this file to BOTH the app target and the widget-extension target.

import Foundation
import WidgetKit

enum WidgetShared {
    static let appGroup = "group.in.juspay.shooter"
    private static let snapshotKey = "widget.snapshot"

    /// The data the home-screen widget renders. Codable so it round-trips through
    /// the shared UserDefaults; kept small (a widget timeline entry, not a feed).
    struct Snapshot: Codable {
        var sessionId: String // which session this snapshot is about (affinity)
        var title: String     // latest session / terminal name
        var status: String    // "Running", "Awaiting input", "Done", …
        var hasActivity: Bool // true while something is running or awaiting input
        var updatedAt: Date

        static let empty = Snapshot(sessionId: "", title: "No sessions", status: "Idle",
                                    hasActivity: false, updatedAt: Date(timeIntervalSince1970: 0))
    }

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroup)
    }

    /// Called by the APP whenever session state changes. Persists the snapshot and
    /// asks WidgetKit to refresh the timeline so the widget updates promptly.
    static func write(_ snapshot: Snapshot) {
        guard let d = defaults, let data = try? JSONEncoder().encode(snapshot) else { return }
        d.set(data, forKey: snapshotKey)
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Called by the WIDGET's timeline provider. Returns `.empty` when nothing has
    /// been written yet (first install, or app never ran).
    static func read() -> Snapshot {
        guard let d = defaults, let data = d.data(forKey: snapshotKey),
              let snap = try? JSONDecoder().decode(Snapshot.self, from: data) else {
            return .empty
        }
        return snap
    }
}
