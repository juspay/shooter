import AVFoundation
import SwiftUI
import WebKit

extension Notification.Name {
    /// Posted by the WebView coordinator when the load fails. ContentView
    /// listens to flip `webViewLoadFailed` so a stale-but-non-empty
    /// serverUrl/apiKey no longer leaves the user stuck on the error
    /// page — needsPairing flips true and PairingView takes over.
    static let shooterWebViewLoadFailed = Notification.Name("ShooterWebViewLoadFailed")
}

struct ContentView: View {
    @EnvironmentObject var notificationManager: NotificationManager

    // Bumps when PairingView saves so the WebView reads fresh values
    // and re-instantiates with the new URL.
    @State private var pairingRevision: Int = 0

    // Set to true when the WebView reports a load failure (didFail or
    // didFailProvisionalNavigation). Forces needsPairing true so the
    // user can re-pair instead of being trapped on the error overlay.
    // Reset whenever PairingView appears.
    @State private var webViewLoadFailed: Bool = false

    // Last WebView failure surfaced in PairingView as a banner so users
    // know WHY they got booted back to pairing.
    @State private var lastWebViewError: String?

    var body: some View {
        Group {
            if needsPairing {
                PairingView(
                    lastError: lastWebViewError,
                    onPaired: {
                        pairingRevision += 1
                        webViewLoadFailed = false
                        lastWebViewError = nil
                    }
                )
            } else {
                WebView(url: serverURL, notificationManager: notificationManager)
                    .ignoresSafeArea(edges: .bottom)
                    .background(Color(red: 10/255, green: 10/255, blue: 10/255))
                    .id(pairingRevision)
            }
        }
        .sheet(item: Binding(
            get: { notificationManager.decideRequestId },
            set: { notificationManager.decideRequestId = $0 }
        )) { requestId in
            DecideView(requestId: requestId.value)
                .environmentObject(notificationManager)
        }
        .onReceive(NotificationCenter.default.publisher(for: .shooterWebViewLoadFailed)) { note in
            lastWebViewError = note.userInfo?["message"] as? String
            webViewLoadFailed = true
        }
    }

    private var needsPairing: Bool {
        _ = pairingRevision // force re-evaluate when pairing saves
        if webViewLoadFailed { return true }
        let savedUrl = UserDefaults.standard.string(forKey: "serverUrl") ?? ""
        let savedKey = KeychainHelper.read(key: "apiKey") ?? ""
        return savedUrl.isEmpty || savedKey.isEmpty
    }

    private var serverURL: URL {
        let saved = UserDefaults.standard.string(forKey: "serverUrl") ?? ""
        let urlString = saved.isEmpty ? AppConfig.defaultServerURL : saved
        return URL(string: urlString) ?? URL(string: AppConfig.defaultServerURL)!
    }
}

// MARK: - Pairing View (native fallback when WebView pairing is unavailable)
//
// Shown when serverUrl or apiKey are missing from UserDefaults / Keychain.
// Lets the user pair without relying on the WebView (which has been
// observed to silently fail to load on some builds). Pre-fills the URL
// with AppConfig.defaultServerURL so the user usually only needs to
// paste the API key.

struct PairingView: View {
    let lastError: String?
    let onPaired: () -> Void

    @State private var serverUrl: String = {
        let saved = UserDefaults.standard.string(forKey: "serverUrl") ?? ""
        return saved.isEmpty ? AppConfig.defaultServerURL : saved
    }()
    @State private var apiKey: String = KeychainHelper.read(key: "apiKey") ?? ""
    @State private var checking: Bool = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                if let lastError = lastError, !lastError.isEmpty {
                    Section {
                        Text(lastError)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } header: {
                        Text("Previous load failed")
                    }
                }
                Section {
                    TextField("Server URL", text: $serverUrl)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    SecureField("API Key", text: $apiKey)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } header: {
                    Text("Connect to your Shooter server")
                } footer: {
                    if let msg = errorMessage {
                        Text(msg).foregroundStyle(.red)
                    } else {
                        Text("Find your API key in ~/.shooter/.env on the host machine, or run `shooter setup` to print it.")
                    }
                }

