// ShooterHomeWidget.swift
//
// Home-screen WidgetKit widget showing the latest Shooter session's status.
// Reads the App Group snapshot the app writes (WidgetSharedStore); no network.
// Small + medium families, Amber Phosphor accent. Widget-extension target only.
//
// Requires iOS 16.1+ (WidgetKit).

import SwiftUI
import WidgetKit

private let amber = Color(red: 0.961, green: 0.694, blue: 0.298) // #F5B14C

struct ShooterHomeEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetShared.Snapshot
}

struct ShooterHomeProvider: TimelineProvider {
    func placeholder(in context: Context) -> ShooterHomeEntry {
        ShooterHomeEntry(date: Date(), snapshot: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (ShooterHomeEntry) -> Void) {
        completion(ShooterHomeEntry(date: Date(), snapshot: WidgetShared.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ShooterHomeEntry>) -> Void) {
        let entry = ShooterHomeEntry(date: Date(), snapshot: WidgetShared.read())
        // The app reloads the timeline on every write; this .after is only a
        // fallback so a long-idle widget still re-reads (and re-renders "stale").
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct ShooterHomeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ShooterHomeEntry

    private var dotColor: Color {
        entry.snapshot.hasActivity ? Color.green : Color.secondary
    }

    var body: some View {
        VStack(alignment: .leading, spacing: family == .systemSmall ? 6 : 8) {
            HStack(spacing: 6) {
                Image(systemName: "terminal.fill").foregroundColor(amber).font(.caption)
                Text("Shooter").font(.caption2.weight(.semibold)).foregroundColor(.secondary)
                Spacer()
                Circle().fill(dotColor).frame(width: 8, height: 8)
            }

            Spacer(minLength: 0)

            Text(entry.snapshot.title)
                .font(family == .systemSmall ? .headline : .title3)
                .fontWeight(.semibold)
                .lineLimit(family == .systemSmall ? 2 : 1)

            Text(entry.snapshot.status)
                .font(.subheadline)
                .foregroundColor(amber)
                .lineLimit(1)

            if entry.snapshot.updatedAt.timeIntervalSince1970 > 0 {
                Text(entry.snapshot.updatedAt, style: .relative)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding()
        .widgetBackground(Color.black.opacity(0.9))
    }
}

private extension View {
    /// iOS 17 requires `containerBackground`; earlier versions use a plain background.
    @ViewBuilder
    func widgetBackground(_ color: Color) -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(for: .widget) { color }
        } else {
            background(color)
        }
    }
}

struct ShooterHomeWidget: Widget {
    let kind = "ShooterHomeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ShooterHomeProvider()) { entry in
            ShooterHomeWidgetView(entry: entry)
        }
        .configurationDisplayName("Shooter Session")
        .description("The latest coding session and its status.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
