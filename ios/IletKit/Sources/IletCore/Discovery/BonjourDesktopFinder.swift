import Foundation
import Network

/// Finds a paired PC through its Bonjour announcement (PROTOCOL.md section 6): it browses for
/// `_ilet._tcp`, keeps the services whose TXT `id` is the PC's, and looks up their addresses and
/// ports without connecting to them. Anyone on the network can announce anything, so only
/// addresses that a pairing code could name are returned, and the caller still checks the pin.
public struct BonjourDesktopFinder: DesktopFinding {
    public init() {}

    public func endpoints(of desktopID: UUID) async -> [DesktopEndpoint] {
        await BonjourSearch(desktopID: desktopID).run()
    }
}

/// One search. Its state changes only on its serial queue, where Network framework and DNS-SD
/// call back too, which is why it can be shared across tasks.
final class BonjourSearch: @unchecked Sendable {
    /// On a working network, the PC answers a query within a fraction of a second.
    private static let timeLimit = DispatchTimeInterval.seconds(3)
    /// After the first address, how long to wait for the PC's others (IPv6, another adapter).
    private static let lingering = DispatchTimeInterval.milliseconds(300)
    /// Anyone can announce the PC's ID, so only this many of its services are looked up.
    private static let maxServices = 4

    private let desktopID: UUID
    private let queue = DispatchQueue(label: "app.ilet.bonjour-search")
    private var browser: NWBrowser?
    private var resolution: ServiceResolution?
    private var serviceNames: Set<String> = []
    private var found: [DesktopEndpoint] = []
    private var continuation: CheckedContinuation<[DesktopEndpoint], Never>?
    private var isFinished = false

    init(desktopID: UUID) {
        self.desktopID = desktopID
    }

    /// Whether a TXT record names this PC: its `id`, compared as a UUID.
    static func announces(_ desktopID: UUID, in txt: NWTXTRecord) -> Bool {
        txt[ProtocolConstants.Discovery.deviceIDKey].flatMap(UUID.init(uuidString:)) == desktopID
    }

    /// The endpoints found before the time limit, or before the task is cancelled.
    func run() async -> [DesktopEndpoint] {
        await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                queue.async { self.start(continuation) }
            }
        } onCancel: {
            queue.async { self.finish() }
        }
    }

    private func start(_ continuation: CheckedContinuation<[DesktopEndpoint], Never>) {
        // Cancelled before it began.
        guard !isFinished else {
            continuation.resume(returning: found)
            return
        }
        self.continuation = continuation
        resolution = ServiceResolution(queue: queue) { [weak self] address, port in
            self?.add(DesktopEndpoint(address: address, port: port))
        }
        let browser = NWBrowser(
            for: .bonjourWithTXTRecord(
                type: ProtocolConstants.Discovery.serviceType,
                domain: ProtocolConstants.Discovery.domain),
            using: NWParameters())
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            self?.consider(results)
        }
        browser.stateUpdateHandler = { [weak self] state in
            self?.handle(state)
        }
        self.browser = browser
        browser.start(queue: queue)
        queue.asyncAfter(deadline: .now() + Self.timeLimit) { [weak self] in
            self?.finish()
        }
    }

    private func consider(_ results: Set<NWBrowser.Result>) {
        guard !isFinished, let resolution else {
            return
        }
        for result in results where serviceNames.count < Self.maxServices {
            guard case .bonjour(let txt) = result.metadata, Self.announces(desktopID, in: txt),
                case .service(let name, let type, let domain, let interface) = result.endpoint,
                serviceNames.insert(name).inserted
            else {
                continue
            }
            resolution.resolve(
                name: name, type: type, domain: domain, interfaceIndex: interface?.index)
        }
    }

    private func handle(_ state: NWBrowser.State) {
        switch state {
        case .failed(let error):
            Log.network.error(
                "Bonjour search failed: \(Self.summary(of: error), privacy: .public)")
            finish()
        case .waiting(let error):
            // For example while Local Network access is denied; the time limit ends the search.
            Log.network.error(
                "Bonjour search waiting: \(Self.summary(of: error), privacy: .public)")
        default:
            break
        }
    }

    private func add(_ endpoint: DesktopEndpoint) {
        guard !isFinished, LocalNetworkAddress.isAllowed(endpoint.address),
            ProtocolConstants.validPorts.contains(endpoint.port),
            found.count < ProtocolConstants.maxPairingAddresses, !found.contains(endpoint)
        else {
            return
        }
        found.append(endpoint)
        if found.count == 1 {
            queue.asyncAfter(deadline: .now() + Self.lingering) { [weak self] in
                self?.finish()
            }
        }
    }

    private func finish() {
        guard !isFinished else {
            return
        }
        isFinished = true
        browser?.cancel()
        browser = nil
        resolution?.cancel()
        resolution = nil
        Log.network.info("Bonjour search found \(self.found.count, privacy: .public) addresses")
        continuation?.resume(returning: found)
        continuation = nil
    }

    /// The kind of error and its code, as for every error in the log.
    private static func summary(of error: NWError) -> String {
        switch error {
        case .posix(let code):
            return "POSIX \(code.rawValue)"
        case .dns(let code):
            return "DNS \(code)"
        case .tls(let status):
            return "TLS \(status)"
        @unknown default:
            return "other"
        }
    }
}
