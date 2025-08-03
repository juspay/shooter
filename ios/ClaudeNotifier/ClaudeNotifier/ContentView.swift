import SwiftUI

struct ContentView: View {
    @EnvironmentObject var notificationManager: NotificationManager
    @State private var serverUrl = AppConfig.defaultServerURL
    @State private var lastNotification = "No notifications received yet"
    @State private var showingAlert = false
    @State private var alertMessage = ""
    
    var body: some View {
        NavigationView {
            VStack(spacing: 30) {
                // Header
                VStack(spacing: 10) {
                    Image(systemName: "bell.badge")
                        .font(.system(size: 60))
                        .foregroundColor(.blue)
                    
                    Text("Claude Notifier")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    
                    Text("Receive push notifications from Claude Code")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                
                // Status Section
                VStack(alignment: .leading, spacing: 15) {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(notificationManager.isAuthorized ? .green : .red)
                        Text("Notification Permission")
                        Spacer()
                        Text(notificationManager.isAuthorized ? "Granted" : "Denied")
                            .foregroundColor(notificationManager.isAuthorized ? .green : .red)
                    }
                    
                    HStack {
                        Image(systemName: "device.iphone")
                            .foregroundColor(.blue)
                        Text("Device Token")
                        Spacer()
                        Text(notificationManager.deviceToken != nil ? "✓" : "Pending")
                            .foregroundColor(notificationManager.deviceToken != nil ? .green : .orange)
                    }
                    
                    if let token = notificationManager.deviceToken {
                        VStack(alignment: .leading, spacing: 5) {
                            Text("Device Token:")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text(token)
                                .font(.system(.caption, design: .monospaced))
                                .padding(8)
                                .background(Color.gray.opacity(0.1))
                                .cornerRadius(8)
                                .onTapGesture {
                                    UIPasteboard.general.string = token
                                    alertMessage = "Device token copied to clipboard!"
                                    showingAlert = true
                                }
                        }
                    }
                }
                .padding()
                .background(Color.gray.opacity(0.05))
                .cornerRadius(15)
                
                // Server Configuration
                VStack(alignment: .leading, spacing: 10) {
                    Text("Server Configuration")
                        .font(.headline)
                    
                    TextField("Server URL", text: $serverUrl)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .keyboardType(.URL)
                        .autocapitalization(.none)
                    
                    Button(action: {
                        notificationManager.registerWithServer(serverUrl: serverUrl)
                    }) {
                        HStack {
                            Image(systemName: "arrow.up.circle.fill")
                            Text("Register Device Token")
                        }
                        .foregroundColor(.white)
                        .padding()
                        .background(Color.blue)
                        .cornerRadius(10)
                    }
                    .disabled(notificationManager.deviceToken == nil)
                }
                .padding()
                .background(Color.gray.opacity(0.05))
                .cornerRadius(15)
                
                // Test Notification
                Button(action: {
                    notificationManager.sendTestNotification()
                }) {
                    HStack {
                        Image(systemName: "bell.fill")
                        Text("Send Test Notification")
                    }
                    .foregroundColor(.white)
                    .padding()
                    .background(Color.green)
                    .cornerRadius(10)
                }
                
                // Last Notification
                VStack(alignment: .leading, spacing: 5) {
                    Text("Last Notification:")
                        .font(.headline)
                    Text(lastNotification)
                        .font(.body)
                        .padding()
                        .background(Color.gray.opacity(0.05))
                        .cornerRadius(10)
                }
                
                Spacer()
            }
            .padding()
            .navigationTitle("Claude Notifier")
            .navigationBarTitleDisplayMode(.inline)
            .onReceive(notificationManager.$lastNotificationMessage) { message in
                if !message.isEmpty {
                    lastNotification = message
                }
            }
            .alert("Info", isPresented: $showingAlert) {
                Button("OK") { }
            } message: {
                Text(alertMessage)
            }
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(NotificationManager())
}