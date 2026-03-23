import AVFoundation
import AudioToolbox
import UIKit

/// Full-screen QR code scanner using AVFoundation camera capture.
/// Presents a live camera preview with a scanning overlay and close button.
/// Calls `onResult` with the scanned string (or nil if cancelled).
class QRScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {

    var onResult: ((String?) -> Void)?

    private var captureSession: AVCaptureSession?
    private var previewLayer: AVCaptureVideoPreviewLayer?

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        guard setupCaptureSession() else {
            showError("Camera is not available on this device.")
            return
        }
        setupPreviewLayer()
        setupOverlay()
        setupCloseButton()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        startRunning()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopRunning()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.layer.bounds
    }

    override var prefersStatusBarHidden: Bool { true }

    // MARK: - Capture session setup

    private func setupCaptureSession() -> Bool {
        let session = AVCaptureSession()

        guard let device = AVCaptureDevice.default(for: .video) else { return false }

        do {
            let input = try AVCaptureDeviceInput(device: device)
            guard session.canAddInput(input) else { return false }
            session.addInput(input)
        } catch {
            return false
        }

        let metadataOutput = AVCaptureMetadataOutput()
        guard session.canAddOutput(metadataOutput) else { return false }
        session.addOutput(metadataOutput)
        metadataOutput.setMetadataObjectsDelegate(self, queue: .main)
        metadataOutput.metadataObjectTypes = [.qr]

        captureSession = session
        return true
    }

    private func setupPreviewLayer() {
        guard let session = captureSession else { return }
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.frame = view.layer.bounds
        layer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(layer)
        previewLayer = layer
    }

    private func startRunning() {
        guard let session = captureSession, !session.isRunning else { return }
        DispatchQueue.global(qos: .userInitiated).async {
            session.startRunning()
        }
    }

    private func stopRunning() {
        guard let session = captureSession, session.isRunning else { return }
        session.stopRunning()
    }

    // MARK: - Overlay UI

    private func setupOverlay() {
        let overlayView = ScannerOverlayView(frame: view.bounds)
        overlayView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(overlayView)

        let label = UILabel()
        label.text = "Point at a QR code"
        label.textColor = .white
        label.font = .systemFont(ofSize: 16, weight: .medium)
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)

        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -80)
        ])
    }

    private func setupCloseButton() {
        let button = UIButton(type: .system)
        let config = UIImage.SymbolConfiguration(pointSize: 20, weight: .medium)
        button.setImage(UIImage(systemName: "xmark.circle.fill", withConfiguration: config), for: .normal)
        button.tintColor = .white
        button.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        button.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(button)

        NSLayoutConstraint.activate([
            button.widthAnchor.constraint(equalToConstant: 44),
            button.heightAnchor.constraint(equalToConstant: 44),
            button.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            button.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16)
        ])
    }

    // MARK: - Actions

    @objc private func closeTapped() {
        stopRunning()
        onResult?(nil)
        dismiss(animated: true)
    }

    private func showError(_ message: String) {
        let label = UILabel()
        label.text = message
        label.textColor = .white
        label.textAlignment = .center
        label.numberOfLines = 0
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 32),
            label.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -32)
        ])
    }

    // MARK: - AVCaptureMetadataOutputObjectsDelegate

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard let metadataObject = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let stringValue = metadataObject.stringValue else { return }

        // Haptic feedback on successful scan
        AudioServicesPlaySystemSound(SystemSoundID(kSystemSoundID_Vibrate))
        stopRunning()
        onResult?(stringValue)
        dismiss(animated: true)
    }
}

// MARK: - Scanner overlay with cutout

/// Draws a semi-transparent overlay with a clear square cutout in the center,
/// plus corner brackets to guide the user's aim.
private class ScannerOverlayView: UIView {

    private let cutoutSize: CGFloat = 250

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isUserInteractionEnabled = false
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }

        let cutout = CGRect(
            x: (bounds.width - cutoutSize) / 2,
            y: (bounds.height - cutoutSize) / 2,
            width: cutoutSize,
            height: cutoutSize
        )

        // Semi-transparent background
        ctx.setFillColor(UIColor.black.withAlphaComponent(0.5).cgColor)
        ctx.fill(bounds)

        // Clear cutout
        ctx.setBlendMode(.clear)
        ctx.fill(cutout)
        ctx.setBlendMode(.normal)

        // Corner brackets
        let bracketLength: CGFloat = 30
        let bracketWidth: CGFloat = 3
        let color = UIColor.white.cgColor
        ctx.setStrokeColor(color)
        ctx.setLineWidth(bracketWidth)
        ctx.setLineCap(.round)

        let corners: [(CGPoint, CGPoint, CGPoint)] = [
            // Top-left
            (CGPoint(x: cutout.minX, y: cutout.minY + bracketLength),
             CGPoint(x: cutout.minX, y: cutout.minY),
             CGPoint(x: cutout.minX + bracketLength, y: cutout.minY)),
            // Top-right
            (CGPoint(x: cutout.maxX - bracketLength, y: cutout.minY),
             CGPoint(x: cutout.maxX, y: cutout.minY),
             CGPoint(x: cutout.maxX, y: cutout.minY + bracketLength)),
            // Bottom-right
            (CGPoint(x: cutout.maxX, y: cutout.maxY - bracketLength),
             CGPoint(x: cutout.maxX, y: cutout.maxY),
             CGPoint(x: cutout.maxX - bracketLength, y: cutout.maxY)),
            // Bottom-left
            (CGPoint(x: cutout.minX + bracketLength, y: cutout.maxY),
             CGPoint(x: cutout.minX, y: cutout.maxY),
             CGPoint(x: cutout.minX, y: cutout.maxY - bracketLength)),
        ]

        for (start, corner, end) in corners {
            ctx.move(to: start)
            ctx.addLine(to: corner)
            ctx.addLine(to: end)
            ctx.strokePath()
        }
    }
}
