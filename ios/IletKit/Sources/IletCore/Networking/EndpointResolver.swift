import Foundation

/// Finds an address where a PC answers. All known addresses are tried at once; the first one
/// where both the pinned certificate and the PC's ID match wins.
public struct EndpointResolver: Sendable {
    private enum Probe: Sendable {
        case reached(DesktopEndpoint)
        case failed(IletError)
    }

    private let client: any DesktopClient

    public init(client: any DesktopClient) {
        self.client = client
    }

    public func resolve(
        desktopID: UUID, addresses: [String], port: Int
    ) async throws
        -> DesktopEndpoint
    {
        let result = await withTaskGroup(
            of: Probe.self, returning: Result<DesktopEndpoint, IletError>.self
        ) { group in
            for address in addresses {
                let endpoint = DesktopEndpoint(address: address, port: port)
                group.addTask { await probe(endpoint, expecting: desktopID) }
            }
            var failures: [IletError] = []
            for await outcome in group {
                switch outcome {
                case .reached(let endpoint):
                    group.cancelAll()
                    return .success(endpoint)
                case .failed(let error):
                    failures.append(error)
                }
            }
            return .failure(Self.mostImportant(of: failures))
        }
        return try result.get()
    }

    private func probe(_ endpoint: DesktopEndpoint, expecting desktopID: UUID) async -> Probe {
        do {
            let info = try await client.info(at: endpoint)
            guard info.protocolVersion == ProtocolConstants.protocolVersion else {
                return .failed(.unsupportedProtocolVersion(info.protocolVersion))
            }
            guard UUID(uuidString: info.deviceId) == desktopID else {
                return .failed(.wrongDesktop)
            }
            return .reached(endpoint)
        } catch let error as IletError {
            return .failed(error)
        } catch {
            return .failed(IletError(connectionError: error))
        }
    }

    /// A certificate mismatch is reported over everything else: the user must see the warning.
    private static func mostImportant(of failures: [IletError]) -> IletError {
        if failures.contains(.certificateMismatch) {
            return .certificateMismatch
        }
        for failure in failures {
            if case .unsupportedProtocolVersion = failure {
                return failure
            }
        }
        return failures.contains(.wrongDesktop) ? .wrongDesktop : .desktopUnreachable
    }
}
