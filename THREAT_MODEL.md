# ilet threat model

ilet moves files from an iPhone to a Windows PC on the same local network, **without a
confirmation dialog on the PC**. That convenience is the main security risk: anything a paired
device sends lands on the PC's disk. This document lists what we protect, from whom, and how.
It is reviewed against the code in Phase 7.

The wire protocol is specified in [PROTOCOL.md](PROTOCOL.md).

## 1. System overview

| Component                  | Role                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Desktop app (Electron)     | HTTPS server on the LAN. Stores its TLS identity, paired devices and settings. Writes received files into the receive folder. |
| iOS app                    | Scans the pairing QR code, stores the access token, sends photos and files.               |
| iOS Share Extension        | Sends files from the share sheet to the default PC with a background upload.              |

### 1.1 Data flows

1. **Pairing:** the desktop screen shows a QR code → the phone camera reads it → the phone calls
   `POST /api/v1/pair` over pinned HTTPS.
2. **Upload:** the phone calls `POST /api/v1/files` over pinned HTTPS with its access token.
3. **Discovery:** the desktop advertises `_ilet._tcp` over mDNS; the phone uses it to find the
   PC's new address.

### 1.2 Trust boundaries

| ID  | Boundary                                                                              |
| --- | ------------------------------------------------------------------------------------- |
| TB1 | The local network between phone and PC. Untrusted: shared Wi-Fi, other devices, spoofing. |
| TB2 | Received bytes → the PC's file system and Windows shell. Received files are untrusted content. |
| TB3 | The QR code on the screen. Anyone who can see the screen during pairing can read it.  |
| TB4 | Other apps on the iPhone and other processes on the PC.                               |
| TB5 | Web browsers on the PC or LAN. Web pages can send requests to LAN addresses.           |

## 2. Assets

| ID  | Asset                                         | Why it matters                                           |
| --- | --------------------------------------------- | -------------------------------------------------------- |
| A1  | Content of transferred files                  | Photos are very personal (faces, documents, locations)   |
| A2  | Desktop TLS private key                       | With it, an attacker can impersonate the PC and receive the user's photos |
| A3  | Access tokens                                 | With one, anyone can write files to the PC               |
| A4  | Pairing secret                                | With it, an attacker can obtain an access token          |
| A5  | Integrity of the PC and the user account      | Files outside the receive folder, Windows credentials (NTLM hashes) |
| A6  | Availability                                  | Disk space, the desktop app staying responsive           |
| A7  | Metadata                                      | Device names, IP addresses, the fact that ilet is running |

## 3. Adversaries

| ID   | Adversary                                                                                 |
| ---- | ----------------------------------------------------------------------------------------- |
| ADV1 | Passive observer on the same network (records traffic)                                    |
| ADV2 | Active attacker on the same network: ARP or DHCP spoofing, rogue access point, fake mDNS services, man-in-the-middle |
| ADV3 | Malicious web page opened in a browser on the PC or another LAN device (CSRF, DNS rebinding) |
| ADV4 | Someone who sees the screen during pairing (shoulder surfing, screen sharing, a camera)   |
| ADV5 | Malicious app on the iPhone (URL scheme or pasteboard injection)                          |
| ADV6 | A paired device that is lost, stolen, compromised or malicious                            |
| ADV7 | Internet attacker, if the port is ever reachable from outside (port forwarding, UPnP, public network) |

**Out of scope:** malware already running as the same Windows user (it can call DPAPI and read
every file anyway), a jailbroken or compromised iOS, and physical access to an unlocked PC.

## 4. Threats and mitigations

### 4.1 Network

