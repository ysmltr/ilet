import AVFoundation
import SwiftUI
import UIKit

/// The camera preview; reports every QR code it sees.
struct QRScannerView: UIViewControllerRepresentable {
    let onCode: @MainActor (String) -> Void
    let onCameraUnavailable: @MainActor () -> Void

    func makeUIViewController(context: Context) -> QRScannerViewController {
        let controller = QRScannerViewController()
        controller.onCode = onCode
        controller.onCameraUnavailable = onCameraUnavailable
        return controller
    }

    func updateUIViewController(_ controller: QRScannerViewController, context: Context) {
        controller.onCode = onCode
        controller.onCameraUnavailable = onCameraUnavailable
    }
}

final class QRScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onCode: (@MainActor (String) -> Void)?
    var onCameraUnavailable: (@MainActor () -> Void)?

    private let camera = CameraSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        guard camera.configure(metadataDelegate: self) else {
            // Reported on the next turn of the run loop, not while SwiftUI is building views.
            Task { @MainActor [weak self] in self?.onCameraUnavailable?() }
            return
        }
        let preview = AVCaptureVideoPreviewLayer(session: camera.session)
        preview.videoGravity = .resizeAspectFill
        view.layer.addSublayer(preview)
        previewLayer = preview
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        camera.start()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        camera.stop()
    }

    nonisolated func metadataOutput(
        _ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        let code = metadataObjects
            .compactMap { $0 as? AVMetadataMachineReadableCodeObject }
            .first { $0.type == .qr }?
            .stringValue
        guard let code else {
            return
        }
        // CameraSession delivers metadata on the main queue.
        MainActor.assumeIsolated {
            onCode?(code)
        }
    }
}

/// Owns the capture session. Starting and stopping block, so they run on a private queue; the
/// session is documented as safe to use from that queue, which is why this class is Sendable.
private final class CameraSession: @unchecked Sendable {
    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "app.ilet.camera")

    /// Adds the back camera and a QR code detector. False when no camera can be used.
    @MainActor
    func configure(metadataDelegate: any AVCaptureMetadataOutputObjectsDelegate) -> Bool {
        guard let device = AVCaptureDevice.default(for: .video) else {
            return false
        }
        let input: AVCaptureDeviceInput
        do {
            input = try AVCaptureDeviceInput(device: device)
        } catch {
            return false
        }
        let output = AVCaptureMetadataOutput()
        guard session.canAddInput(input), session.canAddOutput(output) else {
            return false
        }
        session.addInput(input)
        session.addOutput(output)
        output.setMetadataObjectsDelegate(metadataDelegate, queue: .main)
        output.metadataObjectTypes = [.qr]
        return true
    }

    func start() {
        queue.async { [self] in
            if !session.isRunning {
                session.startRunning()
            }
        }
    }

    func stop() {
        queue.async { [self] in
            if session.isRunning {
                session.stopRunning()
            }
        }
    }
}
