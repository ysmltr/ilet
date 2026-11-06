import Foundation

/// Finds an address where a PC answers. All known addresses are tried at once; the first one
/// where both the pinned certificate and the PC's ID match wins. With a finder, the PC's
/// announcement is also looked for once no known address has answered for a second, and the
/// addresses it names are tried the same way (PROTOCOL.md section 6).
public struct EndpointResolver: Sendable {
    private enum Probe: Sendable {
        case reached(DesktopEndpoint)
        case failed(IletError)
    }

    /// A PC on the same network answers well within this, so the search, and its query on the
    /// network, is needed only when the PC's address has changed.
    static let defaultSearchDelay = Duration.seconds(1)

    private let client: any DesktopClient
    private let finder: (any DesktopFinding)?
    private let searchDelay: Duration

    public init(client: any DesktopClient, finder: (any DesktopFinding)? = nil) {
        self.init(client: client, finder: finder, searchDelay: Self.defaultSearchDelay)
    }

    init(client: any DesktopClient, finder: (any DesktopFinding)?, searchDelay: Duration) {
        self.client = client
        self.finder = finder
        self.searchDelay = searchDelay
    }

    public func resolve(
        desktopID: UUID, addresses: [String], port: Int
    ) async throws
        -> DesktopEndpoint
    {
        let known = addresses.map { DesktopEndpoint(address: $0, port: port) }
        return try await firstReached(among: known, expecting: desktopID, finder: finder).get()
    }

    /// Tries the endpoints at once, and with a finder also those of the PC's announcement.
    private func firstReached(
        among endpoints: [DesktopEndpoint], expecting desktopID: UUID,
        finder: (any DesktopFinding)?
    ) async -> Result<DesktopEndpoint, IletError> {
        await withTaskGroup(
            of: Probe.self, returning: Result<DesktopEndpoint, IletError>.self
        ) { group in
            for endpoint in endpoints {
                group.addTask { await probe(endpoint, expecting: desktopID) }
            }
            if let finder {
                group.addTask { await search(with: finder, for: desktopID, skipping: endpoints) }
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
    }

    /// Gives the known endpoints their head start, then tries those that the PC's announcement
    /// names. Only endpoints that a pairing code could name, and that were not tried already, are
    /// tried: the finder keeps to these rules too, but checking them here, right before any
    /// connection, keeps them true whatever a finder does.
    private func search(
        with finder: any DesktopFinding, for desktopID: UUID, skipping known: [DesktopEndpoint]
    ) async -> Probe {
        do {
            try await Task.sleep(for: searchDelay)
        } catch {
            return .failed(.cancelled)
        }
        let found = await finder.endpoints(of: desktopID).filter { endpoint in
            !known.contains(endpoint) && LocalNetworkAddress.isAllowed(endpoint.address)
                && ProtocolConstants.validPorts.contains(endpoint.port)
        }
        guard !found.isEmpty else {
            return .failed(.desktopUnreachable)
        }
        switch await firstReached(among: found, expecting: desktopID, finder: nil) {
        case .success(let endpoint):
            return .reached(endpoint)
        case .failure(let error):
            return .failed(error)
        }
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