| ID  | Threat                                                     | Mitigation                                                                                                   | Phase |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----- |
| T1  | ADV1 reads files in transit                                | HTTPS only, no plaintext port. TLS 1.3 preferred; TLS 1.2 only with ECDHE + AEAD suites (forward secrecy).   | 1 |
| T2  | ADV2 impersonates the PC (man-in-the-middle) and receives the photos | Certificate pinning by SHA-256 fingerprint. The pin arrives out of band in the QR code, so there is no "trust on first use". A mismatch aborts before the token or any data is sent; no override. Also for background uploads. | 1 (server), 3, 5 |
| T3  | ADV2 advertises a fake `_ilet._tcp` service to redirect the phone | Discovery is only a hint for the address. The fingerprint must still match, so the worst case is a failed connection. | 4 |
| T4  | ADV3 makes the browser send requests to the PC (CSRF, DNS rebinding) | Requests with an `Origin` header are rejected. `Host` must be an IP literal or `localhost`, which defeats DNS rebinding. The self-signed certificate makes browsers fail the TLS handshake anyway, and the `Authorization` and custom headers would need a CORS preflight, which is never allowed. | 1 |
| T5  | ADV7 reaches the server from the internet                  | Connections from addresses outside local-network ranges are dropped before the TLS handshake. The firewall rule allows only the Private profile; on a Public network the app shows a warning. | 1, 6, 7 |
| T6  | ADV2/ADV7 exhausts connections (slowloris)                 | TLS handshake, header and idle timeouts; a connection limit; authentication before the body is read; error responses close the connection. | 1 |
| T7  | ADV2 replays a recorded upload                             | TLS prevents replay of recorded traffic.                                                                     | 1 |

### 4.2 Authentication and pairing

