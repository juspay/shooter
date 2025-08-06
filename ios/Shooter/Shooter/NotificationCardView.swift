import SwiftUI

struct NotificationCardView: View {
    let notification: NotificationItem
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header with icon and title
            HStack(alignment: .top, spacing: 12) {
                // Notification type icon
                Image(systemName: notification.iconName)
                    .font(.title2)
                    .foregroundStyle(notification.iconColor)
                    .frame(width: 24, height: 24)
                
                VStack(alignment: .leading, spacing: 4) {
                    // Title
                    Text(notification.title)
                        .font(.headline)
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                    
                    // Metadata row
                    HStack(spacing: 8) {
                        Text(notification.timestamp, style: .time)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        
                        Text("•")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                        
                        Text(notification.timestamp, style: .relative)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        
                        Spacer()
                        
                        // Status indicator
                        statusIndicator
                    }
                }
            }
            
            // Message body
            if !notification.message.isEmpty {
                Text(notification.message)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
            
            // Metadata tags
            if !notification.metadata.isEmpty {
                metadataTagsView
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(.tertiary, lineWidth: 0.5)
        )
    }
    
    // MARK: - Status Indicator
    private var statusIndicator: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(notification.statusColor)
                .frame(width: 6, height: 6)
            
            Text(notification.status.rawValue.uppercased())
                .font(.caption2)
                .fontWeight(.medium)
                .foregroundColor(notification.statusColor)
        }
    }
    
    // MARK: - Metadata Tags
    private var metadataTagsView: some View {
        LazyVGrid(columns: [
            GridItem(.adaptive(minimum: 80), spacing: 6)
        ], spacing: 6) {
            ForEach(Array(notification.metadata.keys.sorted()), id: \.self) { key in
                if let value = notification.metadata[key] {
                    metadataTag(key: key, value: value)
                }
            }
        }
    }
    
    private func metadataTag(key: String, value: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: iconForMetadataKey(key))
                .font(.caption2)
                .foregroundStyle(.secondary)
            
            Text(value)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(.tertiary.opacity(0.3), in: RoundedRectangle(cornerRadius: 4))
    }
    
    private func iconForMetadataKey(_ key: String) -> String {
        switch key.lowercased() {
        case "file": return "doc.text"
        case "tool": return "wrench"
        case "project": return "folder"
        case "category": return "tag"
        case "command": return "terminal"
        default: return "info.circle"
        }
    }
}

// MARK: - Preview
#Preview {
    VStack(spacing: 16) {
        NotificationCardView(notification: NotificationItem(
            id: "1",
            title: "🔧 SHOOTER: Editing config.js",
            message: "Starting code edit in shooter project",
            timestamp: Date(),
            type: .toolStart,
            status: .delivered,
            metadata: ["tool": "Edit", "file": "config.js", "project": "shooter"]
        ))
        
        NotificationCardView(notification: NotificationItem(
            id: "2",
            title: "✅ SHOOTER: Edit Complete",
            message: "config.js updated successfully",
            timestamp: Date().addingTimeInterval(-180),
            type: .toolComplete,
            status: .delivered,
            metadata: ["tool": "Edit", "file": "config.js"]
        ))
        
        NotificationCardView(notification: NotificationItem(
            id: "3",
            title: "🚀 SHOOTER: New Feature",
            message: "Working on: Create notification system UI",
            timestamp: Date().addingTimeInterval(-300),
            type: .userPrompt,
            status: .delivered,
            metadata: ["category": "feature"]
        ))
    }
    .padding()
    .background(.gray.opacity(0.1))
}