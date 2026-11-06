import IletCore
import PhotosUI
import SwiftUI

struct HomeView: View {
    @ObservedObject var desktops: DesktopsViewModel
    @ObservedObject var sender: SendViewModel
    @ObservedObject var receiver: ReceiveViewModel
    let makePairingViewModel: @MainActor () -> PairingViewModel

    /// How long the start screen stays at least, so it reads as a calm start and not as a flicker.
    private static let startScreenDuration = Duration.milliseconds(800)

    @State private var hasStarted = false
    @State private var isShowingInfo = false
    @State private var isPairing = false
    @State private var isImportingFiles = false
    @State private var pickedPhotos: [PhotosPickerItem] = []

    var body: some View {
        ZStack {
            if hasStarted {
                mainScreen
                    .transition(.opacity)
            } else {
                LaunchView()
                    .transition(.opacity)
            }
        }
        .task {
            // Loading before the switch means the welcome page never flashes up for a paired PC.
            desktops.reload()
            try? await Task.sleep(for: Self.startScreenDuration)
            withAnimation { hasStarted = true }
        }
    }

    private var mainScreen: some View {
        NavigationStack {
            Group {
                if let desktop = desktops.defaultDesktop {
                    SendList(
                        desktop: desktop, desktops: desktops, sender: sender, receiver: receiver,
                        pickedPhotos: $pickedPhotos, isImportingFiles: $isImportingFiles,
                        onPairAnother: { isPairing = true })
                } else {
                    WelcomeView { isPairing = true }
                        .navigationBarTitleDisplayMode(.inline)
                }
            }
            .navigationTitle(Text(verbatim: "ilet"))
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        isShowingInfo = true
                    } label: {
                        Label("info.title", systemImage: "info.circle")
                    }
                }
            }
        }
        .sheet(isPresented: $isShowingInfo) {
            InfoView()
        }
        .sheet(
            isPresented: $isPairing, onDismiss: { desktops.reload() },
            content: { PairingView(viewModel: makePairingViewModel()) }
        )
        .sheet(isPresented: isSecurityWarningPresented) {
            SecurityWarningSheet()
        }
        .alert(
            Text("error.title"),
            isPresented: Binding(
                get: { desktops.errorMessage != nil },
                set: { isPresented in
                    if !isPresented {
                        desktops.errorMessage = nil
                    }
                }),
            actions: { Button("common.ok") {} },
            message: { Text(desktops.errorMessage ?? "") }
        )
    }

    /// Sending and receiving show the same warning, and only once when both run into it.
    private var isSecurityWarningPresented: Binding<Bool> {
        Binding(
            get: { sender.isSecurityWarningPresented || receiver.isSecurityWarningPresented },
            set: { isPresented in
                if !isPresented {
                    sender.isSecurityWarningPresented = false
                    receiver.isSecurityWarningPresented = false
                }
            })
    }
}

/// When the receive list checks the PC: while ilet is in front, and for the selected PC.
private struct CheckSchedule: Equatable {
    let desktopID: UUID
    let isActive: Bool
}

/// Everything for sending to the selected PC and receiving from it, plus settings and the list of
/// PCs.
private struct SendList: View {
    let desktop: Desktop
    @ObservedObject var desktops: DesktopsViewModel
    @ObservedObject var sender: SendViewModel
    @ObservedObject var receiver: ReceiveViewModel
    @Binding var pickedPhotos: [PhotosPickerItem]
    @Binding var isImportingFiles: Bool
    let onPairAnother: () -> Void

    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        List {
            Section {
                PhotosPicker(
                    selection: $pickedPhotos, matching: .any(of: [.images, .videos]),
                    preferredItemEncoding: .current
                ) {
                    Label("home.sendPhotos", systemImage: "photo.on.rectangle")
                }
                Button {
                    isImportingFiles = true
                } label: {
                    Label("home.sendFiles", systemImage: "doc")
                }
            } header: {
                Text("home.sendTo \(desktop.name)")
            }
            if !sender.transfers.isEmpty {
                Section {
                    ForEach(sender.transfers) { transfer in
                        TransferRow(transfer: transfer)
                    }
                } header: {
                    HStack {
                        Text("home.transfers")
                        Spacer()
                        Button("home.clearFinished") { sender.clearFinished() }
                    }
                } footer: {
                    if sender.isPreparing {
                        Text("home.footer.preparing")
                    } else if sender.isSending {
                        Text("home.footer.background")
                    }
                }
            }
            ReceivedSection(receiver: receiver)
            Section {
                Toggle("settings.compatibleFormats", isOn: $sender.sendCompatibleFormats)
            } footer: {
                Text("settings.compatibleFormatsFooter")
            }
            DesktopsSection(viewModel: desktops, onPairAnother: onPairAnother)
        }
        .refreshable { [receiver, desktop] in
            await receiver.refresh(desktop)
        }
        .task(id: CheckSchedule(desktopID: desktop.id, isActive: scenePhase == .active)) {
            guard scenePhase == .active else {
                return
            }
            await receiver.keepChecking(desktop)
        }
        .alert(
            Text("error.title"),
            isPresented: Binding(
                get: { receiver.photosMessage != nil },
                set: { isPresented in
                    if !isPresented {
                        receiver.photosMessage = nil
                    }
                }),
            actions: { Button("common.ok") {} },
            message: { Text(receiver.photosMessage ?? "") }
        )
        .onChange(of: pickedPhotos) { items in
            guard !items.isEmpty else {
                return
            }
            pickedPhotos = []
            Task { await sender.send(items.map(TransferSource.photo), to: desktop) }
        }
        .fileImporter(
            isPresented: $isImportingFiles, allowedContentTypes: [.item],
            allowsMultipleSelection: true
        ) { result in
            switch result {
            case .success(let urls):
                Task { await sender.send(urls.map(TransferSource.file), to: desktop) }
            case .failure(let error as CocoaError) where error.code == .userCancelled:
                break
            case .failure(let error):
                sender.report(error)
            }
        }
    }
}