| ID  | Threat                                                     | Mitigation                                                                                                   | Phase |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----- |
| T8  | Guessing an access token                                   | 256-bit random tokens; constant-time hash comparison; per-address rate limit on failures.                    | 1 |
| T9  | Stealing tokens from the PC's disk                         | Only SHA-256 hashes are stored. A hash cannot be used to authenticate, and a 256-bit random value cannot be recovered from its hash. | 1 |
| T10 | Stealing the token from the phone                          | Keychain only (after first unlock, this device only), shared with the Share Extension through a Keychain access group. Never in UserDefaults, App Group files or logs. | 3, 5 |
| T11 | ADV4 reads the QR code and pairs first                     | The secret exists only after an explicit click, expires after 120 s, works once and is invalidated when the QR window closes. The desktop shows every new pairing, and the user can revoke it. | 2 |
| T12 | Guessing the pairing secret                                | 256-bit secret, single active secret, rate-limited failures.                                                 | 2 |
| T13 | ADV5 injects a fake pairing (attacker's address and fingerprint) | No URL scheme for pairing. The pairing payload is accepted only from the in-app camera scanner and is validated strictly. | 3 |
| T14 | A revoked device keeps sending                             | Revocation removes the token hash immediately and aborts that device's uploads in progress.                  | 1 (core), 6 (UI) |
| T15 | Stealing the TLS private key from the PC's disk            | The key is encrypted with Electron `safeStorage` (DPAPI, bound to the Windows user). The app refuses to store it if encryption is unavailable. On load, the key must match the certificate. | 1 |

### 4.3 Received files (the PC's file system and shell)

| ID  | Threat                                                     | Mitigation                                                                                                   | Phase |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----- |
| T16 | Path traversal (`..\..\Windows\evil.dll`)                  | The client's name is never trusted: only the last path segment is kept, separators and invalid characters are replaced, and the final path must be a direct child of the receive folder (assertion). | 1 |
| T17 | Windows name tricks: device names (`CON`, `NUL.txt`), alternate data streams (`a.jpg:evil`), trailing dots and spaces | Device names get a `_` prefix; `:` and other invalid characters are replaced; trailing dots and spaces are removed. | 1 |
| T18 | Disguised file types (right-to-left override: `invoice‮gpj.exe` looks like `invoiceexe.jpg`), invisible characters | All Unicode control, format and line separator characters are removed; names are NFC-normalized. | 1 |
| T19 | Overwriting existing files                                 | The final name is claimed with an exclusive create (fails if anything exists), then ` (1)`, ` (2)`, … are tried. Nothing is ever replaced except the empty placeholder ilet just created. | 1 |
| T20 | A malicious executable or document is opened              | Every file gets Mark-of-the-Web (`Zone.Identifier`, ZoneId=3, Internet zone) before it appears under its final name, so SmartScreen and Office Protected View treat it like a browser download. ilet never opens or runs received files; the notification only reveals the file in Explorer. | 1, 6 |
| T21 | Passive credential leak: a `.url`, `.lnk`, `.scf`, `.library-ms`, `.searchConnector-ms`, `.theme` file or `desktop.ini` points its icon to `\\attacker\share`, and Windows sends the user's NTLM hash as soon as Explorer shows the folder | These types get `.txt` appended, so Explorer treats them as plain text. | 1 |
| T22 | Disk exhaustion                                            | Configurable maximum file size; free space check that keeps a reserve and counts uploads in progress; concurrent upload limit. | 1 |
| T23 | Partial or corrupted files                                 | Uploads stream to a `.part` file, the byte count is checked against `Content-Length`, then the file is renamed. Partial files are deleted on error, abort or revocation, and leftovers are removed at startup. | 1 |

### 4.4 Desktop application

| ID  | Threat                                                     | Mitigation                                                                                                   | Phase |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----- |
| T24 | Information leaks through errors or logs                   | Error bodies contain only a code. Logs never contain tokens, secrets, `Authorization` headers or file content; logged values are escaped so they cannot forge log lines. | 1 |
| T25 | A compromised renderer (XSS) reaches Node.js               | `contextIsolation`, `sandbox`, no `nodeIntegration`, minimal preload API with validated IPC, strict CSP, no remote content, navigation and new windows blocked. | 2, 6 |
| T26 | Code injection into the app binary (`ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, edited ASAR) | Electron fuses: RunAsNode and NODE_OPTIONS disabled, app loaded only from ASAR, ASAR integrity validation. Code signing later. | 7 |
| T27 | The dev-only token script ships in the product, or its token is used from the network | It is a separate entry point, compiled to a separate folder (`dist-dev/`) that the installer never includes; it uses a separate data folder, listens only on `127.0.0.1` and refuses to run in a packaged app. | 1 |
| T28 | Supply-chain attack through npm packages                   | No runtime dependencies on the desktop; dev tools justified in the README; exact versions and a committed lock file; install scripts disabled; only releases at least 14 days old. | 1 |

### 4.5 Privacy

| ID  | Threat                                                     | Mitigation                                                                                                   | Phase |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----- |
| T29 | Leaking information to the network                         | mDNS TXT records and `/api/info` contain only the device ID and display name (plus the protocol version). No accounts, cloud, analytics or tracking. | 1, 4 |
| T30 | iOS privacy rules                                          | Local network, Bonjour and camera usage descriptions; `PrivacyInfo.xcprivacy`; no third-party SDKs.          | 3 |

## 5. Security invariants

These must always be true. The Phase 7 review checks each one against the code.

1. Received data is never written outside the receive folder.
2. A received file never appears under its final name without Mark-of-the-Web.
3. Plaintext tokens and pairing secrets are never written to disk on the PC, and never logged on
   either side.
4. Every request except `GET /api/info` and `POST /api/v1/pair` is authenticated with a token
   before its body is read.
5. The phone never sends a token or file data to a server whose certificate fingerprint differs
   from the pin.
6. ilet never opens or executes a received file.
7. Existing files are never overwritten.

## 6. Accepted risks

| Risk                                                                                     | Why it is accepted                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A paired device can send any file type without confirmation.                             | This is the product's purpose. Mitigated by T19–T21, no auto-open and revocation. |
| A lost phone can send files until the user revokes it on the PC.                         | It can only add files; it cannot read anything from the PC.              |
| Someone who sees the QR code within 120 s could pair before the user.                    | Visible pairing confirmation and revocation (T11).                       |
| An active LAN attacker can block the connection (denial of service).                     | No application can prevent this on a shared network.                    |
| Per-address rate limits can be bypassed by changing IP addresses on the LAN.             | Guessing a 256-bit token or secret stays infeasible; the limit is defense in depth. |
| A user tricked into scanning an attacker's QR code pairs with the attacker's PC.         | The app shows the PC's name and the user chooses the default PC; this is social engineering. |
| TLS 1.2 is accepted (restricted suites).                                                 | Windows 10 tools such as curl cannot use TLS 1.3. The iPhone uses TLS 1.3, and TLS 1.3's downgrade protection prevents forcing it to 1.2. |
| Same-user malware can decrypt the TLS key through DPAPI.                                  | Out of scope (section 3).                                                |
