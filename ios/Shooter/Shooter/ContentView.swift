import AVFoundation
import SwiftUI
import WebKit

struct ContentView: View {
    @EnvironmentObject var notificationManager: NotificationManager

    var body: some View {
        WebView(url: serverURL, notificationManager: notificationManager)
            .ignoresSafeArea(edges: .bottom)
            .background(Color(red: 10/255, green: 10/255, blue: 10/255))
    }

    private var serverURL: URL {
        let saved = UserDefaults.standard.string(forKey: "serverUrl") ?? ""
        let urlString = saved.isEmpty ? AppConfig.defaultServerURL : saved
        return URL(string: urlString) ?? URL(string: AppConfig.defaultServerURL)!
    }
}

// MARK: - WKWebView Wrapper

struct WebView: UIViewRepresentable {
    let url: URL
    let notificationManager: NotificationManager

    func makeCoordinator() -> Coordinator {
        Coordinator(notificationManager: notificationManager)
    }

    /// Build the JavaScript source that creates window.ShooterBridge with current config values.
    private static func bridgeScript(serverUrl: String, apiKey: String, deviceToken: String) -> String {
        // Escape values for safe embedding in JS string literals
        let esc = { (s: String) -> String in
            s.replacingOccurrences(of: "\\", with: "\\\\")
             .replacingOccurrences(of: "'", with: "\\'")
             .replacingOccurrences(of: "\n", with: "\\n")
        }
        return """
        window.ShooterBridge = window.ShooterBridge || {};

        // Preserve any previously registered callbacks across bridge refreshes
        window.ShooterBridge._callbacks = window.ShooterBridge._callbacks || {};
        window.ShooterBridge._callbackId = window.ShooterBridge._callbackId || 0;

        window.ShooterBridge._config = {
            serverUrl: '\(esc(serverUrl))',
            apiKey: '\(esc(apiKey))',
            fcmToken: '\(esc(deviceToken))'
        };

        window.ShooterBridge.getConfig = function() { return JSON.stringify(this._config); };
        window.ShooterBridge.getFcmToken = function() { return this._config.fcmToken || ''; };
        window.ShooterBridge.getPlatform = function() { return 'ios'; };
        window.ShooterBridge.saveConfig = function(json) {
            window.webkit.messageHandlers.shooterBridge.postMessage(json);
        };

        // Generic native callback infrastructure — reusable for scanner, image picker, etc.
        window.handleNativeResponse = function(callbackId, jsonString) {
            var cb = window.ShooterBridge._callbacks[callbackId];
            if (cb) {
                delete window.ShooterBridge._callbacks[callbackId];
                try { cb(JSON.parse(jsonString)); } catch(e) { cb({ success: false, data: null, error: e.message }); }
            }
        };

        // Scanner namespace
        window.ShooterBridge.scanner = {
            scan: function() {
                return new Promise(function(resolve, reject) {
                    var id = 'cb_' + (++window.ShooterBridge._callbackId);
                    window.ShooterBridge._callbacks[id] = function(result) {
                        if (result.success) { resolve(result.data); } else { reject(new Error(result.error || 'cancelled')); }
                    };
                    window.webkit.messageHandlers.requestScanner.postMessage({ callbackId: id });
                });
            }
        };
        """
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true

        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs

        // Inject ShooterBridge at document start so it's available before onMount
        let serverUrl = UserDefaults.standard.string(forKey: "serverUrl") ?? ""
        let apiKey = KeychainHelper.read(key: "apiKey") ?? ""
        let deviceToken = notificationManager.deviceToken ?? ""

        let bridgeJS = Self.bridgeScript(serverUrl: serverUrl, apiKey: apiKey, deviceToken: deviceToken)
        let userScript = WKUserScript(source: bridgeJS, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        config.userContentController.addUserScript(userScript)

        // Handle saveConfig calls from JavaScript
        config.userContentController.add(context.coordinator, name: "shooterBridge")
        // Handle native feature requests (scanner, future: image picker, etc.)
        config.userContentController.add(context.coordinator, name: "requestScanner")

        let webView = WKWebView(frame: .zero, configuration: config)
        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.customUserAgent = "ShooterApp/1.0 \(webView.value(forKey: "userAgent") as? String ?? "")"
        // Match web dashboard background (#0a0a0a) to prevent white flash
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 10/255, green: 10/255, blue: 10/255, alpha: 1)
        webView.scrollView.backgroundColor = UIColor(red: 10/255, green: 10/255, blue: 10/255, alpha: 1)

        // Enable pull-to-refresh
        let refreshControl = UIRefreshControl()
        refreshControl.addTarget(
            context.coordinator,
            action: #selector(Coordinator.handleRefresh(_:)),
            for: .valueChanged
        )
        webView.scrollView.refreshControl = refreshControl

        context.coordinator.webView = webView

        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // Only reload if the URL has actually changed
        if webView.url?.absoluteString != url.absoluteString {
            webView.load(URLRequest(url: url))
        }
    }

