import SwiftUI
import UIKit

/// Opens ilet's page in the Settings app, where camera and Local Network access are allowed.
struct OpenSettingsButton: View {
    var body: some View {
        Button("common.openSettings") {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                return
            }
            UIApplication.shared.open(url)
        }
    }
}
