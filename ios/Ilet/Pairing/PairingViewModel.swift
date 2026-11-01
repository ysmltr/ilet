import AVFoundation
import Foundation
import IletCore

@MainActor
final class PairingViewModel: ObservableObject {
    enum Camera: Equatable {
        case checking
        case ready
        case denied
        case unavailable
    }

    enum Step: Equatable {
        case scanning
        /// The user checks which PC the code belongs to before anything is sent.
        case confirming(PairingPayload)
        case pairing
        case paired(desktopName: String)
        case failed(message: String, isSecurityWarning: Bool)
    }

    @Published private(set) var camera = Camera.checking
    @Published private(set) var step = Step.scanning
    @Published var deviceName: String

    private let pairing: any Pairing

    init(pairing: any Pairing, suggestedDeviceName: String) {
        self.pairing = pairing
        deviceName = suggestedDeviceName
    }

    var canConfirm: Bool {
        !cleanDeviceName.isEmpty
    }

    func prepareCamera() async {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            camera = .ready
        case .notDetermined:
            camera = await AVCaptureDevice.requestAccess(for: .video) ? .ready : .denied
        default:
            camera = .denied
        }
    }

    func cameraUnavailable() {
        camera = .unavailable
    }

    /// The scanner reports the same code many times per second; only the first one counts.
    func scanned(_ code: String) {
        guard step == .scanning else {
            return
        }
        do {
            step = .confirming(try PairingPayload.parse(code))
        } catch {
            step = .failed(message: ErrorMessage.text(for: error), isSecurityWarning: false)
        }
    }

    func confirm() async {
        guard case .confirming(let payload) = step, canConfirm else {
            return
        }
        step = .pairing
        do {
            let desktop = try await pairing.pair(using: payload, deviceName: cleanDeviceName)
            step = .paired(desktopName: desktop.name)
        } catch {
            step = .failed(
                message: ErrorMessage.text(for: error),
                isSecurityWarning: error as? IletError == .certificateMismatch)
        }
    }

    func scanAgain() {
        step = .scanning
    }

    private var cleanDeviceName: String {
        String(
            deviceName.trimmingCharacters(in: .whitespacesAndNewlines)
                .prefix(ProtocolConstants.maxDisplayNameLength))
    }
}