                Section {
                    Button {
                        Task { await save() }
                    } label: {
                        HStack {
                            Spacer()
                            if checking {
                                ProgressView().controlSize(.small)
                                Text("  Connecting…")
                            } else {
                                Text("Connect")
                            }
                            Spacer()
                        }
                    }
                    .disabled(checking || serverUrl.isEmpty || apiKey.isEmpty)
                }
            }
            .navigationTitle("Pair Shooter")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @MainActor
    private func save() async {
        errorMessage = nil
        checking = true
        defer { checking = false }

        let trimmedUrl = serverUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)

        guard let healthUrl = URL(string: "\(trimmedUrl)/api/health") else {
            errorMessage = "Server URL doesn't parse as a URL"
            return
        }
        // URLSession.shared inherits a ~60s default timeout; an 8s ceiling
        // keeps the "Connecting…" state responsive when the URL is wrong.
        var request = URLRequest(url: healthUrl)
        request.timeoutInterval = 8
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                errorMessage = "Server returned HTTP \(http.statusCode) — check the URL."
                return
            }
        } catch {
            errorMessage = "Can't reach server: \(error.localizedDescription)"
            return
        }

        UserDefaults.standard.set(trimmedUrl, forKey: "serverUrl")
        KeychainHelper.save(key: "apiKey", value: trimmedKey)
        onPaired()
    }
}

// MARK: - Decide Screen
//
// Presented when the user taps the notification body OR the
// "Open in Shooter" action on a dynamic-options push. Fetches the
// full options list from /api/decide/<requestId> and renders a
// proper button per option — works for any option count, any label,
// and shows the full question text without the lock-screen 4-line
// truncation.

private struct DecidePayloadDTO: Decodable {
    let requestId: String
    let question: String
    let options: [OptionChoiceDTO]
    let responseKind: String
    let toolName: String?
}

private struct OptionChoiceDTO: Decodable, Identifiable {
    let id: String
    let label: String
    let hint: String?
}

private enum DecideLoadState {
    case loading
    case loaded(DecidePayloadDTO)
    case error(String)
}

struct DecideView: View {
    let requestId: String

    @EnvironmentObject var notificationManager: NotificationManager
    @Environment(\.dismiss) private var dismiss

    @State private var state: DecideLoadState = .loading
    @State private var submitting = false

    private var serverUrl: String {
        UserDefaults.standard.string(forKey: "serverUrl") ?? AppConfig.defaultServerURL
    }

