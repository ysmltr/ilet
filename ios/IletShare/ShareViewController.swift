import SwiftUI
import UIKit

/// The share sheet's entry point, named in Info.plist (`NSExtensionPrincipalClass`).
@objc(ShareViewController)
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        // Closing goes through Cancel or Done, which also let go of the upload session.
        isModalInPresentation = true
        let inputItems = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
        let model = ShareViewModel(
            attachments: inputItems.flatMap { $0.attachments ?? [] }, dependencies: .live(),
            onClose: { [weak self] cancelled in self?.close(cancelled: cancelled) })
        let host = UIHostingController(rootView: ShareView(model: model))
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
    }

    private func close(cancelled: Bool) {
        guard let context = extensionContext else {
            return
        }
        if cancelled {
            context.cancelRequest(withError: CocoaError(.userCancelled))
        } else {
            context.completeRequest(returningItems: nil)
        }
    }
}
