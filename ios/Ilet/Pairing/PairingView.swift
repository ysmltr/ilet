import IletCore
import SwiftUI
import UIKit

struct PairingView: View {
    @StateObject private var viewModel: PairingViewModel
    @Environment(\.dismiss) private var dismiss

    init(viewModel: PairingViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(Text("pairing.title"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("common.close") { dismiss() }
                    }
                }
        }
    }

    @ViewBuilder private var content: some View {
        switch viewModel.step {
        case .scanning:
            ScanStep(viewModel: viewModel)
        case .confirming(let payload):
            ConfirmStep(viewModel: viewModel, desktopName: payload.desktopName)
        case .pairing:
            ProgressView("pairing.inProgress")
        case .paired(let desktopName):
            ResultStep(
                systemImage: "checkmark.circle.fill", tint: .green,
                message: String(localized: "pairing.success \(desktopName)"),
                buttonTitle: "common.done"
            ) { dismiss() }
        case .failed(let message, let isSecurityWarning):
            if isSecurityWarning {
                SecurityWarningView()
            } else {
                ResultStep(
                    systemImage: "exclamationmark.triangle.fill", tint: .orange, message: message,
                    buttonTitle: "pairing.scanAgain"
                ) { viewModel.scanAgain() }
            }
        }
    }
}

private struct ScanStep: View {
    @ObservedObject var viewModel: PairingViewModel

    var body: some View {
        VStack(spacing: Layout.sectionSpacing) {
            switch viewModel.camera {
            case .checking:
                ProgressView()
            case .ready:
                QRScannerView(
                    onCode: { code in viewModel.scanned(code) },
                    onCameraUnavailable: { viewModel.cameraUnavailable() }
                )
                .aspectRatio(1, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: Layout.scannerCornerRadius))
                Text("pairing.scanHint")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            case .denied:
                Text("pairing.cameraDenied")
                    .multilineTextAlignment(.center)
                Button("common.openSettings", action: openSettings)
                    .buttonStyle(.borderedProminent)
            case .unavailable:
                Text("pairing.cameraUnavailable")
            }
        }
        .padding(Layout.screenPadding)
        .task { await viewModel.prepareCamera() }
    }

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            return
        }
        UIApplication.shared.open(url)
    }
}

private struct ConfirmStep: View {
    @ObservedObject var viewModel: PairingViewModel
    let desktopName: String

    var body: some View {
        Form {
            Section {
                Label(desktopName, systemImage: "desktopcomputer")
                    .font(.headline)
            } header: {
                Text("pairing.confirmQuestion")
            }
            Section {
                TextField("pairing.deviceName", text: $viewModel.deviceName)
                    .textInputAutocapitalization(.words)
            } header: {
                Text("pairing.deviceName")
            } footer: {
                Text("pairing.deviceNameFooter")
            }
            Section {
                Button("pairing.pair") {
                    Task { await viewModel.confirm() }
                }
                .disabled(!viewModel.canConfirm)
                Button("pairing.scanAgain") { viewModel.scanAgain() }
            }
        }
    }
}

private struct ResultStep: View {
    let systemImage: String
    let tint: Color
    let message: String
    let buttonTitle: LocalizedStringKey
    let action: @MainActor () -> Void

    var body: some View {
        VStack(spacing: Layout.sectionSpacing) {
            Image(systemName: systemImage)
                .font(.system(size: Layout.heroIconSize))
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            Text(message)
                .multilineTextAlignment(.center)
            Button(buttonTitle, action: action)
                .buttonStyle(.borderedProminent)
        }
        .padding(Layout.screenPadding)
    }
}
