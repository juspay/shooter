// ShooterLiveActivity.swift
//
// The Lock Screen / Dynamic Island presentation for a Shooter coding session.
// Belongs to the WIDGET EXTENSION target only. Amber Phosphor accent (#F5B14C)
// matches the app identity.
//
// Requires iOS 16.1+ (WidgetKit + ActivityKit).

import ActivityKit
import SwiftUI
import WidgetKit

private let amber = Color(red: 0.961, green: 0.694, blue: 0.298) // #F5B14C

struct ShooterLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ShooterActivityAttributes.self) { context in
            // ── Lock Screen / banner ──
            HStack(spacing: 12) {
                Image(systemName: statusIcon(context.state.status))
                    .foregroundColor(amber)
                    .font(.title3)
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.state.title)
                        .font(.headline)
                        .lineLimit(1)
                    Text(context.state.detail ?? context.state.status)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                statusPill(context.state.status)
            }
            .padding()
            .activityBackgroundTint(Color.black.opacity(0.85))
            .activitySystemActionForegroundColor(amber)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: statusIcon(context.state.status))
                        .foregroundColor(amber)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.title).font(.caption).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    statusPill(context.state.status)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let detail = context.state.detail {
                        Text(detail).font(.caption2).foregroundColor(.secondary).lineLimit(1)
                    }
                }
            } compactLeading: {
                Image(systemName: statusIcon(context.state.status)).foregroundColor(amber)
            } compactTrailing: {
                Text(shortStatus(context.state.status)).font(.caption2).foregroundColor(amber)
            } minimal: {
                Image(systemName: statusIcon(context.state.status)).foregroundColor(amber)
            }
            .keylineTint(amber)
        }
    }

    private func statusIcon(_ status: String) -> String {
        switch status.lowercased() {
        case let s where s.contains("await"): return "questionmark.circle.fill"
        case let s where s.contains("done"), let s where s.contains("complete"): return "checkmark.circle.fill"
        case let s where s.contains("error"), let s where s.contains("fail"): return "exclamationmark.triangle.fill"
        default: return "terminal.fill"
        }
    }

    private func shortStatus(_ status: String) -> String {
        String(status.prefix(4))
    }

    @ViewBuilder
    private func statusPill(_ status: String) -> some View {
        Text(status)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(amber.opacity(0.18))
            .foregroundColor(amber)
            .clipShape(Capsule())
    }
}
