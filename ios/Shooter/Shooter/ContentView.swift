import SwiftUI

struct ContentView: View {
    @EnvironmentObject var notificationManager: NotificationManager
    @State private var showingConfigSheet = false
    @State private var showingAlert = false
    @State private var alertMessage = ""
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Header
                headerView
                
                // Content based on state
                if !notificationManager.isAuthorized {
                    // Permission request state
                    permissionRequestView
                } else if notificationManager.notifications.isEmpty {
                    // Empty state
                    emptyNotificationsView
                } else {
                    // Notifications list
                    notificationsListView
                }
            }
            .navigationTitle("🎯 SHOOTER")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showingConfigSheet = true
                    } label: {
                        Image(systemName: "gear")
                            .font(.title2)
                    }
                }
            }
            .sheet(isPresented: $showingConfigSheet) {
                ConfigurationView()
                    .environmentObject(notificationManager)
            }
            .alert("Info", isPresented: $showingAlert) {
                Button("OK") { }
            } message: {
                Text(alertMessage)
            }
            .onAppear {
                // Auto-setup for local development
                notificationManager.autoSetupForDevelopment()
            }
            .refreshable {
                // Pull to refresh
                await notificationManager.refreshNotifications()
            }
        }
    }
    
    // MARK: - Header View
    private var headerView: some View {
        VStack(spacing: 8) {
            HStack {
                // System status indicator
                HStack(spacing: 6) {
                    Circle()
                        .fill(notificationManager.isConnected ? .green : .red)
                        .frame(width: 8, height: 8)
                    Text(notificationManager.isConnected ? "Online" : "Offline")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                
                Spacer()
                
                // Last update time
                if let lastUpdate = notificationManager.lastUpdate {
                    Text("Updated \(lastUpdate, style: .relative)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal)
        }
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
    }
    
    // MARK: - Permission Request View
    private var permissionRequestView: some View {
        VStack(spacing: 30) {
            Spacer()
            
            VStack(spacing: 20) {
                Image(systemName: "bell.slash")
                    .font(.system(size: 80))
                    .foregroundStyle(.secondary)
                
                VStack(spacing: 8) {
                    Text("Enable Notifications")
                        .font(.title2)
                        .fontWeight(.semibold)
                    
                    Text("Allow SHOOTER to send you real-time notifications from Claude Code")
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                
                Button {
                    notificationManager.requestPermission()
                } label: {
                    Text("Enable Notifications")
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(.blue)
                        .cornerRadius(12)
                }
                .padding(.horizontal, 40)
            }
            
            Spacer()
        }
    }
    
    // MARK: - Empty Notifications View
    private var emptyNotificationsView: some View {
        VStack(spacing: 30) {
            Spacer()
            
            VStack(spacing: 20) {
                Image(systemName: "bell.badge")
                    .font(.system(size: 80))
                    .foregroundStyle(.secondary)
                
                VStack(spacing: 8) {
                    Text("No Notifications Yet")
                        .font(.title2)
                        .fontWeight(.semibold)
                    
                    Text("Notifications from Claude Code will appear here when hooks are triggered")
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                
                Button {
                    notificationManager.sendTestNotification()
                } label: {
                    HStack {
                        Image(systemName: "bell.fill")
                        Text("Send Test Notification")
                    }
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(.green)
                    .cornerRadius(12)
                }
                .padding(.horizontal, 40)
            }
            
            Spacer()
        }
    }
    
    // MARK: - Notifications List View
    private var notificationsListView: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(notificationManager.notifications) { notification in
                    NotificationCardView(notification: notification)
                }
            }
            .padding()
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(NotificationManager())
}