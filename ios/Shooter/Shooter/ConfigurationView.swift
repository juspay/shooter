import SwiftUI

struct ConfigurationView: View {
    @EnvironmentObject var notificationManager: NotificationManager
    @Environment(\.dismiss) private var dismiss
    @State private var serverUrl = ""
    @State private var apiKey = ""
    @State private var showingAlert = false
    @State private var alertMessage = ""
    @State private var isLoading = false
    
    var body: some View {
        NavigationStack {
            Form {
                // Status Section
                Section {
                    statusRow(
                        title: "Notification Permission",
                        systemImage: "bell.badge",
                        status: notificationManager.isAuthorized ? "Granted" : "Denied",
                        isGood: notificationManager.isAuthorized
                    )
                    
                    statusRow(
                        title: "Device Token",
                        systemImage: "device.iphone",
                        status: notificationManager.deviceToken != nil ? "Ready" : "Pending",
                        isGood: notificationManager.deviceToken != nil
                    )
                    
                    statusRow(
                        title: "Server Connection",
                        systemImage: "network",
                        status: notificationManager.isConnected ? "Online" : "Offline",
                        isGood: notificationManager.isConnected
                    )
                } header: {
                    Text("System Status")
                }
                
                // Configuration Section
                Section {
                    HStack {
                        Image(systemName: "server.rack")
                            .foregroundStyle(.blue)
                            .frame(width: 20)
                        
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Server URL")
                                .font(.subheadline)
                            TextField("http://localhost:5173", text: $serverUrl)
                                .textFieldStyle(.plain)
                                .keyboardType(.URL)
                                .autocapitalization(.none)
                                .autocorrectionDisabled()
                        }
                    }
                    
                    HStack {
                        Image(systemName: "key")
                            .foregroundStyle(.green)
                            .frame(width: 20)
                        
                        VStack(alignment: .leading, spacing: 2) {
                            Text("API Key")
                                .font(.subheadline)
                            SecureField("your-api-key-here", text: $apiKey)
                                .textFieldStyle(.plain)
                        }
                    }
                } header: {
                    Text("Configuration")
                } footer: {
                    Text("Enter your server URL and API key. The API key should match the one configured in your server environment.")
                }
                
                // Device Token Section
                if let token = notificationManager.deviceToken {
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Device Token")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            
                            Text(token)
                                .font(.system(.caption, design: .monospaced))
                                .padding(8)
                                .background(.gray.opacity(0.1))
                                .cornerRadius(6)
                                .onTapGesture {
                                    UIPasteboard.general.string = token
                                    alertMessage = "Device token copied to clipboard!"
                                    showingAlert = true
                                }
                        }
                    } header: {
                        Text("Device Information")
                    } footer: {
                        Text("Tap to copy the device token to clipboard. This token is used to send notifications to this device.")
                    }
                }
                
                // Actions Section
                Section {
                    Button {
                        testConfiguration()
                    } label: {
                        HStack {
                            Image(systemName: "bell.fill")
                            Text("Send Test Notification")
                            Spacer()
                            if isLoading {
                                ProgressView()
                                    .scaleEffect(0.8)
                            }
                        }
                    }
                    .disabled(isLoading || !notificationManager.isAuthorized)
                    
                    Button {
                        saveConfiguration()
                    } label: {
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                            Text("Save Configuration")
                        }
                    }
                    .disabled(serverUrl.isEmpty || apiKey.isEmpty)
                    
                    if !notificationManager.isAuthorized {
                        Button {
                            notificationManager.requestPermission()
                        } label: {
                            HStack {
                                Image(systemName: "bell.badge")
                                Text("Request Notification Permission")
                            }
                        }
                    }
                } header: {
                    Text("Actions")
                }
                
                // Setup Guide Section
                Section {
                    setupStepView(
                        number: 1,
                        title: "Enable Notifications",
                        description: "Allow SHOOTER to send notifications",
                        isCompleted: notificationManager.isAuthorized
                    )
                    
                    setupStepView(
                        number: 2,
                        title: "Configure Server",
                        description: "Set your server URL and API key",
                        isCompleted: !serverUrl.isEmpty
                    )
                    
                    setupStepView(
                        number: 3,
                        title: "Test & Save",
                        description: "Send a test notification and save settings",
                        isCompleted: notificationManager.isConnected
                    )
                } header: {
                    Text("Setup Guide")
                }
            }
            .navigationTitle("Configuration")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .alert("Configuration", isPresented: $showingAlert) {
                Button("OK") { }
            } message: {
                Text(alertMessage)
            }
            .onAppear {
                loadConfiguration()
            }
        }
    }
    
    // MARK: - Status Row
    private func statusRow(title: String, systemImage: String, status: String, isGood: Bool) -> some View {
        HStack {
            Image(systemName: systemImage)
                .foregroundStyle(isGood ? .green : .red)
                .frame(width: 20)
            
            Text(title)
            
            Spacer()
            
            Text(status)
                .font(.subheadline)
                .foregroundStyle(isGood ? .green : .red)
                .fontWeight(.medium)
        }
    }
    
    // MARK: - Setup Step View
    private func setupStepView(number: Int, title: String, description: String, isCompleted: Bool) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(isCompleted ? .green : .gray.opacity(0.3))
                    .frame(width: 24, height: 24)
                
                if isCompleted {
                    Image(systemName: "checkmark")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundStyle(.white)
                } else {
                    Text("\(number)")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundStyle(.primary)
                }
            }
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                
                Text(description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            
            Spacer()
        }
    }
    
    // MARK: - Actions
    private func loadConfiguration() {
        // Load saved configuration or set defaults
        if serverUrl.isEmpty {
            serverUrl = AppConfig.defaultServerURL
        }
        if apiKey.isEmpty {
            // Load from UserDefaults if available
            apiKey = UserDefaults.standard.string(forKey: "apiKey") ?? ""
        }
    }
    
    private func testConfiguration() {
        guard !serverUrl.isEmpty else {
            alertMessage = "Please enter a server URL"
            showingAlert = true
            return
        }
        
        guard !apiKey.isEmpty else {
            alertMessage = "Please enter an API key"
            showingAlert = true
            return
        }
        
        guard notificationManager.deviceToken != nil else {
            alertMessage = "Device token not available. Please restart the app and ensure notifications are enabled."
            showingAlert = true
            return
        }
        
        isLoading = true
        
        // Send test notification through the server
        notificationManager.sendTestNotificationThroughServer(
            serverUrl: serverUrl,
            apiKey: apiKey
        ) { success, message in
            DispatchQueue.main.async {
                isLoading = false
                alertMessage = message
                showingAlert = true
            }
        }
    }
    
    private func saveConfiguration() {
        // Save configuration to UserDefaults or similar
        UserDefaults.standard.set(serverUrl, forKey: "serverUrl")
        UserDefaults.standard.set(apiKey, forKey: "apiKey")
        
        // Update notification manager
        notificationManager.updateConfiguration(serverUrl: serverUrl, apiKey: apiKey)
        
        alertMessage = "Configuration saved successfully!"
        showingAlert = true
    }
}

// MARK: - Preview
#Preview {
    ConfigurationView()
        .environmentObject(NotificationManager())
}