    class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        weak var webView: WKWebView?
        let notificationManager: NotificationManager

        init(notificationManager: NotificationManager) {
            self.notificationManager = notificationManager
        }

        @objc func handleRefresh(_ refreshControl: UIRefreshControl) {
            webView?.reload()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                refreshControl.endRefreshing()
            }
        }

        // MARK: - WKScriptMessageHandler

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            switch message.name {
            case "shooterBridge":
                handleSaveConfig(message)
            case "requestScanner":
                handleRequestScanner(message)
            default:
                break
            }
        }

        // MARK: - saveConfig handler

        private func handleSaveConfig(_ message: WKScriptMessage) {
            guard let jsonString = message.body as? String,
                  let data = jsonString.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return }

            if let serverUrl = obj["serverUrl"] as? String {
                UserDefaults.standard.set(serverUrl, forKey: "serverUrl")
            }
            if let apiKey = obj["apiKey"] as? String {
                KeychainHelper.save(key: "apiKey", value: apiKey)
            }
            print("[ShooterBridge] saveConfig: serverUrl=\(obj["serverUrl"] ?? "nil"), apiKey=\((obj["apiKey"] as? String)?.isEmpty == false ? "(set)" : "(empty)")")
        }

        // MARK: - QR Scanner handler

        private func handleRequestScanner(_ message: WKScriptMessage) {
            guard let body = message.body as? [String: Any],
                  let callbackId = body["callbackId"] as? String else { return }

            // Check camera permission before presenting
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized:
                presentQRScanner(callbackId: callbackId)
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                    DispatchQueue.main.async {
                        if granted {
                            self?.presentQRScanner(callbackId: callbackId)
                        } else {
                            self?.sendNativeResponse(callbackId: callbackId, success: false, data: nil, error: "camera_denied")
                        }
                    }
                }
            default:
                sendNativeResponse(callbackId: callbackId, success: false, data: nil, error: "camera_denied")
            }
        }

        private func presentQRScanner(callbackId: String) {
            let scanner = QRScannerViewController()
            scanner.modalPresentationStyle = .fullScreen
            scanner.onResult = { [weak self] scannedData in
                if let data = scannedData {
                    self?.sendNativeResponse(callbackId: callbackId, success: true, data: data, error: nil)
                } else {
                    self?.sendNativeResponse(callbackId: callbackId, success: false, data: nil, error: "cancelled")
                }
            }

            guard let rootVC = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .flatMap({ $0.windows })
                .first(where: { $0.isKeyWindow })?
                .rootViewController else { return }

            // Walk to the topmost presented controller
            var topVC = rootVC
            while let presented = topVC.presentedViewController {
                topVC = presented
            }
            topVC.present(scanner, animated: true)
        }

        // MARK: - Native response dispatch

        /// Send a response back to JavaScript via the handleNativeResponse callback.
        /// This is the shared return channel for scanner, image picker, and any future native features.
        private func sendNativeResponse(callbackId: String, success: Bool, data: String?, error: String?) {
            // Build JSON payload — escape embedded strings for safety
            let escapedData = (data ?? "").replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
                .replacingOccurrences(of: "\n", with: "\\n")
            let escapedError = (error ?? "").replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")

            let payload: String
            if success {
                payload = "{\"success\":true,\"data\":\"\(escapedData)\",\"error\":null}"
            } else {
                payload = "{\"success\":false,\"data\":null,\"error\":\"\(escapedError)\"}"
            }

            let escapedCallbackId = callbackId.replacingOccurrences(of: "'", with: "\\'")
            // Must double-escape backslashes for JS string context:
            // payload contains \" (JSON escaping), but inside a JS string literal
            // \" is consumed by JS as just " — losing the escape.
            // Escaping \ to \\ first makes JS produce \", which JSON.parse handles.
            let escapedPayload = payload
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
            let script = "window.handleNativeResponse('\(escapedCallbackId)', '\(escapedPayload)');"
            webView?.evaluateJavaScript(script) { _, jsError in
                if let jsError = jsError {
                    print("[ShooterBridge] JS callback error: \(jsError.localizedDescription)")
                }
            }
        }

        // MARK: - WKNavigationDelegate

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.scrollView.refreshControl?.endRefreshing()

            // Refresh bridge config with latest values (e.g. device token arrived after page start)
            let serverUrl = UserDefaults.standard.string(forKey: "serverUrl") ?? ""
            let apiKey = KeychainHelper.read(key: "apiKey") ?? ""
            let deviceToken = notificationManager.deviceToken ?? ""

            let updateJS = WebView.bridgeScript(serverUrl: serverUrl, apiKey: apiKey, deviceToken: deviceToken)
            webView.evaluateJavaScript(updateJS, completionHandler: nil)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            decisionHandler(.allow)
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(NotificationManager())
}