    private var apiKey: String {
        KeychainHelper.read(key: "apiKey") ?? ""
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Decide")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Close") { dismiss() }
                    }
                }
        }
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        switch state {
        case .loading:
            ProgressView("Loading…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .error(let message):
            VStack(spacing: 16) {
                Text("Couldn't load")
                    .font(.headline)
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                Button("Retry") {
                    state = .loading
                    Task { await load() }
                }
                .buttonStyle(.borderedProminent)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding()
        case .loaded(let payload):
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let toolName = payload.toolName, !toolName.isEmpty {
                        Text(toolName)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .textCase(.uppercase)
                    }
                    Text(payload.question.isEmpty ? "Choose an option" : payload.question)
                        .font(.title3.weight(.semibold))

                    ForEach(payload.options) { option in
                        Button { submit(decision: option.id) } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(option.label)
                                    .font(.body.weight(.medium))
                                if let hint = option.hint, !hint.isEmpty {
                                    Text(hint)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(Color(white: 0.15))
                            )
                        }
                        .disabled(submitting)
                        .buttonStyle(.plain)
                    }
                }
                .padding()
            }
        }
    }

    @MainActor
    private func load() async {
        guard let url = URL(string: "\(serverUrl)\(AppConfig.Endpoints.decide)/\(requestId)") else {
            state = .error("Invalid server URL")
            return
        }
        guard !apiKey.isEmpty else {
            state = .error("No API key configured. Open Settings and re-scan the QR code.")
            return
        }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                state = .error("No HTTP response")
                return
            }
            if http.statusCode == 404 {
                state = .error("Request not found or already answered.")
                return
            }
            if !(200...299).contains(http.statusCode) {
                state = .error("Server returned HTTP \(http.statusCode)")
                return
            }
            let payload = try JSONDecoder().decode(DecidePayloadDTO.self, from: data)
            state = .loaded(payload)
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    private func submit(decision: String) {
        submitting = true
        notificationManager.sendDecisionResponse(requestId: requestId, decision: decision)
        // Optimistic dismiss — NotificationManager retries with backoff if
        // the POST fails, so the user shouldn't have to wait for HTTP.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            dismiss()
        }
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
            print("[Shooter WebView] didFail: \(error.localizedDescription)")
            renderLoadError(in: webView, error: error)
            postLoadFailure(error: error)
        }

        // Fires when the initial network request fails (DNS, TLS,
        // connection refused, ATS, etc.) — the more common failure path
        // for a black-screen WebView. Previously this fired silently;
        // now we surface the error inline AND broadcast to ContentView
        // so it can route back to PairingView (otherwise a stale-but-
        // non-empty serverUrl would leave the user trapped on the error
        // overlay with no native recovery path).
        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            webView.scrollView.refreshControl?.endRefreshing()
            print("[Shooter WebView] didFailProvisionalNavigation: \(error.localizedDescription)")
            renderLoadError(in: webView, error: error)
            postLoadFailure(error: error)
        }

        private func postLoadFailure(error: Error) {
            let nsError = error as NSError
            let message = "\(nsError.domain) (\(nsError.code)): \(nsError.localizedDescription)"
            NotificationCenter.default.post(
                name: .shooterWebViewLoadFailed,
                object: nil,
                userInfo: ["message": message]
            )
        }

        // Escape a string for safe interpolation inside an HTML text node
        // or attribute value. The values rendered in the error overlay —
        // NSError.domain, .localizedDescription, and the failing URL —
        // can contain attacker-controlled content (e.g. a crafted
        // serverUrl from the pairing form). Without escaping, the
        // loadHTMLString below would allow script injection into a
        // context where the ShooterBridge JS bridge is still attached.
        private func htmlEscape(_ s: String) -> String {
            s.replacingOccurrences(of: "&", with: "&amp;")
                .replacingOccurrences(of: "<", with: "&lt;")
                .replacingOccurrences(of: ">", with: "&gt;")
                .replacingOccurrences(of: "\"", with: "&quot;")
                .replacingOccurrences(of: "'", with: "&#39;")
        }

        private func renderLoadError(in webView: WKWebView, error: Error) {
            let nsError = error as NSError
            let domain = htmlEscape(nsError.domain)
            let code = String(nsError.code) // integer — safe
            let description = htmlEscape(nsError.localizedDescription)
            let failingUrlRaw =
                (nsError.userInfo[NSURLErrorFailingURLStringErrorKey] as? String)
                ?? webView.url?.absoluteString
                ?? "unknown"
            let failingUrl = htmlEscape(failingUrlRaw)
            let html = """
            <!doctype html>
            <html><head><meta name=viewport content="width=device-width,initial-scale=1">
            <style>
              body{background:#0a0a0a;color:#eee;font:14px -apple-system,sans-serif;
                   margin:0;padding:24px;}
              h1{font-size:18px;margin:0 0 12px;}
              .box{background:#1a1a1a;border:1px solid #333;border-radius:8px;
                   padding:16px;margin-top:12px;}
              code{display:block;background:#000;padding:8px;border-radius:4px;
                   white-space:pre-wrap;word-break:break-all;font-size:12px;}
              .muted{color:#888;font-size:12px;margin-top:8px;}
            </style></head><body>
            <h1>Couldn't load Shooter</h1>
            <p>WKWebView reported a load failure:</p>
            <div class=box>
              <code>\(domain) (\(code))
            \(description)</code>
              <div class=muted>Failing URL: \(failingUrl)</div>
            </div>
            <p class=muted>Returning to the pairing screen so you can fix the server URL or API key.</p>
            </body></html>
            """
            webView.loadHTMLString(html, baseURL: nil)
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
